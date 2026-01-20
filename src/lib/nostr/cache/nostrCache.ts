/**
 * Nostr Cache Service
 *
 * Provides TypeScript interface to the Rust SQLite cache via Tauri commands.
 */

import { invoke } from '@tauri-apps/api/core';
import type { NostrMusicTrack, NostrPlaylist, TrackReference } from '../types';
import type { NostrProfile } from '../client';

// ============ Cached Data Types (matching Rust structs) ============

export interface CachedProfile {
  pubkey: string;
  name: string | null;
  display_name: string | null;
  picture: string | null;
  about: string | null;
  nip05: string | null;
  created_at: number;
  fetched_at: number;
}

export interface CachedTrack {
  event_id: string;
  pubkey: string;
  d_tag: string;
  title: string;
  artist: string;
  album: string | null;
  url: string;
  image: string | null;
  duration: number | null;
  genres: string; // JSON array
  created_at: number;
  fetched_at: number;
}

export interface CachedPlaylist {
  event_id: string;
  pubkey: string;
  d_tag: string;
  title: string;
  description: string | null;
  image: string | null;
  is_public: boolean;
  track_refs: string; // JSON array
  created_at: number;
  fetched_at: number;
}

export interface CachedQuery {
  query_key: string;
  result_ids: string; // JSON array
  fetched_at: number;
  expires_at: number;
}

export interface CacheStats {
  profile_count: number;
  track_count: number;
  playlist_count: number;
  query_count: number;
}

// ============ Conversion Functions ============

/**
 * Convert NostrProfile to CachedProfile
 */
export function profileToCached(profile: NostrProfile, fetchedAt: number = Date.now()): CachedProfile {
  return {
    pubkey: profile.pubkey,
    name: profile.name ?? null,
    display_name: profile.displayName ?? null,
    picture: profile.picture ?? null,
    about: profile.about ?? null,
    nip05: profile.nip05 ?? null,
    created_at: Math.floor(Date.now() / 1000), // Approximate, profiles don't have created_at
    fetched_at: fetchedAt,
  };
}

/**
 * Convert CachedProfile to NostrProfile
 */
export function cachedToProfile(cached: CachedProfile): NostrProfile {
  return {
    pubkey: cached.pubkey,
    name: cached.name ?? undefined,
    displayName: cached.display_name ?? undefined,
    picture: cached.picture ?? undefined,
    about: cached.about ?? undefined,
    nip05: cached.nip05 ?? undefined,
  };
}

/**
 * Convert NostrMusicTrack to CachedTrack
 */
export function trackToCached(track: NostrMusicTrack, fetchedAt: number = Date.now()): CachedTrack {
  return {
    event_id: track.id,
    pubkey: track.pubkey,
    d_tag: track.d,
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
    url: track.url,
    image: track.image ?? null,
    duration: track.duration ?? null,
    genres: JSON.stringify(track.genres),
    created_at: track.createdAt,
    fetched_at: fetchedAt,
  };
}

/**
 * Convert CachedTrack to NostrMusicTrack (partial - missing some fields)
 * Note: This creates a minimal track suitable for display, but may lack naddr and other computed fields
 */
export function cachedToTrack(cached: CachedTrack): NostrMusicTrack {
  const MUSIC_TRACK_KIND = 36787;
  return {
    id: cached.event_id,
    pubkey: cached.pubkey,
    createdAt: cached.created_at,
    d: cached.d_tag,
    title: cached.title,
    artist: cached.artist,
    url: cached.url,
    album: cached.album ?? undefined,
    image: cached.image ?? undefined,
    duration: cached.duration ?? undefined,
    genres: JSON.parse(cached.genres) as string[],
    zapSplits: [],
    content: '',
    // Build naddr using btoa for browser compatibility
    // Note: This is a simplified placeholder - full naddr encoding happens in types.ts
    naddr: `naddr1${btoa(JSON.stringify({ k: MUSIC_TRACK_KIND, p: cached.pubkey, d: cached.d_tag })).replace(/[+/=]/g, '').slice(0, 50)}`,
  };
}

/**
 * Convert NostrPlaylist to CachedPlaylist
 */
export function playlistToCached(playlist: NostrPlaylist, fetchedAt: number = Date.now()): CachedPlaylist {
  // Convert TrackReference[] to string array for storage
  const trackRefStrings = playlist.trackRefs.map(ref => `${ref.kind}:${ref.pubkey}:${ref.dTag}`);

  return {
    event_id: playlist.id,
    pubkey: playlist.pubkey,
    d_tag: playlist.d,
    title: playlist.title,
    description: playlist.description ?? null,
    image: playlist.image ?? null,
    is_public: playlist.isPublic,
    track_refs: JSON.stringify(trackRefStrings),
    created_at: playlist.createdAt,
    fetched_at: fetchedAt,
  };
}

/**
 * Convert CachedPlaylist to NostrPlaylist (partial)
 */
export function cachedToPlaylist(cached: CachedPlaylist): NostrPlaylist {
  const MUSIC_TRACK_KIND = 36787;
  const PLAYLIST_KIND = 34139;

  // Parse track refs
  const trackRefStrings = JSON.parse(cached.track_refs) as string[];
  const trackRefs: TrackReference[] = trackRefStrings.map(ref => {
    const parts = ref.split(':');
    return {
      kind: MUSIC_TRACK_KIND,
      pubkey: parts[1],
      dTag: parts.slice(2).join(':'),
    };
  });

  return {
    id: cached.event_id,
    pubkey: cached.pubkey,
    createdAt: cached.created_at,
    d: cached.d_tag,
    title: cached.title,
    alt: `Playlist: ${cached.title}`,
    description: cached.description ?? undefined,
    image: cached.image ?? undefined,
    isPublic: cached.is_public,
    isPrivate: !cached.is_public,
    isCollaborative: false,
    categories: [],
    trackRefs,
    content: cached.description ?? '',
    // Build naddr using btoa for browser compatibility
    naddr: `naddr1${btoa(JSON.stringify({ k: PLAYLIST_KIND, p: cached.pubkey, d: cached.d_tag })).replace(/[+/=]/g, '').slice(0, 50)}`,
  };
}

// ============ Cache API (Tauri Commands) ============

// Profile cache
export async function getCachedProfile(pubkey: string): Promise<CachedProfile | null> {
  return invoke<CachedProfile | null>('nostr_cache_get_profile', { pubkey });
}

export async function setCachedProfile(profile: CachedProfile): Promise<void> {
  return invoke('nostr_cache_set_profile', { profile });
}

// Track cache
export async function getCachedTrack(pubkey: string, dTag: string): Promise<CachedTrack | null> {
  return invoke<CachedTrack | null>('nostr_cache_get_track', { pubkey, dTag });
}

export async function getCachedTracksByPubkey(pubkey: string): Promise<CachedTrack[]> {
  return invoke<CachedTrack[]>('nostr_cache_get_tracks_by_pubkey', { pubkey });
}

export async function getCachedRecentTracks(limit: number): Promise<CachedTrack[]> {
  return invoke<CachedTrack[]>('nostr_cache_get_recent_tracks', { limit });
}

export async function setCachedTrack(track: CachedTrack): Promise<void> {
  return invoke('nostr_cache_set_track', { track });
}

export async function setCachedTracks(tracks: CachedTrack[]): Promise<void> {
  return invoke('nostr_cache_set_tracks', { tracks });
}

// Playlist cache
export async function getCachedPlaylist(pubkey: string, dTag: string): Promise<CachedPlaylist | null> {
  return invoke<CachedPlaylist | null>('nostr_cache_get_playlist', { pubkey, dTag });
}

export async function getCachedPlaylistsByOwner(pubkey: string): Promise<CachedPlaylist[]> {
  return invoke<CachedPlaylist[]>('nostr_cache_get_playlists_by_owner', { pubkey });
}

export async function setCachedPlaylist(playlist: CachedPlaylist): Promise<void> {
  return invoke('nostr_cache_set_playlist', { playlist });
}

export async function deleteCachedPlaylist(pubkey: string, dTag: string): Promise<void> {
  return invoke('nostr_cache_delete_playlist', { pubkey, dTag });
}

// Query cache
export async function getCachedQuery(queryKey: string): Promise<CachedQuery | null> {
  return invoke<CachedQuery | null>('nostr_cache_get_query', { queryKey });
}

export async function setCachedQuery(query: CachedQuery): Promise<void> {
  return invoke('nostr_cache_set_query', { query });
}

// Maintenance
export async function getCacheStats(): Promise<CacheStats> {
  return invoke<CacheStats>('nostr_cache_get_stats');
}

export async function clearCache(): Promise<void> {
  return invoke('nostr_cache_clear');
}
