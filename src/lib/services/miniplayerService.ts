/**
 * MiniPlayer Mode Service
 *
 * Handles switching between normal and miniplayer modes by resizing
 * the main window instead of creating a separate window.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import type { PhysicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import { goto } from '$app/navigation';

// Miniplayer dimensions (Cider-inspired compact mode)
const MINIPLAYER_WIDTH = 400;
const MINIPLAYER_HEIGHT = 150;

// Store original window state for restoration
let originalSize: PhysicalSize | null = null;
let originalPosition: PhysicalPosition | null = null;
let originalMaximized = false;

/**
 * Enter miniplayer mode - resize window and navigate to miniplayer route
 */
export async function enterMiniplayerMode(): Promise<void> {
  console.log('[MiniPlayer] Entering miniplayer mode...');

  try {
    const window = getCurrentWindow();

    // Store current window state
    originalMaximized = await window.isMaximized();
    originalSize = await window.innerSize();
    originalPosition = await window.innerPosition();

    console.log('[MiniPlayer] Saved original state:', {
      size: originalSize,
      position: originalPosition,
      maximized: originalMaximized
    });

    // If maximized, unmaximize first
    if (originalMaximized) {
      await window.unmaximize();
    }

    // Set miniplayer dimensions
    await window.setResizable(false);
    await window.setSize({ type: 'Physical', width: MINIPLAYER_WIDTH, height: MINIPLAYER_HEIGHT });
    await window.setDecorations(false);
    await window.setAlwaysOnTop(true);

    // Navigate to miniplayer route
    await goto('/miniplayer');

    console.log('[MiniPlayer] Entered miniplayer mode');
  } catch (err) {
    console.error('[MiniPlayer] Failed to enter miniplayer mode:', err);
  }
}

/**
 * Exit miniplayer mode - restore original window state
 */
export async function exitMiniplayerMode(): Promise<void> {
  console.log('[MiniPlayer] Exiting miniplayer mode...');
  console.log('[MiniPlayer] Original state:', { originalSize, originalPosition, originalMaximized });

  try {
    const window = getCurrentWindow();

    // Restore window properties first
    await window.setAlwaysOnTop(false);
    await window.setDecorations(true);
    await window.setResizable(true);

    // Restore size
    if (originalSize) {
      console.log('[MiniPlayer] Restoring size:', originalSize);
      await window.setSize({ type: 'Physical', width: originalSize.width, height: originalSize.height });
    } else {
      // Fallback to default size
      console.log('[MiniPlayer] No original size, using default');
      await window.setSize({ type: 'Physical', width: 1280, height: 800 });
    }

    // Restore position
    if (originalPosition) {
      console.log('[MiniPlayer] Restoring position:', originalPosition);
      await window.setPosition({ type: 'Physical', x: originalPosition.x, y: originalPosition.y });
    }

    // Restore maximized state
    if (originalMaximized) {
      console.log('[MiniPlayer] Restoring maximized state');
      await window.maximize();
    }

    // Navigate back to main
    await goto('/');

    console.log('[MiniPlayer] Exited miniplayer mode');
  } catch (err) {
    console.error('[MiniPlayer] Failed to exit miniplayer mode:', err);
  }
}

/**
 * Set miniplayer always on top
 */
export async function setMiniplayerAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
  try {
    const window = getCurrentWindow();
    await window.setAlwaysOnTop(alwaysOnTop);
  } catch (err) {
    console.error('[MiniPlayer] Failed to set always on top:', err);
  }
}
