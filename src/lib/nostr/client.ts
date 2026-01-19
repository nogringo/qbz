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

// Nostr kinds
const PROFILE_KIND = 0;
const CONTACT_LIST_KIND = 3;
const DELETION_KIND = 5; // NIP-09
const REACTION_KIND = 7;
const RELAY_LIST_KIND = 10002; // NIP-65

// Default relays for music content
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social'
];

// Profile type
export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

// NIP-65 Relay type
export interface Nip65Relay {
  url: string;
  read: boolean;
  write: boolean;
}

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
 * Fetch user profile (kind 0)
 */
export async function fetchProfile(pubkey: string): Promise<NostrProfile | null> {
  const p = getPool();
  const filter: Filter = {
    kinds: [PROFILE_KIND],
    authors: [pubkey],
    limit: 1
  };

  const events = await p.querySync(connectedRelays, filter);
  if (events.length === 0) {
    return null;
  }

  try {
    const content = JSON.parse(events[0].content);
    return {
      pubkey,
      name: content.name,
      displayName: content.display_name,
      picture: content.picture,
      about: content.about,
      nip05: content.nip05
    };
  } catch {
    return null;
  }
}

/**
 * Fetch user's NIP-65 relay list (kind 10002)
 */
export async function fetchNip65Relays(pubkey: string): Promise<Nip65Relay[]> {
  const p = getPool();
  const filter: Filter = {
    kinds: [RELAY_LIST_KIND],
    authors: [pubkey],
    limit: 1
  };

  const events = await p.querySync(connectedRelays, filter);
  if (events.length === 0) {
    return [];
  }

  // Parse relay tags from the event
  // Format: ["r", "wss://relay.example.com", "read"] or ["r", "wss://relay.example.com", "write"]
  // or just ["r", "wss://relay.example.com"] for both read and write
  const relays: Nip65Relay[] = [];

  for (const tag of events[0].tags) {
    if (tag[0] === 'r' && tag[1]) {
      const url = tag[1];
      const marker = tag[2]; // "read", "write", or undefined (both)

      relays.push({
        url,
        read: !marker || marker === 'read',
        write: !marker || marker === 'write'
      });
    }
  }

  return relays;
}

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

// ============ Contact List (Following) ============

/**
 * Fetch user's contact list (kind 3)
 * Returns array of followed pubkeys
 */
export async function fetchContactList(pubkey: string): Promise<string[]> {
  const p = getPool();
  const filter: Filter = {
    kinds: [CONTACT_LIST_KIND],
    authors: [pubkey],
    limit: 1
  };

  const events = await p.querySync(connectedRelays, filter);
  if (events.length === 0) {
    return [];
  }

  // Extract pubkeys from 'p' tags
  const followedPubkeys: string[] = [];
  for (const tag of events[0].tags) {
    if (tag[0] === 'p' && tag[1]) {
      followedPubkeys.push(tag[1]);
    }
  }

  return followedPubkeys;
}

/**
 * Check if user is following a specific pubkey
 */
export async function isFollowing(userPubkey: string, targetPubkey: string): Promise<boolean> {
  const following = await fetchContactList(userPubkey);
  return following.includes(targetPubkey);
}

/**
 * Publish updated contact list
 * Note: This replaces the entire contact list
 * NIP-65 compliant: publishes to user's write relays
 */
export async function publishContactList(followedPubkeys: string[]): Promise<void> {
  const { signEvent } = await import('./auth');
  const { getUserWriteRelays } = await import('$lib/stores/nostrSettingsStore');
  const p = getPool();

  // Build tags: [["p", pubkey], ["p", pubkey], ...]
  const tags: string[][] = followedPubkeys.map(pk => ['p', pk]);

  const event = await signEvent({
    kind: CONTACT_LIST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ''
  });

  // NIP-65: Publish to user's write relays
  const userWriteRelays = getUserWriteRelays();
  console.log('[Nostr] Publishing contact list to relays:', userWriteRelays);
  await Promise.all(userWriteRelays.map(relay => p.publish([relay], event)));
}

/**
 * Follow a pubkey (add to contact list)
 */
export async function followPubkey(userPubkey: string, targetPubkey: string): Promise<void> {
  const following = await fetchContactList(userPubkey);

  if (!following.includes(targetPubkey)) {
    following.push(targetPubkey);
    await publishContactList(following);
  }
}

/**
 * Unfollow a pubkey (remove from contact list)
 */
export async function unfollowPubkey(userPubkey: string, targetPubkey: string): Promise<void> {
  const following = await fetchContactList(userPubkey);
  const filtered = following.filter(pk => pk !== targetPubkey);

  if (filtered.length !== following.length) {
    await publishContactList(filtered);
  }
}

// ============ Reactions (Likes) ============

// Cache for liked tracks - avoids fetching from relays on every track change
let likedTracksCache: Set<string> | null = null;
let likedTracksCacheUserPubkey: string | null = null;

/**
 * Preload liked tracks cache for a user
 * Call this at startup for instant like status checks
 */
export async function preloadLikedTracks(userPubkey: string): Promise<void> {
  console.log('[Nostr] Preloading liked tracks cache...');
  likedTracksCache = await fetchUserLikedTrackRefs(userPubkey);
  likedTracksCacheUserPubkey = userPubkey;
  console.log(`[Nostr] Cached ${likedTracksCache.size} liked tracks`);
}

/**
 * Clear liked tracks cache (on logout)
 */
export function clearLikedTracksCache(): void {
  likedTracksCache = null;
  likedTracksCacheUserPubkey = null;
}

/**
 * Add a track to the liked cache (called after successful like)
 */
function addToLikedCache(trackPubkey: string, trackDTag: string): void {
  if (likedTracksCache) {
    likedTracksCache.add(`${trackPubkey}:${trackDTag}`);
  }
}

/**
 * Remove a track from the liked cache (called after successful unlike)
 */
function removeFromLikedCache(trackPubkey: string, trackDTag: string): void {
  if (likedTracksCache) {
    likedTracksCache.delete(`${trackPubkey}:${trackDTag}`);
  }
}

/**
 * Like a track (publish kind 7 reaction with "+")
 * NIP-25 compliant: includes both 'e' tag (event ID) and 'a' tag (addressable reference)
 * NIP-65 compliant: publishes to user's write relays + artist's read relays (outbox model)
 * Stores event for retry if broadcast fails
 */
export async function likeTrack(trackEventId: string, trackPubkey: string, trackDTag: string): Promise<void> {
  const { signEvent } = await import('./auth');
  const { getUserWriteRelays } = await import('$lib/stores/nostrSettingsStore');
  const { addPendingEvent } = await import('./pendingEvents');
  const p = getPool();

  const aTagValue = `${MUSIC_TRACK_KIND}:${trackPubkey}:${trackDTag}`;

  const event = await signEvent({
    kind: REACTION_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', trackEventId],
      ['a', aTagValue],
      ['p', trackPubkey],
      ['k', String(MUSIC_TRACK_KIND)]
    ],
    content: '+'
  });

  // Update cache immediately (event is signed, it exists)
  addToLikedCache(trackPubkey, trackDTag);

  // NIP-65 Outbox Model:
  // 1. Publish to user's WRITE relays (where we store our content)
  // 2. Publish to artist's READ relays (so they can see the like via their inbox)
  const userWriteRelays = getUserWriteRelays();

  // Fetch artist's NIP-65 relays to get their read relays
  const artistNip65 = await fetchNip65Relays(trackPubkey);
  const artistReadRelays = artistNip65.filter(r => r.read).map(r => r.url);

  // Combine and deduplicate
  const targetRelays = [...new Set([...userWriteRelays, ...artistReadRelays])];

  console.log('[Nostr] Publishing like to relays:', targetRelays);

  try {
    await Promise.all(targetRelays.map(relay => p.publish([relay], event)));
  } catch (err) {
    console.warn('[Nostr] Broadcast failed, storing for retry:', err);
    addPendingEvent(event, targetRelays);
    throw err;
  }
}

/**
 * Fetch user's liked track 'a' tag references
 * Returns a Set of "pubkey:d-tag" strings
 */
export async function fetchUserLikedTrackRefs(userPubkey: string): Promise<Set<string>> {
  const p = getPool();
  const filter: Filter = {
    kinds: [REACTION_KIND],
    authors: [userPubkey],
    '#k': [String(MUSIC_TRACK_KIND)]
  };

  const events = await p.querySync(connectedRelays, filter);
  const likedRefs = new Set<string>();

  for (const event of events) {
    // Only count "+" reactions as likes
    if (event.content === '+' || event.content === '❤️' || event.content === '🤙') {
      for (const tag of event.tags) {
        if (tag[0] === 'a' && tag[1]) {
          // 'a' tag format: "36787:pubkey:d-tag"
          const parts = tag[1].split(':');
          if (parts.length >= 3 && parts[0] === String(MUSIC_TRACK_KIND)) {
            // Store as "pubkey:d-tag" for easier lookup
            likedRefs.add(`${parts[1]}:${parts.slice(2).join(':')}`);
          }
        }
      }
    }
  }

  return likedRefs;
}

/**
 * Check if a specific track is liked by user
 * Uses cache if available for instant response
 */
export async function isTrackLiked(userPubkey: string, trackPubkey: string, trackDTag: string): Promise<boolean> {
  // Use cache if available and matches current user
  if (likedTracksCache && likedTracksCacheUserPubkey === userPubkey) {
    return likedTracksCache.has(`${trackPubkey}:${trackDTag}`);
  }

  // Cache not available, fetch and cache
  await preloadLikedTracks(userPubkey);
  return likedTracksCache?.has(`${trackPubkey}:${trackDTag}`) ?? false;
}

/**
 * Find user's reaction event ID for a specific track
 * Returns the event ID if found, null otherwise
 */
export async function findUserReactionEventId(
  userPubkey: string,
  trackPubkey: string,
  trackDTag: string
): Promise<string | null> {
  const p = getPool();
  const aTagValue = `${MUSIC_TRACK_KIND}:${trackPubkey}:${trackDTag}`;

  const filter: Filter = {
    kinds: [REACTION_KIND],
    authors: [userPubkey],
    '#a': [aTagValue]
  };

  const events = await p.querySync(connectedRelays, filter);

  // Find a "+" reaction (like)
  for (const event of events) {
    if (event.content === '+' || event.content === '❤️' || event.content === '🤙') {
      return event.id;
    }
  }

  return null;
}

/**
 * Unlike a track (publish kind 5 deletion event)
 * NIP-09 compliant deletion
 * NIP-65 compliant: publishes to user's write relays + artist's read relays
 * (same relays where the original like was published)
 * Stores event for retry if broadcast fails
 */
export async function unlikeTrack(
  userPubkey: string,
  trackPubkey: string,
  trackDTag: string
): Promise<boolean> {
  const { signEvent } = await import('./auth');
  const { getUserWriteRelays } = await import('$lib/stores/nostrSettingsStore');
  const { addPendingEvent } = await import('./pendingEvents');
  const p = getPool();

  // Find the reaction event to delete
  const reactionEventId = await findUserReactionEventId(userPubkey, trackPubkey, trackDTag);

  if (!reactionEventId) {
    console.log('[Nostr] No reaction found to delete');
    return false;
  }

  // Create deletion event (kind 5)
  const event = await signEvent({
    kind: DELETION_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', reactionEventId],
      ['k', String(REACTION_KIND)]
    ],
    content: 'unlike'
  });

  // Update cache immediately (deletion event is signed)
  removeFromLikedCache(trackPubkey, trackDTag);

  // NIP-65 Outbox Model:
  // Publish to the same relays where the like was published:
  // 1. User's WRITE relays
  // 2. Artist's READ relays (so the deletion is seen in their inbox too)
  const userWriteRelays = getUserWriteRelays();

  // Fetch artist's NIP-65 relays to get their read relays
  const artistNip65 = await fetchNip65Relays(trackPubkey);
  const artistReadRelays = artistNip65.filter(r => r.read).map(r => r.url);

  // Combine and deduplicate
  const targetRelays = [...new Set([...userWriteRelays, ...artistReadRelays])];

  console.log('[Nostr] Publishing unlike (deletion) to relays:', targetRelays);

  try {
    await Promise.all(targetRelays.map(relay => p.publish([relay], event)));
  } catch (err) {
    console.warn('[Nostr] Broadcast failed, storing for retry:', err);
    addPendingEvent(event, targetRelays);
    // Don't throw - the event is signed and will be retried
  }

  return true;
}

/**
 * Fetch all liked tracks for a user
 */
export async function fetchLikedTracks(userPubkey: string): Promise<NostrMusicTrack[]> {
  const likedRefs = await fetchUserLikedTrackRefs(userPubkey);

  if (likedRefs.size === 0) {
    return [];
  }

  const p = getPool();
  const allTracks: NostrMusicTrack[] = [];

  // Fetch each liked track by pubkey and d-tag
  for (const ref of likedRefs) {
    const [pubkey, ...dTagParts] = ref.split(':');
    const dTag = dTagParts.join(':');

    const filter: Filter = {
      kinds: [MUSIC_TRACK_KIND],
      authors: [pubkey],
      '#d': [dTag],
      limit: 1
    };

    const events = await p.querySync(connectedRelays, filter);
    const track = events[0] ? parseMusicTrackEvent(events[0]) : null;
    if (track) {
      allTracks.push(track);
    }
  }

  return allTracks.sort((a, b) => b.createdAt - a.createdAt);
}

// ============ Gossip Functions (fetch from specific relays) ============

/**
 * Fetch profile from specific relays
 */
export async function fetchProfileFromRelays(pubkey: string, relays: string[]): Promise<NostrProfile | null> {
  const p = getPool();
  const filter: Filter = {
    kinds: [PROFILE_KIND],
    authors: [pubkey],
    limit: 1
  };

  const events = await p.querySync(relays, filter);
  if (events.length === 0) {
    return null;
  }

  try {
    const content = JSON.parse(events[0].content);
    return {
      pubkey,
      name: content.name,
      displayName: content.display_name,
      picture: content.picture,
      about: content.about,
      nip05: content.nip05
    };
  } catch {
    return null;
  }
}

/**
 * Fetch NIP-65 relays from specific relays
 */
export async function fetchNip65RelaysFromRelays(pubkey: string, relays: string[]): Promise<Nip65Relay[]> {
  const p = getPool();
  const filter: Filter = {
    kinds: [RELAY_LIST_KIND],
    authors: [pubkey],
    limit: 1
  };

  const events = await p.querySync(relays, filter);
  if (events.length === 0) {
    return [];
  }

  const result: Nip65Relay[] = [];
  for (const tag of events[0].tags) {
    if (tag[0] === 'r' && tag[1]) {
      const url = tag[1];
      const marker = tag[2];
      result.push({
        url,
        read: !marker || marker === 'read',
        write: !marker || marker === 'write'
      });
    }
  }
  return result;
}

/**
 * Fetch tracks from specific relays
 */
export async function fetchTracksFromRelays(
  pubkey: string,
  relays: string[],
  limit: number = 50
): Promise<NostrMusicTrack[]> {
  const p = getPool();
  const filter: Filter = {
    kinds: [MUSIC_TRACK_KIND],
    authors: [pubkey],
    limit
  };

  const events = await p.querySync(relays, filter);
  return events
    .map(parseMusicTrackEvent)
    .filter((t): t is NostrMusicTrack => t !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Nostr Artist info (profile + tracks)
 */
export interface NostrArtist {
  pubkey: string;
  profile: NostrProfile | null;
  tracks: NostrMusicTrack[];
}

/**
 * Fetch artist using gossip model:
 * 1. First fetch artist's NIP-65 from our relays
 * 2. Then fetch their profile and tracks from their write relays
 */
export async function fetchArtistWithGossip(pubkey: string): Promise<NostrArtist> {
  // Step 1: Get artist's NIP-65 relays from our connected relays
  const nip65Relays = await fetchNip65Relays(pubkey);

  // Extract write relays (where artist publishes)
  const writeRelays = nip65Relays
    .filter(r => r.write)
    .map(r => r.url);

  // Combine our relays with artist's write relays (deduplicated)
  const allRelays = [...new Set([...connectedRelays, ...writeRelays])];

  // Step 2: Fetch profile and tracks from combined relays
  const [profile, tracks] = await Promise.all([
    fetchProfileFromRelays(pubkey, allRelays),
    fetchTracksFromRelays(pubkey, allRelays, 100)
  ]);

  return {
    pubkey,
    profile,
    tracks
  };
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
