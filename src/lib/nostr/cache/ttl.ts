/**
 * TTL (Time-To-Live) Constants for Nostr Cache
 *
 * Defines cache durations and stale thresholds for different data types.
 * The SWR pattern uses:
 * - TTL: How long data is considered fresh
 * - Stale Threshold: When to trigger background revalidation
 */

// Milliseconds helpers
const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;

/**
 * Profile cache settings
 * Profiles don't change often, but we want to catch updates
 */
export const PROFILE_TTL = {
  /** Data is fresh for 1 hour */
  freshDuration: 1 * HOURS,
  /** Start background revalidation after 30 minutes */
  staleThreshold: 30 * MINUTES,
};

/**
 * Track cache settings
 * Tracks are immutable once published, very long TTL
 */
export const TRACK_TTL = {
  /** Data is fresh for 24 hours */
  freshDuration: 24 * HOURS,
  /** Start background revalidation after 12 hours */
  staleThreshold: 12 * HOURS,
};

/**
 * Playlist cache settings
 * Playlists change more frequently (adding/removing tracks)
 */
export const PLAYLIST_TTL = {
  /** Data is fresh for 15 minutes */
  freshDuration: 15 * MINUTES,
  /** Start background revalidation after 5 minutes */
  staleThreshold: 5 * MINUTES,
};

/**
 * Recent tracks query cache settings
 * Short TTL to see new uploads quickly
 */
export const RECENT_TRACKS_TTL = {
  /** Data is fresh for 5 minutes */
  freshDuration: 5 * MINUTES,
  /** Start background revalidation after 2 minutes */
  staleThreshold: 2 * MINUTES,
};

/**
 * Artist tracks query cache settings
 * Medium TTL - artist may upload new tracks
 */
export const ARTIST_TRACKS_TTL = {
  /** Data is fresh for 30 minutes */
  freshDuration: 30 * MINUTES,
  /** Start background revalidation after 15 minutes */
  staleThreshold: 15 * MINUTES,
};

/**
 * User playlists query cache settings
 * Same as playlist TTL
 */
export const USER_PLAYLISTS_TTL = {
  /** Data is fresh for 15 minutes */
  freshDuration: 15 * MINUTES,
  /** Start background revalidation after 5 minutes */
  staleThreshold: 5 * MINUTES,
};

/**
 * Liked tracks query cache settings
 * Short TTL since user may like/unlike frequently
 */
export const LIKED_TRACKS_TTL = {
  /** Data is fresh for 5 minutes */
  freshDuration: 5 * MINUTES,
  /** Start background revalidation after 2 minutes */
  staleThreshold: 2 * MINUTES,
};

/**
 * Check if data is stale (needs background revalidation)
 */
export function isStale(fetchedAt: number, staleThreshold: number): boolean {
  return Date.now() - fetchedAt > staleThreshold;
}

/**
 * Check if data is expired (too old to use)
 */
export function isExpired(fetchedAt: number, ttl: number): boolean {
  return Date.now() - fetchedAt > ttl;
}

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}
