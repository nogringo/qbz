/**
 * Stale-While-Revalidate (SWR) Pattern Implementation
 *
 * Provides instant data from cache while fetching fresh data in the background.
 * The UI gets updated silently when new data arrives.
 */

import { isStale, now } from './ttl';

/**
 * SWR options for a fetch operation
 */
export interface SWROptions<T> {
  /** Key for identifying this cache entry */
  cacheKey: string;
  /** Function to get cached data */
  getCached: () => Promise<{ data: T; fetchedAt: number } | null>;
  /** Function to fetch fresh data from network */
  fetchFresh: () => Promise<T>;
  /** Function to save data to cache */
  setCache: (data: T, fetchedAt: number) => Promise<void>;
  /** Threshold in ms after which to trigger background revalidation */
  staleThreshold: number;
  /** Callback when fresh data arrives (for UI updates) */
  onUpdate?: (data: T) => void;
  /** Callback for errors during background revalidation */
  onError?: (error: unknown) => void;
}

/**
 * SWR result
 */
export interface SWRResult<T> {
  /** The data (from cache or fresh fetch) */
  data: T;
  /** Whether the data came from cache */
  fromCache: boolean;
  /** Whether a background revalidation is in progress */
  isRevalidating: boolean;
}

/**
 * Execute a SWR fetch operation
 *
 * 1. If cached data exists, return it immediately
 * 2. If data is stale, trigger background revalidation
 * 3. If no cached data, fetch fresh and cache it
 *
 * @returns The data (possibly stale) and metadata
 */
export async function swr<T>(options: SWROptions<T>): Promise<SWRResult<T>> {
  const { getCached, fetchFresh, setCache, staleThreshold, onUpdate, onError } = options;

  // Try to get cached data
  const cached = await getCached();

  if (cached) {
    const { data, fetchedAt } = cached;

    // Check if data is stale
    if (isStale(fetchedAt, staleThreshold)) {
      // Trigger background revalidation
      revalidateInBackground(fetchFresh, setCache, onUpdate, onError);

      return {
        data,
        fromCache: true,
        isRevalidating: true,
      };
    }

    // Data is fresh, return it
    return {
      data,
      fromCache: true,
      isRevalidating: false,
    };
  }

  // No cached data, fetch fresh
  const freshData = await fetchFresh();
  const fetchedAt = now();

  // Cache the data
  await setCache(freshData, fetchedAt);

  return {
    data: freshData,
    fromCache: false,
    isRevalidating: false,
  };
}

/**
 * Trigger background revalidation (fire and forget)
 */
async function revalidateInBackground<T>(
  fetchFresh: () => Promise<T>,
  setCache: (data: T, fetchedAt: number) => Promise<void>,
  onUpdate?: (data: T) => void,
  onError?: (error: unknown) => void
): Promise<void> {
  try {
    const freshData = await fetchFresh();
    const fetchedAt = now();

    // Update cache
    await setCache(freshData, fetchedAt);

    // Notify UI
    if (onUpdate) {
      onUpdate(freshData);
    }

    console.log('[SWR] Background revalidation complete');
  } catch (error) {
    console.warn('[SWR] Background revalidation failed:', error);
    if (onError) {
      onError(error);
    }
  }
}

/**
 * Simple helper for the common case where data is an array
 * Merges cached and fresh data, keeping the most recent versions
 */
export function mergeArrays<T extends { id: string }>(cached: T[], fresh: T[]): T[] {
  const map = new Map<string, T>();

  // Add cached items first
  for (const item of cached) {
    map.set(item.id, item);
  }

  // Override with fresh items
  for (const item of fresh) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

/**
 * Deduplicate tracks by pubkey:d_tag (addressable identifier)
 */
export function deduplicateTracks<T extends { pubkey: string; d: string }>(tracks: T[]): T[] {
  const map = new Map<string, T>();

  for (const track of tracks) {
    const key = `${track.pubkey}:${track.d}`;
    const existing = map.get(key);

    // Keep the most recent version (assuming higher createdAt is newer)
    if (!existing || (track as any).createdAt > (existing as any).createdAt) {
      map.set(key, track);
    }
  }

  return Array.from(map.values());
}
