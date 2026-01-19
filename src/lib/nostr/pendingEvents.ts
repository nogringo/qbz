/**
 * Pending Events Store
 *
 * Stores Nostr events that failed to broadcast for later retry.
 * Uses localStorage for persistence across sessions.
 */

import type { Event } from 'nostr-tools';
import { getPool } from './client';

const STORAGE_KEY = 'nostr-pending-events';

interface PendingEvent {
  event: Event;
  targetRelays: string[];
  createdAt: number;
  retryCount: number;
}

/**
 * Load pending events from localStorage
 */
function loadPendingEvents(): PendingEvent[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error('[PendingEvents] Failed to load:', err);
  }
  return [];
}

/**
 * Save pending events to localStorage
 */
function savePendingEvents(events: PendingEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (err) {
    console.error('[PendingEvents] Failed to save:', err);
  }
}

/**
 * Add an event to the pending queue
 */
export function addPendingEvent(event: Event, targetRelays: string[]): void {
  const pending = loadPendingEvents();

  // Check if event already exists (by id)
  if (pending.some(p => p.event.id === event.id)) {
    console.log('[PendingEvents] Event already in queue:', event.id);
    return;
  }

  pending.push({
    event,
    targetRelays,
    createdAt: Date.now(),
    retryCount: 0
  });

  savePendingEvents(pending);
  console.log('[PendingEvents] Added event to queue:', event.id);
}

/**
 * Remove an event from the pending queue
 */
export function removePendingEvent(eventId: string): void {
  const pending = loadPendingEvents();
  const filtered = pending.filter(p => p.event.id !== eventId);
  savePendingEvents(filtered);
}

/**
 * Get count of pending events
 */
export function getPendingCount(): number {
  return loadPendingEvents().length;
}

/**
 * Retry broadcasting all pending events
 * Returns number of successfully broadcast events
 */
export async function retryPendingEvents(): Promise<number> {
  const pending = loadPendingEvents();

  if (pending.length === 0) {
    return 0;
  }

  console.log(`[PendingEvents] Retrying ${pending.length} pending events...`);

  const pool = getPool();
  let successCount = 0;
  const remaining: PendingEvent[] = [];

  for (const item of pending) {
    // Skip events older than 7 days
    const ageMs = Date.now() - item.createdAt;
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;

    if (ageMs > maxAgeMs) {
      console.log('[PendingEvents] Dropping old event:', item.event.id);
      continue;
    }

    // Skip events with too many retries
    if (item.retryCount >= 10) {
      console.log('[PendingEvents] Dropping event after 10 retries:', item.event.id);
      continue;
    }

    try {
      await Promise.all(
        item.targetRelays.map(relay => pool.publish([relay], item.event))
      );
      console.log('[PendingEvents] Successfully broadcast:', item.event.id);
      successCount++;
    } catch (err) {
      console.warn('[PendingEvents] Failed to broadcast:', item.event.id, err);
      // Keep for later retry with incremented count
      remaining.push({
        ...item,
        retryCount: item.retryCount + 1
      });
    }
  }

  savePendingEvents(remaining);
  console.log(`[PendingEvents] Broadcast ${successCount}/${pending.length} events, ${remaining.length} remaining`);

  return successCount;
}

/**
 * Clear all pending events
 */
export function clearPendingEvents(): void {
  localStorage.removeItem(STORAGE_KEY);
  console.log('[PendingEvents] Cleared all pending events');
}
