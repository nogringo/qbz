/**
 * Nostr Track Utilities
 *
 * Centralized conversion functions for Nostr tracks to backend types.
 * Used by all Nostr views for queue and playback integration.
 */

import type { NostrMusicTrack } from './types';
import { hashStringToNumber } from './adapters';
import type { BackendQueueTrack } from '$lib/stores/queueStore';
import type { PlayingTrack } from '$lib/stores/playerStore';

/**
 * Convert NostrMusicTrack to BackendQueueTrack for Rust backend queue
 */
export function nostrToBackendTrack(track: NostrMusicTrack): BackendQueueTrack {
  return {
    id: hashStringToNumber(track.id),
    title: track.title,
    artist: track.artist,
    album: track.album || '',
    duration_secs: track.duration || 0,
    artwork_url: track.image || null,
    hires: track.format === 'flac' || track.format === 'wav',
    bit_depth: null,
    sample_rate: track.sampleRate || null,
    is_local: false,
    audio_url: track.url,
    nostr_event_id: track.id,
    nostr_pubkey: track.pubkey
  };
}

/**
 * Convert NostrMusicTrack to PlayingTrack for playerStore
 */
export function nostrToPlayingTrack(track: NostrMusicTrack): PlayingTrack {
  return {
    id: hashStringToNumber(track.id),
    title: track.title,
    artist: track.artist,
    album: track.album || '',
    artwork: track.image || '',
    duration: track.duration || 0,
    quality: track.format?.toUpperCase() || 'Nostr',
    samplingRate: track.sampleRate,
    pubkey: track.pubkey,
    dTag: track.d,
    nostrEventId: track.id,
    audioUrl: track.url
  };
}

/**
 * Convert array of NostrMusicTrack to BackendQueueTrack array
 */
export function nostrTracksToBackendQueue(tracks: NostrMusicTrack[]): BackendQueueTrack[] {
  return tracks.map(nostrToBackendTrack);
}

/**
 * Get numeric IDs from Nostr tracks (for setNostrTrackIds)
 */
export function getNostrTrackIds(tracks: NostrMusicTrack[]): number[] {
  return tracks.map(t => hashStringToNumber(t.id));
}

/**
 * Add Nostr track to play next in queue
 */
export async function playNostrTrackNext(track: NostrMusicTrack): Promise<boolean> {
  const { addToQueueNext } = await import('$lib/stores/queueStore');
  return addToQueueNext(nostrToBackendTrack(track));
}

/**
 * Add Nostr track to end of queue
 */
export async function playNostrTrackLater(track: NostrMusicTrack): Promise<boolean> {
  const { addToQueue } = await import('$lib/stores/queueStore');
  return addToQueue(nostrToBackendTrack(track));
}
