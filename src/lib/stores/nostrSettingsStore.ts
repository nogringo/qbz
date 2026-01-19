/**
 * Nostr Settings Store
 *
 * Manages Nostr configuration (relays, etc.) with localStorage persistence.
 */

import { setRelays, initPool } from '$lib/nostr/client';

const STORAGE_KEY = 'qbz-nostr-relays';

// Default relays
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social'
];

/**
 * Load saved relays from localStorage
 */
export function loadSavedRelays(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const relays = JSON.parse(saved);
      if (Array.isArray(relays) && relays.length > 0) {
        return relays;
      }
    }
  } catch (err) {
    console.error('Failed to load saved relays:', err);
  }
  return DEFAULT_RELAYS;
}

/**
 * Save relays to localStorage
 */
function saveRelays(relays: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(relays));
  } catch (err) {
    console.error('Failed to save relays:', err);
  }
}

/**
 * Update relays and reinitialize pool
 */
export function updateRelays(relays: string[]): void {
  const validRelays = relays.filter(r => r.startsWith('wss://') || r.startsWith('ws://'));
  if (validRelays.length === 0) {
    console.warn('No valid relays provided, using defaults');
    setRelays(DEFAULT_RELAYS);
    saveRelays(DEFAULT_RELAYS);
    return;
  }

  setRelays(validRelays);
  saveRelays(validRelays);
  // Reinitialize pool with new relays
  initPool(validRelays);
}

/**
 * Reset relays to defaults
 */
export function resetRelaysToDefault(): void {
  setRelays(DEFAULT_RELAYS);
  saveRelays(DEFAULT_RELAYS);
  initPool(DEFAULT_RELAYS);
}

/**
 * Get default relays
 */
export function getDefaultRelays(): string[] {
  return [...DEFAULT_RELAYS];
}
