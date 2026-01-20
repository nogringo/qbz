/**
 * Nostr Cache Module
 *
 * Exports all cache-related functionality for local-first Nostr data.
 */

// TTL constants
export {
  PROFILE_TTL,
  TRACK_TTL,
  PLAYLIST_TTL,
  RECENT_TRACKS_TTL,
  ARTIST_TRACKS_TTL,
  USER_PLAYLISTS_TTL,
  LIKED_TRACKS_TTL,
  isStale,
  isExpired,
  now,
} from './ttl';

// Cache service (Tauri commands wrapper)
export {
  // Types
  type CachedProfile,
  type CachedTrack,
  type CachedPlaylist,
  type CachedQuery,
  type CacheStats,
  // Conversion functions
  profileToCached,
  cachedToProfile,
  trackToCached,
  cachedToTrack,
  playlistToCached,
  cachedToPlaylist,
  // Cache API
  getCachedProfile,
  setCachedProfile,
  getCachedTrack,
  getCachedTracksByPubkey,
  getCachedRecentTracks,
  setCachedTrack,
  setCachedTracks,
  getCachedPlaylist,
  getCachedPlaylistsByOwner,
  setCachedPlaylist,
  deleteCachedPlaylist,
  getCachedQuery,
  setCachedQuery,
  getCacheStats,
  clearCache,
} from './nostrCache';

// SWR pattern
export { swr, mergeArrays, deduplicateTracks, type SWROptions, type SWRResult } from './swr';

// Cached fetchers (main API for views)
export {
  fetchProfileCached,
  fetchRecentTracksCached,
  fetchArtistCached,
  fetchPlaylistsByOwnerCached,
  fetchPlaylistWithTracksCached,
  fetchLikedTracksCached,
  invalidatePlaylistCache,
  forceRefreshRecentTracks,
  // Peek functions for instant display
  peekCachedPlaylist,
  peekCachedArtist,
  peekCachedRecentTracks,
  peekCachedPlaylists,
  peekCachedLikedTracks,
} from './fetchers';
