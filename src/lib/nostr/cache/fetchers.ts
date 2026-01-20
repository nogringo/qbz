/**
 * Cached Fetchers for Nostr Data
 *
 * These functions wrap the original fetch functions with SWR caching.
 * They provide instant data from cache and update silently in the background.
 */

import {
  fetchRecentTracks,
  fetchProfile,
  fetchPlaylistsByOwner,
  fetchPlaylistWithTracks,
  fetchArtistWithGossip,
  fetchLikedTracks,
  type NostrArtist,
  type NostrProfile
} from '../client';
import type { NostrMusicTrack, NostrPlaylist } from '../types';
import { swr } from './swr';
import {
  PROFILE_TTL,
  TRACK_TTL,
  PLAYLIST_TTL,
  RECENT_TRACKS_TTL,
  ARTIST_TRACKS_TTL,
  USER_PLAYLISTS_TTL,
  LIKED_TRACKS_TTL,
  now,
} from './ttl';
import {
  getCachedProfile,
  setCachedProfile,
  getCachedRecentTracks,
  setCachedTracks,
  getCachedTracksByPubkey,
  getCachedPlaylistsByOwner,
  setCachedPlaylist,
  getCachedPlaylist,
  getCachedQuery,
  setCachedQuery,
  profileToCached,
  cachedToProfile,
  trackToCached,
  cachedToTrack,
  playlistToCached,
  cachedToPlaylist,
} from './nostrCache';

// ============ Profile Fetcher ============

/**
 * Fetch a profile with SWR caching
 *
 * @param pubkey The pubkey to fetch
 * @param onUpdate Callback when fresh data arrives
 * @returns The profile (possibly from cache)
 */
export async function fetchProfileCached(
  pubkey: string,
  onUpdate?: (profile: NostrProfile | null) => void
): Promise<NostrProfile | null> {
  try {
    const result = await swr<NostrProfile | null>({
      cacheKey: `profile:${pubkey}`,

      async getCached() {
        const cached = await getCachedProfile(pubkey);
        if (cached) {
          return {
            data: cachedToProfile(cached),
            fetchedAt: cached.fetched_at,
          };
        }
        return null;
      },

      async fetchFresh() {
        return fetchProfile(pubkey);
      },

      async setCache(data, fetchedAt) {
        if (data) {
          await setCachedProfile(profileToCached(data, fetchedAt));
        }
      },

      staleThreshold: PROFILE_TTL.staleThreshold,
      onUpdate,
    });

    return result.data;
  } catch (error) {
    console.error('[Cache] Failed to fetch profile:', error);
    // Fallback to network fetch
    return fetchProfile(pubkey);
  }
}

// ============ Recent Tracks Fetcher ============

/**
 * Fetch recent tracks with SWR caching
 *
 * @param limit Number of tracks to fetch
 * @param onUpdate Callback when fresh data arrives
 * @returns Array of tracks (possibly from cache)
 */
export async function fetchRecentTracksCached(
  limit: number = 30,
  onUpdate?: (tracks: NostrMusicTrack[]) => void
): Promise<NostrMusicTrack[]> {
  try {
    const result = await swr<NostrMusicTrack[]>({
      cacheKey: `recent_tracks:${limit}`,

      async getCached() {
        const cached = await getCachedRecentTracks(limit);
        if (cached.length > 0) {
          // Find the oldest fetched_at to determine cache freshness
          const oldestFetchedAt = Math.min(...cached.map(t => t.fetched_at));
          return {
            data: cached.map(cachedToTrack),
            fetchedAt: oldestFetchedAt,
          };
        }
        return null;
      },

      async fetchFresh() {
        return fetchRecentTracks(limit);
      },

      async setCache(data, fetchedAt) {
        if (data.length > 0) {
          await setCachedTracks(data.map(t => trackToCached(t, fetchedAt)));
        }
      },

      staleThreshold: RECENT_TRACKS_TTL.staleThreshold,
      onUpdate,
    });

    return result.data;
  } catch (error) {
    console.error('[Cache] Failed to fetch recent tracks:', error);
    // Fallback to network fetch
    return fetchRecentTracks(limit);
  }
}

// ============ Artist Fetcher ============

/**
 * Fetch artist with gossip model and SWR caching
 *
 * @param pubkey The artist's pubkey
 * @param onUpdate Callback when fresh data arrives
 * @returns The artist info (possibly from cache)
 */
export async function fetchArtistCached(
  pubkey: string,
  onUpdate?: (artist: NostrArtist) => void
): Promise<NostrArtist> {
  try {
    const result = await swr<NostrArtist>({
      cacheKey: `artist:${pubkey}`,

      async getCached() {
        // Get cached profile and tracks separately
        const [cachedProfile, cachedTracks] = await Promise.all([
          getCachedProfile(pubkey),
          getCachedTracksByPubkey(pubkey),
        ]);

        // Only use cache if we have tracks (profile might not exist)
        if (cachedTracks.length > 0) {
          const oldestFetchedAt = Math.min(
            ...cachedTracks.map(t => t.fetched_at),
            cachedProfile?.fetched_at ?? Infinity
          );

          return {
            data: {
              pubkey,
              profile: cachedProfile ? cachedToProfile(cachedProfile) : null,
              tracks: cachedTracks.map(cachedToTrack),
            },
            fetchedAt: oldestFetchedAt,
          };
        }

        return null;
      },

      async fetchFresh() {
        return fetchArtistWithGossip(pubkey);
      },

      async setCache(data, fetchedAt) {
        // Cache profile
        if (data.profile) {
          await setCachedProfile(profileToCached(data.profile, fetchedAt));
        }

        // Cache tracks
        if (data.tracks.length > 0) {
          await setCachedTracks(data.tracks.map(t => trackToCached(t, fetchedAt)));
        }
      },

      staleThreshold: ARTIST_TRACKS_TTL.staleThreshold,
      onUpdate,
    });

    return result.data;
  } catch (error) {
    console.error('[Cache] Failed to fetch artist:', error);
    // Fallback to network fetch
    return fetchArtistWithGossip(pubkey);
  }
}

// ============ User Playlists Fetcher ============

/**
 * Fetch user's playlists with SWR caching
 *
 * @param pubkey The user's pubkey
 * @param limit Maximum number of playlists
 * @param onUpdate Callback when fresh data arrives
 * @returns Array of playlists (possibly from cache)
 */
export async function fetchPlaylistsByOwnerCached(
  pubkey: string,
  limit: number = 20,
  onUpdate?: (playlists: NostrPlaylist[]) => void
): Promise<NostrPlaylist[]> {
  try {
    const result = await swr<NostrPlaylist[]>({
      cacheKey: `playlists:${pubkey}:${limit}`,

      async getCached() {
        const cached = await getCachedPlaylistsByOwner(pubkey);
        if (cached.length > 0) {
          const oldestFetchedAt = Math.min(...cached.map(p => p.fetched_at));
          return {
            data: cached.slice(0, limit).map(cachedToPlaylist),
            fetchedAt: oldestFetchedAt,
          };
        }
        return null;
      },

      async fetchFresh() {
        return fetchPlaylistsByOwner(pubkey, limit);
      },

      async setCache(data, fetchedAt) {
        for (const playlist of data) {
          await setCachedPlaylist(playlistToCached(playlist, fetchedAt));
        }
      },

      staleThreshold: USER_PLAYLISTS_TTL.staleThreshold,
      onUpdate,
    });

    return result.data;
  } catch (error) {
    console.error('[Cache] Failed to fetch playlists:', error);
    // Fallback to network fetch
    return fetchPlaylistsByOwner(pubkey, limit);
  }
}

// ============ Single Playlist Fetcher ============

/**
 * Fetch a playlist with its tracks using SWR caching
 *
 * @param pubkey The playlist owner's pubkey
 * @param dTag The playlist's d-tag
 * @param onUpdate Callback when fresh data arrives
 * @returns The playlist with tracks (possibly from cache)
 */
export async function fetchPlaylistWithTracksCached(
  pubkey: string,
  dTag: string,
  onUpdate?: (result: { playlist: NostrPlaylist; tracks: NostrMusicTrack[] }) => void
): Promise<{ playlist: NostrPlaylist; tracks: NostrMusicTrack[] } | null> {
  try {
    const result = await swr<{ playlist: NostrPlaylist; tracks: NostrMusicTrack[] } | null>({
      cacheKey: `playlist:${pubkey}:${dTag}`,

      async getCached() {
        const cachedPlaylist = await getCachedPlaylist(pubkey, dTag);
        if (cachedPlaylist) {
          const playlist = cachedToPlaylist(cachedPlaylist);

          // For tracks, we'd need to fetch them from cache by their refs
          // For simplicity, we'll just use the playlist data and fetch tracks fresh
          // A more complete implementation would cache tracks individually
          return {
            data: {
              playlist,
              tracks: [], // Tracks will be fetched during revalidation
            },
            fetchedAt: cachedPlaylist.fetched_at,
          };
        }
        return null;
      },

      async fetchFresh() {
        return fetchPlaylistWithTracks(pubkey, dTag);
      },

      async setCache(data, fetchedAt) {
        if (data) {
          await setCachedPlaylist(playlistToCached(data.playlist, fetchedAt));
          // Also cache the tracks
          if (data.tracks.length > 0) {
            await setCachedTracks(data.tracks.map(t => trackToCached(t, fetchedAt)));
          }
        }
      },

      staleThreshold: PLAYLIST_TTL.staleThreshold,
      onUpdate: onUpdate ? (data) => data && onUpdate(data) : undefined,
    });

    return result.data;
  } catch (error) {
    console.error('[Cache] Failed to fetch playlist with tracks:', error);
    // Fallback to network fetch
    return fetchPlaylistWithTracks(pubkey, dTag);
  }
}

// ============ Liked Tracks Fetcher ============

/**
 * Fetch user's liked tracks with SWR caching
 *
 * @param userPubkey The user's pubkey
 * @param onUpdate Callback when fresh data arrives
 * @returns Array of liked tracks (possibly from cache)
 */
export async function fetchLikedTracksCached(
  userPubkey: string,
  onUpdate?: (tracks: NostrMusicTrack[]) => void
): Promise<NostrMusicTrack[]> {
  const cacheKey = `liked_tracks:${userPubkey}`;

  try {
    const result = await swr<NostrMusicTrack[]>({
      cacheKey,

      async getCached() {
        const query = await getCachedQuery(cacheKey);
        if (query && query.expires_at > Date.now()) {
          // Parse the track IDs from the query
          const trackIds: string[] = JSON.parse(query.result_ids);
          if (trackIds.length === 0) {
            return {
              data: [],
              fetchedAt: query.fetched_at,
            };
          }

          // Try to get tracks from cache
          // We stored them during the last fetch
          const cachedTracks = await getCachedRecentTracks(500); // Get a large batch
          const trackMap = new Map(cachedTracks.map(t => [t.event_id, t]));

          const tracks: NostrMusicTrack[] = [];
          for (const id of trackIds) {
            const cached = trackMap.get(id);
            if (cached) {
              tracks.push(cachedToTrack(cached));
            }
          }

          // Only return if we found most of the tracks
          if (tracks.length >= trackIds.length * 0.5) {
            return {
              data: tracks,
              fetchedAt: query.fetched_at,
            };
          }
        }
        return null;
      },

      async fetchFresh() {
        return fetchLikedTracks(userPubkey);
      },

      async setCache(data, fetchedAt) {
        // Store the track IDs in query cache
        const trackIds = data.map(t => t.id);
        await setCachedQuery({
          query_key: cacheKey,
          result_ids: JSON.stringify(trackIds),
          fetched_at: fetchedAt,
          expires_at: fetchedAt + LIKED_TRACKS_TTL.freshDuration,
        });

        // Store the tracks themselves
        if (data.length > 0) {
          await setCachedTracks(data.map(t => trackToCached(t, fetchedAt)));
        }
      },

      staleThreshold: LIKED_TRACKS_TTL.staleThreshold,
      onUpdate,
    });

    return result.data;
  } catch (error) {
    console.error('[Cache] Failed to fetch liked tracks:', error);
    // Fallback to network fetch
    return fetchLikedTracks(userPubkey);
  }
}

// ============ Cache Peek Functions (for instant display) ============

/**
 * Quickly check if liked tracks are in cache
 */
export async function peekCachedLikedTracks(userPubkey: string): Promise<NostrMusicTrack[] | null> {
  try {
    const cacheKey = `liked_tracks:${userPubkey}`;
    const query = await getCachedQuery(cacheKey);

    if (query && query.expires_at > Date.now()) {
      const trackIds: string[] = JSON.parse(query.result_ids);
      if (trackIds.length === 0) {
        return [];
      }

      // Try to get tracks from cache
      const cachedTracks = await getCachedRecentTracks(500);
      const trackMap = new Map(cachedTracks.map(t => [t.event_id, t]));

      const tracks: NostrMusicTrack[] = [];
      for (const id of trackIds) {
        const cached = trackMap.get(id);
        if (cached) {
          tracks.push(cachedToTrack(cached));
        }
      }

      // Return if we found at least half the tracks
      if (tracks.length >= trackIds.length * 0.5) {
        return tracks;
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Quickly check if a playlist is in cache (for deciding whether to show loading)
 */
export async function peekCachedPlaylist(pubkey: string, dTag: string): Promise<{ playlist: NostrPlaylist; tracks: NostrMusicTrack[] } | null> {
  try {
    const cachedPlaylist = await getCachedPlaylist(pubkey, dTag);
    if (cachedPlaylist) {
      return {
        playlist: cachedToPlaylist(cachedPlaylist),
        tracks: [], // Tracks loaded separately
      };
    }
  } catch {
    // Ignore errors, just return null
  }
  return null;
}

/**
 * Quickly check if an artist is in cache
 */
export async function peekCachedArtist(pubkey: string): Promise<NostrArtist | null> {
  try {
    const [cachedProfile, cachedTracks] = await Promise.all([
      getCachedProfile(pubkey),
      getCachedTracksByPubkey(pubkey),
    ]);
    if (cachedTracks.length > 0) {
      return {
        pubkey,
        profile: cachedProfile ? cachedToProfile(cachedProfile) : null,
        tracks: cachedTracks.map(cachedToTrack),
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Quickly check if recent tracks are in cache
 */
export async function peekCachedRecentTracks(limit: number): Promise<NostrMusicTrack[] | null> {
  try {
    const cached = await getCachedRecentTracks(limit);
    if (cached.length > 0) {
      return cached.map(cachedToTrack);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Quickly check if user playlists are in cache
 */
export async function peekCachedPlaylists(pubkey: string): Promise<NostrPlaylist[] | null> {
  try {
    const cached = await getCachedPlaylistsByOwner(pubkey);
    if (cached.length > 0) {
      return cached.map(cachedToPlaylist);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// ============ Cache Invalidation Helpers ============

/**
 * Invalidate cache for a specific playlist (after edit/delete)
 */
export async function invalidatePlaylistCache(pubkey: string, dTag: string): Promise<void> {
  const { deleteCachedPlaylist } = await import('./nostrCache');
  await deleteCachedPlaylist(pubkey, dTag);
}

/**
 * Force refresh of recent tracks (ignoring cache)
 */
export async function forceRefreshRecentTracks(limit: number = 30): Promise<NostrMusicTrack[]> {
  const tracks = await fetchRecentTracks(limit);
  const fetchedAt = now();
  await setCachedTracks(tracks.map(t => trackToCached(t, fetchedAt)));
  return tracks;
}
