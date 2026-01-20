/**
 * Blossom Client
 *
 * Handles file uploads to Blossom servers with NIP-98 authentication.
 * Blossom is a protocol for uploading files to servers using Nostr auth.
 */

import { signEvent } from './auth';
import { readFile } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';

// NIP-98 HTTP Auth kind
const HTTP_AUTH_KIND = 24242;

// Default Blossom servers
export const DEFAULT_BLOSSOM_SERVERS = [
  'https://blossom.primal.net',
  'https://blossom.yakihonne.com',
  'https://blossom-01.uid.ovh',
  'https://blossom-02.uid.ovh',
];

// Supported formats
export const SUPPORTED_AUDIO_FORMATS = ['mp3', 'flac', 'ogg', 'm4a', 'wav', 'aac', 'opus', 'webm'];
export const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
export const SUPPORTED_VIDEO_FORMATS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

export interface BlossomUploadResult {
  url: string;
  sha256: string;
  size: number;
  mimeType: string;
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const mimeTypes: Record<string, string> = {
    // Audio
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    aac: 'audio/aac',
    opus: 'audio/opus',
    webm: 'audio/webm',
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    // Video
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska'
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Get audio format from file extension
 */
export function getAudioFormat(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return ext;
}

/**
 * Check if file is a supported audio format
 */
export function isSupportedAudio(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_AUDIO_FORMATS.includes(ext);
}

/**
 * Check if file is a supported image format
 */
export function isSupportedImage(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_IMAGE_FORMATS.includes(ext);
}

/**
 * Check if file is a supported video format
 */
export function isSupportedVideo(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_VIDEO_FORMATS.includes(ext);
}

/**
 * Calculate SHA-256 hash of data
 */
async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a Blossom auth event (BUD-02)
 */
async function createBlossomAuthEvent(sha256Hash: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const event = await signEvent({
    kind: HTTP_AUTH_KIND,
    created_at: now,
    tags: [
      ['t', 'upload'],
      ['x', sha256Hash],
      ['expiration', String(now + 60)]
    ],
    content: 'Upload blob'
  });

  // Base64 encode the event for the Authorization header
  return btoa(JSON.stringify(event));
}

/**
 * Upload a file to a Blossom server
 *
 * @param filePath Path to the local file
 * @param serverUrl Blossom server URL
 * @returns Upload result with URL and metadata
 */
export async function uploadToBlossom(
  filePath: string,
  serverUrl: string = DEFAULT_BLOSSOM_SERVERS[0]
): Promise<BlossomUploadResult> {
  // Read file content
  const fileData = await readFile(filePath);

  // Calculate SHA-256 hash
  const hash = await sha256(fileData);

  // Get MIME type
  const mimeType = getMimeType(filePath);

  // Create auth event
  const uploadUrl = `${serverUrl}/upload`;
  const authToken = await createBlossomAuthEvent(hash);

  // Upload file
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Authorization': `Nostr ${authToken}`
    },
    body: fileData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }

  const result = await response.json() as {
    url?: string;
    sha256?: string;
    size?: number;
    type?: string;
  };

  // Blossom servers return the URL to the uploaded file
  // The URL is typically: serverUrl/<sha256>.<extension>
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const fileUrl = result.url || `${serverUrl}/${hash}.${ext}`;

  return {
    url: fileUrl,
    sha256: result.sha256 || hash,
    size: result.size || fileData.length,
    mimeType: result.type || mimeType
  };
}

/**
 * Upload an audio file to Blossom
 */
export async function uploadAudioToBlossom(
  filePath: string,
  serverUrl: string = DEFAULT_BLOSSOM_SERVERS[0]
): Promise<BlossomUploadResult> {
  if (!isSupportedAudio(filePath)) {
    throw new Error(`Unsupported audio format. Supported: ${SUPPORTED_AUDIO_FORMATS.join(', ')}`);
  }
  return uploadToBlossom(filePath, serverUrl);
}

/**
 * Upload an image file to Blossom
 */
export async function uploadImageToBlossom(
  filePath: string,
  serverUrl: string = DEFAULT_BLOSSOM_SERVERS[0]
): Promise<BlossomUploadResult> {
  if (!isSupportedImage(filePath)) {
    throw new Error(`Unsupported image format. Supported: ${SUPPORTED_IMAGE_FORMATS.join(', ')}`);
  }
  return uploadToBlossom(filePath, serverUrl);
}

/**
 * Upload a video file to Blossom
 */
export async function uploadVideoToBlossom(
  filePath: string,
  serverUrl: string = DEFAULT_BLOSSOM_SERVERS[0]
): Promise<BlossomUploadResult> {
  if (!isSupportedVideo(filePath)) {
    throw new Error(`Unsupported video format. Supported: ${SUPPORTED_VIDEO_FORMATS.join(', ')}`);
  }
  return uploadToBlossom(filePath, serverUrl);
}
