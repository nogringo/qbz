/**
 * Nostr Music Types
 *
 * Based on NIP for Music Tracks (kind 36787) and Playlists (kind 34139)
 */

import type { Event } from 'nostr-tools/pure';
import { naddrEncode } from 'nostr-tools/nip19';

// ============ Event Kinds ============

export const MUSIC_TRACK_KIND = 36787;
export const PLAYLIST_KIND = 34139;

// ============ Music Track (kind 36787) ============

/**
 * Raw Nostr event for a music track
 */
export interface NostrMusicTrackEvent extends Event {
  kind: typeof MUSIC_TRACK_KIND;
}

/**
 * Parsed music track from Nostr event
 */
export interface NostrMusicTrack {
  // Event metadata
  id: string;
  pubkey: string;
  createdAt: number;

  // Required fields
  d: string; // Unique identifier
  title: string;
  artist: string;
  url: string; // Direct URL to audio file (Blossom)

  // Optional fields
  alt?: string; // Human-readable description
  image?: string; // Album artwork URL
  video?: string; // Music video URL
  album?: string;
  trackNumber?: number;
  released?: string; // ISO 8601 date
  genres: string[]; // From 't' tags
  language?: string; // ISO 639-1
  explicit?: boolean;
  duration?: number; // Seconds
  format?: string; // mp3, flac, m4a, ogg
  bitrate?: string; // e.g., "320kbps"
  sampleRate?: number; // Hz
  zapSplits: ZapSplit[]; // Lightning addresses for zaps

  // Content (lyrics, credits)
  content: string;

  // naddr for referencing
  naddr: string;
}

export interface ZapSplit {
  address: string; // Lightning address
  weight?: number; // Split weight (optional)
}

// ============ Playlist (kind 34139) ============

/**
 * Raw Nostr event for a playlist
 */
export interface NostrPlaylistEvent extends Event {
  kind: typeof PLAYLIST_KIND;
}

/**
 * Parsed playlist from Nostr event
 */
export interface NostrPlaylist {
  // Event metadata
  id: string;
  pubkey: string;
  createdAt: number;

  // Required fields
  d: string; // Unique identifier
  title: string;
  alt: string; // Human-readable description

  // Optional fields
  description?: string;
  image?: string; // Playlist artwork
  isPublic: boolean;
  isPrivate: boolean;
  isCollaborative: boolean;
  categories: string[]; // From 't' tags

  // Track references (ordered)
  trackRefs: TrackReference[];

  // Content (playlist description)
  content: string;

  // naddr for referencing
  naddr: string;
}

/**
 * Reference to a track in a playlist
 * Format: 36787:<pubkey>:<d-tag>
 */
export interface TrackReference {
  kind: typeof MUSIC_TRACK_KIND;
  pubkey: string;
  dTag: string;
}

// ============ Helper Functions ============

/**
 * Parse a music track event into a NostrMusicTrack
 */
export function parseMusicTrackEvent(event: Event): NostrMusicTrack | null {
  if (event.kind !== MUSIC_TRACK_KIND) {
    return null;
  }

  const tags = new Map<string, string[]>();
  const multiTags = new Map<string, string[][]>();

  for (const tag of event.tags) {
    const [key, ...values] = tag;
    if (!tags.has(key)) {
      tags.set(key, values);
    }
    if (!multiTags.has(key)) {
      multiTags.set(key, []);
    }
    multiTags.get(key)!.push(values);
  }

  const d = tags.get('d')?.[0];
  const title = tags.get('title')?.[0];
  const artist = tags.get('artist')?.[0];
  const url = tags.get('url')?.[0];

  // Validate required fields
  if (!d || !title || !artist || !url) {
    console.warn('Missing required fields in music track event', event.id);
    return null;
  }

  // Parse genres from 't' tags
  const genres = (multiTags.get('t') || [])
    .map(t => t[0])
    .filter(t => t && t !== 'music');

  // Parse zap splits
  const zapSplits: ZapSplit[] = (multiTags.get('zap') || []).map(z => ({
    address: z[0],
    weight: z[1] ? parseInt(z[1], 10) : undefined
  }));

  // Build naddr
  const naddr = buildNaddr(MUSIC_TRACK_KIND, event.pubkey, d);

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    d,
    title,
    artist,
    url,
    alt: tags.get('alt')?.[0],
    image: tags.get('image')?.[0],
    video: tags.get('video')?.[0],
    album: tags.get('album')?.[0],
    trackNumber: tags.get('track_number')?.[0] ? parseInt(tags.get('track_number')![0], 10) : undefined,
    released: tags.get('released')?.[0],
    genres,
    language: tags.get('language')?.[0],
    explicit: tags.get('explicit')?.[0] === 'true',
    duration: tags.get('duration')?.[0] ? parseInt(tags.get('duration')![0], 10) : undefined,
    format: tags.get('format')?.[0],
    bitrate: tags.get('bitrate')?.[0],
    sampleRate: tags.get('sample_rate')?.[0] ? parseInt(tags.get('sample_rate')![0], 10) : undefined,
    zapSplits,
    content: event.content,
    naddr
  };
}

/**
 * Parse a playlist event into a NostrPlaylist
 */
export function parsePlaylistEvent(event: Event): NostrPlaylist | null {
  if (event.kind !== PLAYLIST_KIND) {
    return null;
  }

  const tags = new Map<string, string[]>();
  const multiTags = new Map<string, string[][]>();

  for (const tag of event.tags) {
    const [key, ...values] = tag;
    if (!tags.has(key)) {
      tags.set(key, values);
    }
    if (!multiTags.has(key)) {
      multiTags.set(key, []);
    }
    multiTags.get(key)!.push(values);
  }

  const d = tags.get('d')?.[0];
  const title = tags.get('title')?.[0];
  const alt = tags.get('alt')?.[0];

  // Validate required fields
  if (!d || !title || !alt) {
    console.warn('Missing required fields in playlist event', event.id);
    return null;
  }

  // Parse track references from 'a' tags
  const trackRefs: TrackReference[] = (multiTags.get('a') || [])
    .map(a => parseTrackReference(a[0]))
    .filter((ref): ref is TrackReference => ref !== null);

  // Parse categories from 't' tags
  const categories = (multiTags.get('t') || [])
    .map(t => t[0])
    .filter(t => t && t !== 'playlist');

  // Build naddr
  const naddr = buildNaddr(PLAYLIST_KIND, event.pubkey, d);

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    d,
    title,
    alt,
    description: tags.get('description')?.[0],
    image: tags.get('image')?.[0],
    isPublic: tags.get('public')?.[0] === 'true' || !tags.has('private'),
    isPrivate: tags.get('private')?.[0] === 'true',
    isCollaborative: tags.get('collaborative')?.[0] === 'true',
    categories,
    trackRefs,
    content: event.content,
    naddr
  };
}

/**
 * Parse a track reference string
 * Format: 36787:<pubkey>:<d-tag>
 */
function parseTrackReference(ref: string): TrackReference | null {
  const parts = ref.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [kindStr, pubkey, dTag] = parts;
  const kind = parseInt(kindStr, 10);

  if (kind !== MUSIC_TRACK_KIND) {
    return null;
  }

  return { kind, pubkey, dTag };
}

/**
 * Build naddr identifier using NIP-19 encoding
 */
function buildNaddr(kind: number, pubkey: string, dTag: string): string {
  return naddrEncode({
    kind,
    pubkey,
    identifier: dTag,
    relays: []
  });
}

/**
 * Create a track reference string for use in playlist 'a' tags
 */
export function createTrackReference(pubkey: string, dTag: string): string {
  return `${MUSIC_TRACK_KIND}:${pubkey}:${dTag}`;
}
