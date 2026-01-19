/**
 * Nostr Authentication Service
 *
 * Supports two authentication methods:
 * - Bunker (NIP-46) - Remote signing, more secure
 * - nsec - Direct private key, stored securely in Stronghold
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode, npubEncode, decode } from 'nostr-tools/nip19';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools/pure';
import { Stronghold, Client as StrongholdClient } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';

// Stronghold configuration
const VAULT_NAME = 'nostr-vault';
const AUTH_METHOD_KEY = 'auth_method';
const AUTH_DATA_KEY = 'auth_data';
let stronghold: Stronghold | null = null;
let strongholdClient: StrongholdClient | null = null;

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

  // Save to Stronghold (encrypted)
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
 * Try to restore session from Stronghold
 */
export async function restoreSession(): Promise<NostrUser | null> {
  const session = await loadSession();

  if (!session) {
    return null;
  }

  try {
    if (session.method === 'nsec') {
      return await loginWithNsec(session.data);
    } else if (session.method === 'bunker') {
      return await loginWithBunker(session.data);
    }
  } catch (error) {
    console.error('Failed to restore session:', error);
    // Clear invalid session
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

// ============ Stronghold Helpers ============

/**
 * Initialize Stronghold vault
 */
async function initStronghold(): Promise<void> {
  if (stronghold) return;

  const dataDir = await appDataDir();
  const vaultPath = `${dataDir}/nostr.stronghold`;

  // Use a fixed password derived from the app - in production you might want user input
  // The actual encryption uses Argon2 in the Rust side
  stronghold = await Stronghold.load(vaultPath, 'nostr-music-player');

  // Get or create a client for the vault
  try {
    strongholdClient = await stronghold.loadClient(VAULT_NAME);
  } catch {
    strongholdClient = await stronghold.createClient(VAULT_NAME);
  }
}

/**
 * Save session to Stronghold (encrypted)
 */
async function saveSession(method: AuthMethod, data: string): Promise<void> {
  await initStronghold();
  if (!strongholdClient) throw new Error('Stronghold not initialized');

  const store = strongholdClient.getStore();
  await store.insert(AUTH_METHOD_KEY, Array.from(new TextEncoder().encode(method)));
  await store.insert(AUTH_DATA_KEY, Array.from(new TextEncoder().encode(data)));
  await stronghold!.save();
}

/**
 * Load session from Stronghold
 */
async function loadSession(): Promise<{ method: AuthMethod; data: string } | null> {
  try {
    await initStronghold();
    if (!strongholdClient) return null;

    const store = strongholdClient.getStore();
    const methodBytes = await store.get(AUTH_METHOD_KEY);
    const dataBytes = await store.get(AUTH_DATA_KEY);

    if (!methodBytes || !dataBytes) return null;

    const method = new TextDecoder().decode(new Uint8Array(methodBytes)) as AuthMethod;
    const data = new TextDecoder().decode(new Uint8Array(dataBytes));

    return { method, data };
  } catch (err) {
    console.error('Failed to load session from Stronghold:', err);
    return null;
  }
}

/**
 * Clear session from Stronghold
 */
async function clearSession(): Promise<void> {
  try {
    await initStronghold();
    if (!strongholdClient) return;

    const store = strongholdClient.getStore();
    await store.remove(AUTH_METHOD_KEY);
    await store.remove(AUTH_DATA_KEY);
    await stronghold!.save();
  } catch (err) {
    console.error('Failed to clear Stronghold session:', err);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
