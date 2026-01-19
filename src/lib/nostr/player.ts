/**
 * Nostr Audio Player
 *
 * Simple HTML5 Audio player for Blossom-hosted tracks
 * Handles playback, queue management, and MPRIS metadata sync
 *
 * Syncs with QBZ playerStore for NowPlayingBar integration
 */

import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { NostrMusicTrack } from './types';
import { nostrTrackToQueueTrack, type QueueTrack } from './adapters';
import {
  setCurrentTrack as setPlayerStoreTrack,
  setIsPlaying as setPlayerStoreIsPlaying,
  setCurrentTime as setPlayerStoreCurrentTime,
  setDuration as setPlayerStoreDuration,
  type PlayingTrack
} from '$lib/stores/playerStore';

// ============ PlayerStore Sync ============

/**
 * Convert QueueTrack to PlayingTrack for playerStore
 */
function queueTrackToPlayingTrack(track: QueueTrack): PlayingTrack {
  // Simple hash function for string to number ID
  const hashCode = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  };

  return {
    id: hashCode(track.id),
    title: track.title,
    artist: track.artist,
    album: track.album || 'Unknown Album',
    artwork: track.artwork || '',
    duration: track.duration,
    quality: 'Nostr',
    isLocal: false,
    pubkey: track.pubkey,
    dTag: track.dTag,
    nostrEventId: track.id
  };
}

/**
 * Sync current track to playerStore
 */
function syncTrackToPlayerStore(track: QueueTrack | null): void {
  if (track) {
    setPlayerStoreTrack(queueTrackToPlayingTrack(track));
  } else {
    setPlayerStoreTrack(null);
  }
}

// ============ Player State ============

interface PlayerState {
  currentTrack: QueueTrack | null;
  queue: QueueTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
}

let state: PlayerState = {
  currentTrack: null,
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.75,
  shuffle: false,
  repeat: 'off'
};

// HTML5 Audio element
let audio: HTMLAudioElement | null = null;

// Listeners
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Subscribe to player state changes
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

/**
 * Get current player state
 */
export function getState(): PlayerState {
  return { ...state };
}

// ============ Initialization ============

/**
 * Initialize the audio player
 */
export function initPlayer(): void {
  if (audio) return;

  audio = new Audio();
  audio.volume = state.volume;
  audio.preload = 'auto';

  // Throttle for playerStore sync (avoid too frequent updates)
  let lastSyncTime = 0;

  // Event listeners
  audio.addEventListener('timeupdate', () => {
    state.currentTime = audio!.currentTime;
    notifyListeners();

    // Sync to playerStore (throttled to every 500ms)
    const now = Date.now();
    if (now - lastSyncTime > 500) {
      lastSyncTime = now;
      setPlayerStoreCurrentTime(state.currentTime);
    }
  });

  audio.addEventListener('durationchange', () => {
    state.duration = audio!.duration || 0;
    notifyListeners();
    setPlayerStoreDuration(state.duration);
  });

  audio.addEventListener('ended', () => {
    handleTrackEnded();
  });

  audio.addEventListener('play', () => {
    state.isPlaying = true;
    notifyListeners();
    updateMprisPlaybackStatus('Playing');
    setPlayerStoreIsPlaying(true);
  });

  audio.addEventListener('pause', () => {
    state.isPlaying = false;
    notifyListeners();
    updateMprisPlaybackStatus('Paused');
    setPlayerStoreIsPlaying(false);
  });

  audio.addEventListener('error', (e) => {
    const mediaError = audio?.error;
    let errorMsg = 'Unknown error';
    if (mediaError) {
      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMsg = 'Playback aborted';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMsg = 'Network error - connection lost';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMsg = 'Decode error - audio format issue';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMsg = 'Source not supported - CORS or format issue';
          break;
      }
    }
    console.error('[NostrPlayer] Error:', errorMsg, mediaError);
    state.isPlaying = false;
    notifyListeners();
    setPlayerStoreIsPlaying(false);
  });

  // Additional debugging events
  audio.addEventListener('stalled', () => {
    console.warn('[NostrPlayer] Stalled - buffering issue');

    // If streaming fails, switch to blob fallback for this and future tracks
    if (!useBlobFallback && state.currentTrack && !blobUrlCache.has(state.currentTrack.audioUrl)) {
      console.log('[NostrPlayer] Stall detected, switching to blob fallback mode');
      useBlobFallback = true;
      // Reload current track with blob
      const currentTrack = state.currentTrack;
      audio?.pause();
      loadAndPlay(currentTrack);
    }
  });

  audio.addEventListener('waiting', () => {
    console.log('[NostrPlayer] Waiting for data...');
  });

  audio.addEventListener('abort', () => {
    console.warn('[NostrPlayer] Playback aborted');
  });

  console.log('[NostrPlayer] Initialized');
}

/**
 * Cleanup the player
 */
export function destroyPlayer(): void {
  if (audio) {
    audio.pause();
    audio.src = '';
    audio = null;
  }
  state = {
    currentTrack: null,
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.75,
    shuffle: false,
    repeat: 'off'
  };

  // Clear blob cache to free memory
  clearBlobCache();

  // Clear playerStore
  syncTrackToPlayerStore(null);
  setPlayerStoreIsPlaying(false);
}

// ============ Playback Controls ============

/**
 * Play a single track
 */
export async function playTrack(track: NostrMusicTrack): Promise<void> {
  if (!audio) initPlayer();

  const queueTrack = nostrTrackToQueueTrack(track);
  state.currentTrack = queueTrack;
  state.queue = [queueTrack];
  state.currentIndex = 0;

  await loadAndPlay(queueTrack);
}

/**
 * Set queue and play from index
 */
export async function setQueue(
  tracks: NostrMusicTrack[],
  startIndex: number = 0
): Promise<void> {
  if (!audio) initPlayer();

  state.queue = tracks.map(nostrTrackToQueueTrack);
  state.currentIndex = startIndex;

  if (state.queue.length > 0 && startIndex < state.queue.length) {
    state.currentTrack = state.queue[startIndex];
    await loadAndPlay(state.currentTrack);
  }
}

// Cache for blob URLs to avoid re-downloading
const blobUrlCache = new Map<string, string>();
const MAX_BLOB_CACHE_SIZE = 10; // Max number of cached blob URLs

// Track if we should use fallback (blob) mode
let useBlobFallback = false;

/**
 * Cleanup old blob URLs to prevent memory leaks
 */
function cleanupBlobCache(): void {
  if (blobUrlCache.size <= MAX_BLOB_CACHE_SIZE) return;

  // Remove oldest entries (first in map)
  const entries = Array.from(blobUrlCache.entries());
  const toRemove = entries.slice(0, blobUrlCache.size - MAX_BLOB_CACHE_SIZE);

  for (const [url, blobUrl] of toRemove) {
    URL.revokeObjectURL(blobUrl);
    blobUrlCache.delete(url);
    console.log('[NostrPlayer] Revoked old blob URL');
  }
}

/**
 * Clear all blob URLs from cache
 */
function clearBlobCache(): void {
  for (const blobUrl of blobUrlCache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  blobUrlCache.clear();
  console.log('[NostrPlayer] Cleared blob cache');
}

/**
 * Load and play a track
 */
async function loadAndPlay(track: QueueTrack): Promise<void> {
  if (!audio) return;

  console.log('[NostrPlayer] Loading:', track.title, '-', track.audioUrl);

  state.currentTrack = track;
  state.currentTime = 0;
  state.duration = track.duration;

  // Sync to playerStore for NowPlayingBar
  syncTrackToPlayerStore(track);
  setPlayerStoreDuration(track.duration);
  setPlayerStoreCurrentTime(0);
  notifyListeners();

  try {
    // Check cache first
    let blobUrl = blobUrlCache.get(track.audioUrl);

    if (blobUrl) {
      console.log('[NostrPlayer] Using cached audio');
      audio.src = blobUrl;
    } else if (!useBlobFallback) {
      // Try direct streaming first
      console.log('[NostrPlayer] Trying direct streaming...');
      audio.src = track.audioUrl;
    } else {
      // Use blob fallback
      console.log('[NostrPlayer] Fetching audio file via Tauri HTTP...');

      const response = await tauriFetch(track.audioUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(track.audioUrl, blobUrl);
      cleanupBlobCache(); // Prevent memory leaks

      console.log('[NostrPlayer] Audio loaded:', (blob.size / 1024 / 1024).toFixed(1), 'MB');
      audio.src = blobUrl;
    }

    await audio.play();
    await updateMprisMetadata(track);
    notifyListeners();
  } catch (err) {
    console.error('[NostrPlayer] Failed to play:', err);

    // If streaming failed, enable blob fallback for future tracks
    if (!useBlobFallback && !blobUrlCache.has(track.audioUrl)) {
      console.log('[NostrPlayer] Streaming failed, switching to blob fallback mode');
      useBlobFallback = true;
      // Retry with blob
      await loadAndPlay(track);
    }
  }
}

/**
 * Toggle play/pause
 */
export function togglePlay(): void {
  if (!audio) return;

  if (state.isPlaying) {
    audio.pause();
  } else {
    audio.play();
  }
}

/**
 * Play
 */
export function play(): void {
  if (!audio || !state.currentTrack) return;
  audio.play();
}

/**
 * Pause
 */
export function pause(): void {
  if (!audio) return;
  audio.pause();
}

/**
 * Stop
 */
export function stop(): void {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  state.isPlaying = false;
  state.currentTime = 0;
  notifyListeners();
  updateMprisPlaybackStatus('Stopped');
}

/**
 * Seek to position (seconds)
 */
export function seek(time: number): void {
  if (!audio) return;
  audio.currentTime = Math.max(0, Math.min(time, state.duration));
  state.currentTime = audio.currentTime;
  notifyListeners();
}

/**
 * Set volume (0-1)
 */
export function setVolume(volume: number): void {
  state.volume = Math.max(0, Math.min(1, volume));
  if (audio) {
    audio.volume = state.volume;
  }
  notifyListeners();
}

// ============ Queue Navigation ============

/**
 * Next track
 */
export async function next(): Promise<void> {
  if (state.queue.length === 0) return;

  let nextIndex = state.currentIndex + 1;

  if (nextIndex >= state.queue.length) {
    if (state.repeat === 'all') {
      nextIndex = 0;
    } else {
      // End of queue
      stop();
      return;
    }
  }

  state.currentIndex = nextIndex;
  state.currentTrack = state.queue[nextIndex];
  await loadAndPlay(state.currentTrack);
}

/**
 * Previous track
 */
export async function previous(): Promise<void> {
  if (state.queue.length === 0) return;

  // If more than 3 seconds in, restart current track
  if (state.currentTime > 3) {
    seek(0);
    return;
  }

  let prevIndex = state.currentIndex - 1;

  if (prevIndex < 0) {
    if (state.repeat === 'all') {
      prevIndex = state.queue.length - 1;
    } else {
      prevIndex = 0;
    }
  }

  state.currentIndex = prevIndex;
  state.currentTrack = state.queue[prevIndex];
  await loadAndPlay(state.currentTrack);
}

/**
 * Play track at index
 */
export async function playIndex(index: number): Promise<void> {
  if (index < 0 || index >= state.queue.length) return;

  state.currentIndex = index;
  state.currentTrack = state.queue[index];
  await loadAndPlay(state.currentTrack);
}

/**
 * Handle track ended
 */
function handleTrackEnded(): void {
  if (state.repeat === 'one') {
    seek(0);
    play();
    return;
  }

  next();
}

// ============ Shuffle & Repeat ============

/**
 * Toggle shuffle
 */
export function toggleShuffle(): boolean {
  state.shuffle = !state.shuffle;

  if (state.shuffle && state.queue.length > 1) {
    // Shuffle queue (keeping current track in place)
    const current = state.queue[state.currentIndex];
    const rest = state.queue.filter((_, i) => i !== state.currentIndex);

    // Fisher-Yates shuffle
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    state.queue = [current, ...rest];
    state.currentIndex = 0;
  }

  notifyListeners();
  return state.shuffle;
}

/**
 * Toggle repeat mode
 */
export function toggleRepeat(): 'off' | 'all' | 'one' {
  const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
  const currentIdx = modes.indexOf(state.repeat);
  state.repeat = modes[(currentIdx + 1) % modes.length];
  notifyListeners();
  return state.repeat;
}

// ============ MPRIS Integration ============

/**
 * Update MPRIS metadata
 */
async function updateMprisMetadata(track: QueueTrack): Promise<void> {
  try {
    await invoke('set_media_metadata', {
      title: track.title,
      artist: track.artist,
      album: track.album || 'Unknown Album',
      durationSecs: track.duration,
      coverUrl: track.artwork || null
    });
  } catch (err) {
    console.error('[NostrPlayer] Failed to update MPRIS metadata:', err);
  }
}

/**
 * Update MPRIS playback status
 */
async function updateMprisPlaybackStatus(status: 'Playing' | 'Paused' | 'Stopped'): Promise<void> {
  try {
    await invoke('set_playback_status', { status });
  } catch (err) {
    // Command might not exist, ignore
    console.debug('[NostrPlayer] set_playback_status not available');
  }
}

// ============ Utility ============

/**
 * Format duration as MM:SS
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
