/**
 * Nostr Adapters
 *
 * Converts Nostr music types to UI display types
 */

import type { NostrMusicTrack, NostrPlaylist } from './types';
import type { Track, DisplayTrack, PlaylistTrack } from '$lib/types';

// ============ Formatting Utilities ============

/**
 * Format duration in seconds to "M:SS" format
 */
export function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format quality string from track metadata
 */
export function formatQuality(track: NostrMusicTrack): string {
  if (track.bitrate) {
    return track.bitrate;
  }
  if (track.format) {
    const format = track.format.toUpperCase();
    if (format === 'FLAC' || format === 'WAV') {
      return 'Lossless';
    }
    return format;
  }
  return 'Standard';
}

/**
 * Get short npub for display
 */
export function shortNpub(pubkey: string): string {
  if (pubkey.length <= 16) return pubkey;
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}

// ============ Track Converters ============

/**
 * Convert NostrMusicTrack to Track (for album/artist views)
 */
export function nostrTrackToTrack(track: NostrMusicTrack, index: number = 0): Track {
  return {
    id: hashCode(track.id), // Convert string id to number
    number: track.trackNumber ?? index + 1,
    title: track.title,
    artist: track.artist,
    duration: formatDuration(track.duration),
    durationSeconds: track.duration ?? 0,
    quality: formatQuality(track),
    hires: track.format === 'flac' || track.format === 'wav',
    bitDepth: undefined, // Not in NIP spec yet
    samplingRate: track.sampleRate,
    albumId: track.album,
    artistId: hashCode(track.pubkey),
    isrc: undefined
  };
}

/**
 * Convert NostrMusicTrack to DisplayTrack (unified display)
 */
export function nostrTrackToDisplayTrack(track: NostrMusicTrack, index: number = 0): DisplayTrack {
  return {
    id: hashCode(track.id),
    number: track.trackNumber ?? index + 1,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArt: track.image,
    albumId: track.album,
    artistId: hashCode(track.pubkey),
    duration: formatDuration(track.duration),
    durationSeconds: track.duration ?? 0,
    hires: track.format === 'flac' || track.format === 'wav',
    bitDepth: undefined,
    samplingRate: track.sampleRate,
    isrc: undefined,
    isLocal: false
  };
}

/**
 * Convert NostrMusicTrack to PlaylistTrack (for playlist views)
 */
export function nostrTrackToPlaylistTrack(track: NostrMusicTrack, index: number = 0): PlaylistTrack {
  return {
    id: hashCode(track.id),
    number: index + 1,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArt: track.image,
    duration: formatDuration(track.duration),
    durationSeconds: track.duration ?? 0,
    hires: track.format === 'flac' || track.format === 'wav',
    bitDepth: undefined,
    samplingRate: track.sampleRate,
    albumId: track.album,
    artistId: hashCode(track.pubkey),
    isrc: undefined
  };
}

// ============ Extended Track Type for Nostr ============

/**
 * Extended track info with Nostr-specific data
 * Used internally for playback
 */
export interface NostrTrackInfo {
  // Display data (for UI)
  display: DisplayTrack;

  // Nostr data (for playback and references)
  nostr: {
    id: string;
    pubkey: string;
    dTag: string;
    audioUrl: string;
    videoUrl?: string;
    zapSplits: { address: string; weight?: number }[];
    naddr: string;
  };
}

/**
 * Convert NostrMusicTrack to NostrTrackInfo (full data)
 */
export function nostrTrackToTrackInfo(track: NostrMusicTrack, index: number = 0): NostrTrackInfo {
  return {
    display: nostrTrackToDisplayTrack(track, index),
    nostr: {
      id: track.id,
      pubkey: track.pubkey,
      dTag: track.d,
      audioUrl: track.url,
      videoUrl: track.video,
      zapSplits: track.zapSplits,
      naddr: track.naddr
    }
  };
}

// ============ Playlist Converters ============

/**
 * Playlist display info
 */
export interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  image?: string;
  ownerPubkey: string;
  ownerDisplay: string;
  trackCount: number;
  isPublic: boolean;
  isCollaborative: boolean;
  categories: string[];
  naddr: string;
}

/**
 * Convert NostrPlaylist to PlaylistInfo
 */
export function nostrPlaylistToPlaylistInfo(playlist: NostrPlaylist): PlaylistInfo {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description || playlist.alt,
    image: playlist.image,
    ownerPubkey: playlist.pubkey,
    ownerDisplay: shortNpub(playlist.pubkey),
    trackCount: playlist.trackRefs.length,
    isPublic: playlist.isPublic,
    isCollaborative: playlist.isCollaborative,
    categories: playlist.categories,
    naddr: playlist.naddr
  };
}

// ============ Helper Functions ============

/**
 * Simple hash function to convert string to number
 * Used for compatibility with existing UI components that expect numeric IDs
 */
export function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Alias for internal use
const hashCode = hashStringToNumber;

// ============ Queue/Playback Helpers ============

/**
 * Track info for the player queue
 */
export interface QueueTrack {
  id: string; // Nostr event ID
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  audioUrl: string;
  duration: number;
  pubkey: string;
  dTag: string;
}

/**
 * Convert NostrMusicTrack to QueueTrack
 */
export function nostrTrackToQueueTrack(track: NostrMusicTrack): QueueTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.image,
    audioUrl: track.url,
    duration: track.duration ?? 0,
    pubkey: track.pubkey,
    dTag: track.d
  };
}

/**
 * Convert array of NostrMusicTrack to QueueTrack array
 */
export function nostrTracksToQueue(tracks: NostrMusicTrack[]): QueueTrack[] {
  return tracks.map(nostrTrackToQueueTrack);
}
