/**
 * Offline Mode State Store
 *
 * Manages offline mode detection and settings.
 * Polls backend periodically and listens for manual toggle events.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// Types matching Rust backend
export type OfflineReason = 'no_network' | 'not_logged_in' | 'manual_override';

export interface OfflineStatus {
  isOffline: boolean;
  reason: OfflineReason | null;
  manualModeEnabled: boolean;
}

export interface OfflineSettings {
  manualOfflineMode: boolean;
  showPartialPlaylists: boolean;
}

// Store state
let status: OfflineStatus = {
  isOffline: false,
  reason: null,
  manualModeEnabled: false,
};

let settings: OfflineSettings = {
  manualOfflineMode: false,
  showPartialPlaylists: true,
};

let initialized = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let eventUnlisten: UnlistenFn | null = null;

// Listeners
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Subscribe to offline state changes
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  listener(); // Immediately notify with current state
  return () => listeners.delete(listener);
}

// ============ Getters ============

export function getStatus(): OfflineStatus {
  return status;
}

export function getSettings(): OfflineSettings {
  return settings;
}

export function isOffline(): boolean {
  return status.isOffline;
}

export function getOfflineReason(): OfflineReason | null {
  return status.reason;
}

// ============ Actions ============

/**
 * Fetch current offline status from backend
 */
async function fetchStatus(): Promise<void> {
  try {
    const newStatus = await invoke<OfflineStatus>('get_offline_status');
    const changed = JSON.stringify(status) !== JSON.stringify(newStatus);
    status = newStatus;
    if (changed) {
      notifyListeners();
    }
  } catch (error) {
    console.error('Failed to fetch offline status:', error);
  }
}

/**
 * Fetch offline settings from backend
 */
async function fetchSettings(): Promise<void> {
  try {
    settings = await invoke<OfflineSettings>('get_offline_settings');
    notifyListeners();
  } catch (error) {
    console.error('Failed to fetch offline settings:', error);
  }
}

/**
 * Toggle manual offline mode
 */
export async function setManualOffline(enabled: boolean): Promise<void> {
  try {
    const newStatus = await invoke<OfflineStatus>('set_manual_offline', { enabled });
    status = newStatus;
    settings.manualOfflineMode = enabled;
    notifyListeners();
  } catch (error) {
    console.error('Failed to set manual offline mode:', error);
    throw error;
  }
}

/**
 * Set whether to show playlists with partial local content
 */
export async function setShowPartialPlaylists(enabled: boolean): Promise<void> {
  try {
    await invoke('set_show_partial_playlists', { enabled });
    settings.showPartialPlaylists = enabled;
    notifyListeners();
  } catch (error) {
    console.error('Failed to set show partial playlists:', error);
    throw error;
  }
}

/**
 * Force refresh of offline status
 */
export async function refreshStatus(): Promise<void> {
  await fetchStatus();
}

// ============ Initialization ============

/**
 * Initialize the offline store
 * - Fetches initial status and settings
 * - Sets up polling interval (30 seconds)
 * - Listens for backend events
 */
export async function initOfflineStore(): Promise<void> {
  if (initialized) return;

  // Fetch initial state
  await Promise.all([fetchStatus(), fetchSettings()]);

  // Poll every 30 seconds
  pollInterval = setInterval(fetchStatus, 30000);

  // Listen for backend events (from manual toggle)
  eventUnlisten = await listen<OfflineStatus>('offline-status-changed', (event) => {
    status = event.payload;
    notifyListeners();
  });

  initialized = true;
}

/**
 * Cleanup the offline store (for app shutdown)
 */
export function cleanupOfflineStore(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (eventUnlisten) {
    eventUnlisten();
    eventUnlisten = null;
  }
  initialized = false;
}

// ============ State Getter ============

export interface OfflineState {
  status: OfflineStatus;
  settings: OfflineSettings;
}

export function getOfflineState(): OfflineState {
  return {
    status,
    settings,
  };
}
