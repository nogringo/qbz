/**
 * Player State Store
 *
 * Manages playback state including current track, play/pause, position, volume.
 * Currently uses polling to sync with backend - designed to be replaced with
 * Tauri events in the future.
 */

import { invoke } from '@tauri-apps/api/core';

// ============ Types ============

export interface PlayingTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  quality: string;
  bitDepth?: number;
  samplingRate?: number;
  isLocal?: boolean;
}

interface BackendPlaybackState {
  is_playing: boolean;
  position: number;
  duration: number;
  track_id: number;
  volume: number;
}

// ============ State ============

let currentTrack: PlayingTrack | null = null;
let isPlaying = false;
let currentTime = 0;
let duration = 0;
let volume = 75;
let isFavorite = false;

// Polling state
let pollInterval: ReturnType<typeof setInterval> | null = null;
let isAdvancingTrack = false;
let isSkipping = false;
let queueEnded = false;

// Callbacks for track advancement (set by consumer)
let onTrackEnded: (() => Promise<void>) | null = null;

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
  listener(); // Immediately notify with current state
  return () => listeners.delete(listener);
}

// ============ Getters ============

export function getCurrentTrack(): PlayingTrack | null {
  return currentTrack;
}

export function getIsPlaying(): boolean {
  return isPlaying;
}

export function getCurrentTime(): number {
  return currentTime;
}

export function getDuration(): number {
  return duration;
}

export function getVolume(): number {
  return volume;
}

export function getIsFavorite(): boolean {
  return isFavorite;
}

export function getIsSkipping(): boolean {
  return isSkipping;
}

// ============ State Setter ============

export interface PlayerState {
  currentTrack: PlayingTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isFavorite: boolean;
  isSkipping: boolean;
}

export function getPlayerState(): PlayerState {
  return {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isFavorite,
    isSkipping
  };
}

// ============ Track Actions ============

/**
 * Set the current track (called when starting playback)
 */
export function setCurrentTrack(track: PlayingTrack | null): void {
  currentTrack = track;
  if (track) {
    duration = track.duration;
    currentTime = 0;
    queueEnded = false;
  } else {
    duration = 0;
    currentTime = 0;
  }
  notifyListeners();
}

/**
 * Set favorite status
 */
export function setIsFavorite(favorite: boolean): void {
  isFavorite = favorite;
  notifyListeners();
}

/**
 * Set skipping state (prevents concurrent skip operations)
 */
export function setIsSkipping(skipping: boolean): void {
  isSkipping = skipping;
  notifyListeners();
}

/**
 * Mark queue as ended (prevents spam when no more tracks)
 */
export function setQueueEnded(ended: boolean): void {
  queueEnded = ended;
}

// ============ Playback Controls ============

/**
 * Toggle play/pause
 */
export async function togglePlay(): Promise<void> {
  if (!currentTrack) return;

  const newIsPlaying = !isPlaying;
  isPlaying = newIsPlaying;
  notifyListeners();

  try {
    if (newIsPlaying) {
      await invoke('resume_playback');
    } else {
      await invoke('pause_playback');
    }
  } catch (err) {
    console.error('Failed to toggle playback:', err);
    // Revert on error
    isPlaying = !newIsPlaying;
    notifyListeners();
  }
}

/**
 * Set playing state directly
 */
export function setIsPlaying(playing: boolean): void {
  isPlaying = playing;
  notifyListeners();
}

/**
 * Seek to position
 */
export async function seek(position: number): Promise<void> {
  const clampedPosition = Math.max(0, Math.min(duration, position));
  currentTime = clampedPosition;
  notifyListeners();

  try {
    await invoke('seek', { position: Math.floor(clampedPosition) });
  } catch (err) {
    console.error('Failed to seek:', err);
  }
}

/**
 * Set volume (0-100)
 */
export async function setVolume(newVolume: number): Promise<void> {
  const clampedVolume = Math.max(0, Math.min(100, newVolume));
  volume = clampedVolume;
  notifyListeners();

  try {
    await invoke('set_volume', { volume: clampedVolume / 100 });
  } catch (err) {
    console.error('Failed to set volume:', err);
  }
}

/**
 * Stop playback
 */
export async function stop(): Promise<void> {
  try {
    await invoke('stop_playback');
    isPlaying = false;
    currentTrack = null;
    currentTime = 0;
    duration = 0;
    notifyListeners();
  } catch (err) {
    console.error('Failed to stop playback:', err);
  }
}

// ============ Polling ============

/**
 * Set callback for when track ends (for auto-advance)
 */
export function setOnTrackEnded(callback: () => Promise<void>): void {
  onTrackEnded = callback;
}

/**
 * Poll playback state from backend
 */
async function pollPlaybackState(): Promise<void> {
  if (!currentTrack) return;

  try {
    const state = await invoke<BackendPlaybackState>('get_playback_state');

    // Only update if we have a matching track
    if (state.track_id === currentTrack.id) {
      currentTime = state.position;
      isPlaying = state.is_playing;
      notifyListeners();

      // Check if track ended - auto-advance to next
      if (
        state.duration > 0 &&
        state.position >= state.duration - 1 &&
        !state.is_playing &&
        !isAdvancingTrack &&
        !queueEnded &&
        onTrackEnded
      ) {
        console.log('Track finished, advancing to next...');
        isAdvancingTrack = true;

        try {
          await onTrackEnded();
        } catch (err) {
          console.error('Failed to auto-advance:', err);
        } finally {
          isAdvancingTrack = false;
        }
      }
    }
  } catch (err) {
    console.error('Failed to poll playback state:', err);
  }
}

/**
 * Start polling for playback state
 */
export function startPolling(): void {
  if (pollInterval) return;

  pollInterval = setInterval(pollPlaybackState, 500);
  pollPlaybackState(); // Poll immediately
}

/**
 * Stop polling
 */
export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/**
 * Check if polling is active
 */
export function isPollingActive(): boolean {
  return pollInterval !== null;
}

// ============ Cleanup ============

/**
 * Reset all state (for logout)
 */
export function reset(): void {
  stopPolling();
  currentTrack = null;
  isPlaying = false;
  currentTime = 0;
  duration = 0;
  isFavorite = false;
  isAdvancingTrack = false;
  isSkipping = false;
  queueEnded = false;
  notifyListeners();
}
