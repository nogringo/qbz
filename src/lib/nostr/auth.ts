/**
 * Nostr Authentication Service
 *
 * Supports two authentication methods:
 * - Bunker (NIP-46) - Remote signing, more secure
 * - nsec - Direct private key, stored securely in system keyring
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { npubEncode, decode } from 'nostr-tools/nip19';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools/pure';
import { invoke } from '@tauri-apps/api/core';

export type AuthMethod = 'bunker' | 'nsec';

export interface NostrUser {
  pubkey: string;
  npub: string;
  method: AuthMethod;
}

interface Signer {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
}

// Simple signer for nsec
class NsecSigner implements Signer {
  private secretKey: Uint8Array;
  private pubkey: string;

  constructor(secretKey: Uint8Array) {
    this.secretKey = secretKey;
    this.pubkey = getPublicKey(secretKey);
  }

  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }

  async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
    const { finalizeEvent } = await import('nostr-tools/pure');
    return finalizeEvent(event, this.secretKey);
  }
}

// Auth state
let currentUser: NostrUser | null = null;
let currentSigner: Signer | null = null;
let bunkerInstance: BunkerSigner | null = null;

// Restore session guard (prevent multiple concurrent calls)
let restoreSessionPromise: Promise<NostrUser | null> | null = null;

// Listeners
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Subscribe to auth state changes
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

/**
 * Get current user
 */
export function getCurrentUser(): NostrUser | null {
  return currentUser;
}

/**
 * Get current signer for signing events
 */
export function getSigner(): Signer | null {
  return currentSigner;
}

/**
 * Check if logged in
 */
export function isLoggedIn(): boolean {
  return currentUser !== null && currentSigner !== null;
}

/**
 * Login with nsec (private key)
 */
export async function loginWithNsec(nsecOrHex: string): Promise<NostrUser> {
  let secretKey: Uint8Array;

  // Handle both nsec and hex formats
  if (nsecOrHex.startsWith('nsec')) {
    const decoded = decode(nsecOrHex);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec format');
    }
    secretKey = decoded.data;
  } else {
    // Assume hex format
    if (!/^[0-9a-fA-F]{64}$/.test(nsecOrHex)) {
      throw new Error('Invalid private key format');
    }
    secretKey = hexToBytes(nsecOrHex);
  }

  const signer = new NsecSigner(secretKey);
  const pubkey = await signer.getPublicKey();

  currentSigner = signer;
  currentUser = {
    pubkey,
    npub: npubEncode(pubkey),
    method: 'nsec'
  };

  await saveSession('nsec', nsecOrHex);
  notifyListeners();
  return currentUser;
}

/**
 * Login with bunker URI (NIP-46)
 */
export async function loginWithBunker(bunkerUri: string): Promise<NostrUser> {
  // Generate client keypair for communication
  const clientSecretKey = generateSecretKey();

  // Parse bunker URI
  const bunkerPointer = await parseBunkerInput(bunkerUri);
  if (!bunkerPointer) {
    throw new Error('Invalid bunker URI');
  }

  // Create bunker signer
  const bunker = BunkerSigner.fromBunker(clientSecretKey, bunkerPointer, {
    onauth: (url: string) => {
      console.log('Bunker auth URL:', url);
      // Could open this URL for additional auth if needed
    }
  });

  // Connect to bunker
  await bunker.connect();

  // Get user's public key
  const pubkey = await bunker.getPublicKey();

  bunkerInstance = bunker;
  currentSigner = bunker;
  currentUser = {
    pubkey,
    npub: npubEncode(pubkey),
    method: 'bunker'
  };

  // Save bunker URI for reconnection (encrypted in Stronghold)
  await saveSession('bunker', bunkerUri);

  notifyListeners();
  return currentUser;
}

/**
 * Logout and clear session
 */
export async function logout(): Promise<void> {
  if (bunkerInstance) {
    bunkerInstance.close();
    bunkerInstance = null;
  }

  currentUser = null;
  currentSigner = null;

  // Clear from Stronghold
  await clearSession();

  notifyListeners();
}

/**
 * Try to restore session from keyring
 * Uses a guard to prevent multiple concurrent calls
 */
export async function restoreSession(): Promise<NostrUser | null> {
  if (currentUser) return currentUser;
  if (restoreSessionPromise) return restoreSessionPromise;

  restoreSessionPromise = doRestoreSession();
  try {
    return await restoreSessionPromise;
  } finally {
    restoreSessionPromise = null;
  }
}

async function doRestoreSession(): Promise<NostrUser | null> {
  const session = await loadSession();
  if (!session) return null;

  try {
    if (session.method === 'nsec') {
      return await loginWithNsec(session.data);
    } else if (session.method === 'bunker') {
      return await loginWithBunker(session.data);
    }
  } catch (error) {
    console.error('Failed to restore session:', error);
    await clearSession();
  }

  return null;
}

/**
 * Sign an event using current signer
 */
export async function signEvent(event: EventTemplate): Promise<VerifiedEvent> {
  if (!currentSigner) {
    throw new Error('Not logged in');
  }
  return currentSigner.signEvent(event);
}

// ============ Session Storage (System Keyring) ============

interface NostrSessionResponse {
  method: string;
  data: string;
}

/**
 * Save session to system keyring
 */
async function saveSession(method: AuthMethod, data: string): Promise<void> {
  await invoke('save_nostr_session', { method, data });
}

/**
 * Load session from system keyring
 */
async function loadSession(): Promise<{ method: AuthMethod; data: string } | null> {
  try {
    const session = await invoke<NostrSessionResponse | null>('load_nostr_session');
    if (!session) return null;
    return { method: session.method as AuthMethod, data: session.data };
  } catch (err) {
    console.error('Failed to load session:', err);
    return null;
  }
}

/**
 * Clear session from system keyring
 */
async function clearSession(): Promise<void> {
  try {
    await invoke('clear_nostr_session');
  } catch (err) {
    console.error('Failed to clear session:', err);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
