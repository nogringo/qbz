/**
 * Nostr Settings Store
 *
 * Manages Nostr configuration (relays, etc.) with localStorage persistence.
 */

import { setRelays, initPool, type Nip65Relay } from '$lib/nostr/client';

const STORAGE_KEY = 'qbz-nostr-relays';
const NIP65_STORAGE_KEY = 'qbz-nostr-nip65-relays';

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

/**
 * Load saved NIP-65 relays from localStorage (full objects with read/write info)
 */
export function loadSavedNip65Relays(): Nip65Relay[] {
  try {
    const saved = localStorage.getItem(NIP65_STORAGE_KEY);
    if (saved) {
      const relays = JSON.parse(saved);
      if (Array.isArray(relays)) {
        return relays;
      }
    }
  } catch (err) {
    console.error('Failed to load NIP-65 relays:', err);
  }
  return [];
}

/**
 * Save NIP-65 relays to localStorage (full objects with read/write info)
 */
export function saveNip65Relays(relays: Nip65Relay[]): void {
  try {
    localStorage.setItem(NIP65_STORAGE_KEY, JSON.stringify(relays));
  } catch (err) {
    console.error('Failed to save NIP-65 relays:', err);
  }
}

/**
 * Clear NIP-65 relays (on logout)
 */
export function clearNip65Relays(): void {
  localStorage.removeItem(NIP65_STORAGE_KEY);
}

/**
 * Get merged relays (bootstrap + NIP-65 read)
 */
export function getMergedRelays(): string[] {
  const bootstrapRelays = loadSavedRelays();
  const nip65Relays = loadSavedNip65Relays();
  const nip65ReadUrls = nip65Relays.filter(r => r.read).map(r => r.url);
  return [...new Set([...bootstrapRelays, ...nip65ReadUrls])];
}

/**
 * Get user's write relays for publishing (NIP-65 outbox model)
 * Falls back to bootstrap relays if no NIP-65 write relays configured
 */
export function getUserWriteRelays(): string[] {
  const nip65Relays = loadSavedNip65Relays();
  const writeRelays = nip65Relays.filter(r => r.write).map(r => r.url);

  // Fallback to bootstrap relays if no write relays configured
  if (writeRelays.length === 0) {
    return loadSavedRelays();
  }

  return writeRelays;
}

/**
 * Get user's read relays for inbox (NIP-65 inbox model)
 */
export function getUserReadRelays(): string[] {
  const nip65Relays = loadSavedNip65Relays();
  const readRelays = nip65Relays.filter(r => r.read).map(r => r.url);

  // Fallback to bootstrap relays if no read relays configured
  if (readRelays.length === 0) {
    return loadSavedRelays();
  }

  return readRelays;
}

/**
 * Initialize pool with merged relays (bootstrap + NIP-65)
 */
export function initPoolWithMergedRelays(): void {
  const allRelays = getMergedRelays();
  setRelays(allRelays);
  initPool(allRelays);
}
