/**
 * Authentication State Store
 *
 * Manages user authentication state and user info.
 * Now supports Nostr authentication (bunker + nsec).
 */

import {
  getCurrentUser,
  isLoggedIn as nostrIsLoggedIn,
  loginWithBunker,
  loginWithNsec,
  logout as nostrLogout,
  restoreSession,
  type NostrUser
} from '$lib/nostr/auth';
import { fetchProfile, initPool } from '$lib/nostr/client';

export interface UserInfo {
  userName: string;
  subscription?: string;
  picture?: string;
  // Nostr-specific
  pubkey?: string;
  npub?: string;
  authMethod?: 'bunker' | 'nsec';
}

// Auth state
let isLoggedIn = false;
let userInfo: UserInfo | null = null;

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
  listener(); // Immediately notify with current state
  return () => listeners.delete(listener);
}

// ============ Getters ============

export function getIsLoggedIn(): boolean {
  return isLoggedIn;
}

export function getUserInfo(): UserInfo | null {
  return userInfo;
}

// ============ Nostr Actions ============

/**
 * Login with Nostr bunker (NIP-46)
 */
export async function loginNostrBunker(bunkerUri: string): Promise<void> {
  const user = await loginWithBunker(bunkerUri);
  await setLoggedInNostr(user);
}

/**
 * Login with Nostr nsec
 */
export async function loginNostrNsec(nsec: string): Promise<void> {
  const user = await loginWithNsec(nsec);
  await setLoggedInNostr(user);
}

/**
 * Try to restore Nostr session from localStorage
 */
export async function tryRestoreNostrSession(): Promise<boolean> {
  const user = await restoreSession();
  if (user) {
    await setLoggedInNostr(user);
    return true;
  }
  return false;
}

/**
 * Set logged in state from Nostr user
 */
export async function setLoggedInNostr(user: NostrUser): Promise<void> {
  isLoggedIn = true;
  userInfo = {
    userName: user.npub.slice(0, 12) + '...',
    pubkey: user.pubkey,
    npub: user.npub,
    authMethod: user.method
  };
  notifyListeners();

  // Fetch profile to get display name and picture
  try {
    initPool();
    const profile = await fetchProfile(user.pubkey);
    if (profile) {
      userInfo = {
        ...userInfo!,
        userName: profile.displayName || profile.name || userInfo!.userName,
        picture: profile.picture
      };
      notifyListeners();
    }
  } catch (err) {
    console.error('Failed to fetch profile:', err);
  }
}

/**
 * Logout from Nostr
 */
export async function logoutNostr(): Promise<void> {
  await nostrLogout();
  setLoggedOut();
}

// ============ Legacy Actions (Qobuz) ============

/**
 * Set login state after successful authentication
 */
export function setLoggedIn(info: UserInfo): void {
  isLoggedIn = true;
  userInfo = info;
  notifyListeners();
}

/**
 * Clear auth state on logout
 */
export function setLoggedOut(): void {
  isLoggedIn = false;
  userInfo = null;
  notifyListeners();
}

// ============ State Getter ============

export interface AuthState {
  isLoggedIn: boolean;
  userInfo: UserInfo | null;
}

export function getAuthState(): AuthState {
  return {
    isLoggedIn,
    userInfo
  };
}
