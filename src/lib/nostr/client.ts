/**
 * Nostr Client
 *
 * Handles connection to relays and fetching music events
 */

import { SimplePool } from 'nostr-tools/pool';
import type { Event, Filter } from 'nostr-tools';
import {
  MUSIC_TRACK_KIND,
  PLAYLIST_KIND,
  parseMusicTrackEvent,
  parsePlaylistEvent,
  type NostrMusicTrack,
  type NostrPlaylist,
  type TrackReference
} from './types';

// Default relays for music content
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social'
];

// Pool instance
let pool: SimplePool | null = null;
let connectedRelays: string[] = [];

/**
 * Initialize the Nostr pool and connect to relays
 */
export function initPool(relays: string[] = DEFAULT_RELAYS): SimplePool {
  if (!pool) {
    pool = new SimplePool();
  }
  connectedRelays = relays;
  return pool;
}

/**
 * Get the current pool instance
 */
export function getPool(): SimplePool {
  if (!pool) {
    return initPool();
  }
  return pool;
}

/**
 * Get connected relays
 */
export function getRelays(): string[] {
  return connectedRelays;
}

/**
 * Set custom relays
 */
export function setRelays(relays: string[]): void {
  connectedRelays = relays;
}

/**
 * Close the pool and all connections
 */
export function closePool(): void {
  if (pool) {
    pool.close(connectedRelays);
    pool = null;
  }
}

// ============ Fetch Functions ============

/**
 * Fetch music tracks by pubkey (artist)
 */
export async function fetchTracksByArtist(
  pubkey: string,
  limit: number = 50
): Promise<NostrMusicTrack[]> {
  const p = getPool();
  const filter: Filter = {
    kinds: [MUSIC_TRACK_KIND],
    authors: [pubkey],
    limit
  };

  const events = await p.querySync(connectedRelays, filter);
  return events
    .map(parseMusicTrackEvent)
    .filter((t): t is NostrMusicTrack => t !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Fetch a specific track by naddr components
 */
export async function fetchTrack(
  pubkey: string,
  dTag: string
): Promise<NostrMusicTrack | null> {
  const p = getPool();
  const filter: Filter = {
    kinds: [MUSIC_TRACK_KIND],
    authors: [pubkey],
    '#d': [dTag],
    limit: 1
  };

  const events = await p.querySync(connectedRelays, filter);
  if (events.length === 0) {
    return null;
  }

  return parseMusicTrackEvent(events[0]);
}

/**
 * Fetch multiple tracks by references
 */
export async function fetchTracksByRefs(
  refs: TrackReference[]
): Promise<NostrMusicTrack[]> {
  if (refs.length === 0) {
    return [];
  }

  const p = getPool();

  // Group refs by pubkey for efficient querying
  const refsByPubkey = new Map<string, string[]>();
  for (const ref of refs) {
    if (!refsByPubkey.has(ref.pubkey)) {
      refsByPubkey.set(ref.pubkey, []);
    }
    refsByPubkey.get(ref.pubkey)!.push(ref.dTag);
  }

  // Fetch all tracks
  const allTracks: NostrMusicTrack[] = [];

  for (const [pubkey, dTags] of refsByPubkey) {
    const filter: Filter = {
      kinds: [MUSIC_TRACK_KIND],
      authors: [pubkey],
      '#d': dTags
    };

    const events = await p.querySync(connectedRelays, filter);
    const tracks = events
      .map(parseMusicTrackEvent)
      .filter((t): t is NostrMusicTrack => t !== null);

    allTracks.push(...tracks);
  }

  // Reorder tracks to match original refs order
  const trackMap = new Map<string, NostrMusicTrack>();
  for (const track of allTracks) {
    const key = `${track.pubkey}:${track.d}`;
    trackMap.set(key, track);
  }

  return refs
    .map(ref => trackMap.get(`${ref.pubkey}:${ref.dTag}`))
    .filter((t): t is NostrMusicTrack => t !== undefined);
}

/**
 * Fetch playlists by pubkey (owner)
 */
export async function fetchPlaylistsByOwner(
  pubkey: string,
  limit: number = 50
): Promise<NostrPlaylist[]> {
  const p = getPool();
  const filter: Filter = {
    kinds: [PLAYLIST_KIND],
    authors: [pubkey],
    limit
  };

  const events = await p.querySync(connectedRelays, filter);
  return events
    .map(parsePlaylistEvent)
    .filter((pl): pl is NostrPlaylist => pl !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Fetch a specific playlist by naddr components
 */
export async function fetchPlaylist(
  pubkey: string,
  dTag: string
): Promise<NostrPlaylist | null> {
  const p = getPool();
  const filter: Filter = {
    kinds: [PLAYLIST_KIND],
    authors: [pubkey],
    '#d': [dTag],
    limit: 1
  };

  const events = await p.querySync(connectedRelays, filter);
  if (events.length === 0) {
    return null;
  }

  return parsePlaylistEvent(events[0]);
}

/**
 * Fetch a playlist with all its tracks
 */
export async function fetchPlaylistWithTracks(
  pubkey: string,
  dTag: string
): Promise<{ playlist: NostrPlaylist; tracks: NostrMusicTrack[] } | null> {
  const playlist = await fetchPlaylist(pubkey, dTag);
  if (!playlist) {
    return null;
  }

  const tracks = await fetchTracksByRefs(playlist.trackRefs);
  return { playlist, tracks };
}

/**
 * Search for tracks by text (searches title, artist, album)
 */
export async function searchTracks(
  query: string,
  limit: number = 50
): Promise<NostrMusicTrack[]> {
  const p = getPool();

  // Search in 't' tags for genres and in content
  const filter: Filter = {
    kinds: [MUSIC_TRACK_KIND],
    search: query,
    limit
  };

  try {
    const events = await p.querySync(connectedRelays, filter);
    return events
      .map(parseMusicTrackEvent)
      .filter((t): t is NostrMusicTrack => t !== null);
  } catch {
    // Search may not be supported by all relays
    // Fall back to fetching recent tracks
    console.warn('Search not supported, fetching recent tracks instead');
    return fetchRecentTracks(limit);
  }
}

/**
 * Fetch recent tracks from relays
 */
export async function fetchRecentTracks(
  limit: number = 50
): Promise<NostrMusicTrack[]> {
  const p = getPool();
  const filter: Filter = {
    kinds: [MUSIC_TRACK_KIND],
    limit
  };

  const events = await p.querySync(connectedRelays, filter);
  return events
    .map(parseMusicTrackEvent)
    .filter((t): t is NostrMusicTrack => t !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Fetch tracks by genre tag
 */
export async function fetchTracksByGenre(
  genre: string,
  limit: number = 50
): Promise<NostrMusicTrack[]> {
  const p = getPool();
  const filter: Filter = {
    kinds: [MUSIC_TRACK_KIND],
    '#t': [genre.toLowerCase()],
    limit
  };

  const events = await p.querySync(connectedRelays, filter);
  return events
    .map(parseMusicTrackEvent)
    .filter((t): t is NostrMusicTrack => t !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ============ Subscribe Functions ============

/**
 * Subscribe to new tracks in real-time
 */
export function subscribeToTracks(
  onTrack: (track: NostrMusicTrack) => void,
  filter?: Partial<Filter>
): () => void {
  const p = getPool();
  const fullFilter: Filter = {
    kinds: [MUSIC_TRACK_KIND],
    since: Math.floor(Date.now() / 1000),
    ...filter
  };

  const sub = p.subscribe(connectedRelays, fullFilter, {
    onevent(event: Event) {
      const track = parseMusicTrackEvent(event);
      if (track) {
        onTrack(track);
      }
    }
  });

  return () => sub.close();
}

/**
 * Subscribe to playlist updates
 */
export function subscribeToPlaylists(
  pubkey: string,
  onPlaylist: (playlist: NostrPlaylist) => void
): () => void {
  const p = getPool();
  const filter: Filter = {
    kinds: [PLAYLIST_KIND],
    authors: [pubkey],
    since: Math.floor(Date.now() / 1000)
  };

  const sub = p.subscribe(connectedRelays, filter, {
    onevent(event: Event) {
      const playlist = parsePlaylistEvent(event);
      if (playlist) {
        onPlaylist(playlist);
      }
    }
  });

  return () => sub.close();
}
