/**
 * Qobuz Adapters
 *
 * Centralizes Qobuz API -> UI model conversion functions.
 * Eliminates duplicate formatting logic across the codebase.
 */

import type {
  QobuzAlbum,
  QobuzArtist,
  QobuzPlaylist,
  QobuzTrack,
  AlbumDetail,
  ArtistDetail
} from '$lib/types';

// ============ Formatting Utilities ============

/**
 * Format duration in seconds to "M:SS" format
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Alias for formatDuration (they were identical)
 */
export const formatDurationMinutes = formatDuration;

/**
 * Extract best available image from Qobuz image object
 */
export function getQobuzImage(image?: { large?: string; thumbnail?: string; small?: string }): string {
  return image?.large || image?.thumbnail || image?.small || '';
}

/**
 * Format quality string from bit depth and sampling rate
 */
export function formatQuality(
  hires: boolean | undefined,
  bitDepth: number | undefined,
  samplingRate: number | undefined
): string {
  if (hires && bitDepth && samplingRate) {
    return `${bitDepth}bit/${samplingRate}kHz`;
  }
  return 'CD Quality';
}

/**
 * Format album quality string (different format with dash)
 */
export function formatAlbumQuality(
  hires: boolean | undefined,
  bitDepth: number | undefined,
  samplingRate: number | undefined
): string {
  if (hires && bitDepth && samplingRate) {
    return `${bitDepth}-Bit / ${samplingRate} kHz`;
  }
  return 'CD Quality';
}

type ArtistAlbumSummary = ArtistDetail['albums'][number];
type ArtistPlaylistSummary = ArtistDetail['playlists'][number];

/**
 * Check if album belongs to a different artist (should go to Others)
 * This catches albums that appear in an artist's discography but are actually by someone else
 */
function isDifferentArtist(album: QobuzAlbum, mainArtistId: number | undefined): boolean {
  if (!mainArtistId || !album.artist?.id) return false;

  // If the album's primary artist ID doesn't match the artist we're viewing
  return album.artist.id !== mainArtistId;
}

/**
 * Check if this is an unofficial/bootleg release (should go to Others)
 */
function isUnofficialRelease(album: QobuzAlbum): boolean {
  const title = album.title?.toLowerCase() ?? '';
  const label = album.label?.name?.toLowerCase() ?? '';

  // FM Broadcasts, radio recordings, bootlegs
  const broadcastPatterns = /\b(fm broadcast|radio broadcast|broadcast|bootleg|unofficial|pirate)\b/;

  // Interview albums, spoken word that isn't the artist's music
  const nonMusicPatterns = /\b(interview|speaks|talking|in their own words)\b/;

  // Labels known for unofficial releases
  const bootlegLabels = /\b(leftfield media|purple pyramid|cleopatra|laser media)\b/;

  return broadcastPatterns.test(title) ||
         nonMusicPatterns.test(title) ||
         bootlegLabels.test(label);
}

/**
 * Check if this is a compilation/greatest hits (should go to Others)
 */
function isCompilationAlbum(album: QobuzAlbum): boolean {
  const title = album.title?.toLowerCase() ?? '';

  // Greatest hits, best of, anthologies
  const compilationPatterns = /\b(greatest hits|best of|anthology|the very best|essential|definitive collection|gold|platinum|hits collection|complete collection|hit collection)\b/;

  // Tribute albums, cover albums (not by the original artist)
  const tributePatterns = /\b(tribute to|tribute|covers?|as made famous|karaoke)\b/;

  // Various artists compilations
  const variousPatterns = /\b(various artists|v\.?a\.?|original soundtrack|ost)\b/;

  return compilationPatterns.test(title) ||
         tributePatterns.test(title) ||
         variousPatterns.test(title);
}

/**
 * Check if this is a live album (legitimate live recordings)
 */
function isLiveAlbum(album: QobuzAlbum): boolean {
  const title = album.title?.toLowerCase() ?? '';
  const genre = album.genre?.name?.toLowerCase() ?? '';

  // Don't classify FM broadcasts as live - they go to Others
  if (/\b(fm broadcast|radio broadcast|broadcast)\b/.test(title)) {
    return false;
  }

  // Genre explicitly says live
  if (genre.includes('live')) return true;

  // Common live album patterns
  const livePatterns = /\blive\b|\blive at\b|\blive in\b|\bin concert\b|\bunplugged\b|\bmtv unplugged\b|\bacoustic live\b/;

  // Tour recordings (but not "tour edition" which is a studio album variant)
  const tourPatterns = /\b(tour|on tour)\b(?!.*\bedition\b)/;

  // Location + year pattern common in live albums (e.g., "Dallas 1989", "Tokyo 1986")
  // But exclude if it also says "remaster" or "deluxe" which indicates studio album
  const locationYearPattern = /\b[A-Z][a-z]+\s*(19|20)\d{2}\b/;
  const isStudioVariant = /\b(remaster|deluxe|anniversary|expanded)\b/.test(title);

  if (livePatterns.test(title)) return true;
  if (tourPatterns.test(title) && !isStudioVariant) return true;
  if (locationYearPattern.test(album.title ?? '') && !isStudioVariant && /\blive\b/.test(title)) return true;

  return false;
}

/**
 * Check if this is an EP or Single
 * More conservative than before - only if explicitly marked or very short
 */
function isEpOrSingle(album: QobuzAlbum): boolean {
  const trackCount = album.tracks_count ?? 0;
  const duration = album.duration ?? 0;
  const title = album.title?.toLowerCase() ?? '';

  // Explicitly marked as EP or Single in title
  if (/\b(- ep|\.ep|\(ep\)|- single|\(single\)|single)\b/.test(title)) return true;
  if (/\bep\s*$/.test(title)) return true; // Ends with "EP"

  // Very short releases: 1-3 tracks OR under 15 minutes
  // This is more conservative - 8 tracks could be a full album
  if (trackCount > 0 && trackCount <= 3) return true;
  if (duration > 0 && duration <= 900) return true; // 15 minutes

  // 4-6 tracks AND under 25 minutes = likely EP
  if (trackCount >= 4 && trackCount <= 6 && duration > 0 && duration <= 1500) return true;

  return false;
}

/**
 * Check if this should remain in main Discography (studio albums)
 * Deluxe editions, remasters, anniversary editions of studio albums stay here
 */
function isStudioAlbum(album: QobuzAlbum): boolean {
  const title = album.title?.toLowerCase() ?? '';
  const trackCount = album.tracks_count ?? 0;
  const duration = album.duration ?? 0;

  // Deluxe, remastered, anniversary editions are studio albums
  const studioVariantPatterns = /\b(deluxe|remaster|anniversary|expanded|special edition|collector|box set)\b/;

  // If it has these patterns and reasonable length, it's a studio album
  if (studioVariantPatterns.test(title)) {
    // Box sets with many tracks are still studio albums
    if (trackCount >= 8 || duration >= 2400) return true; // 40+ minutes
  }

  // Standard album: 8+ tracks or 30+ minutes
  if (trackCount >= 8) return true;
  if (duration >= 1800) return true; // 30 minutes

  return false;
}

function toArtistAlbumSummary(album: QobuzAlbum): ArtistAlbumSummary {
  const artwork = getQobuzImage(album.image);
  const quality = formatQuality(
    album.hires_streamable,
    album.maximum_bit_depth,
    album.maximum_sampling_rate
  );

  return {
    id: album.id,
    title: album.title,
    artwork,
    year: album.release_date_original?.split('-')[0],
    quality
  };
}

function buildCompilationAlbums(tracks: QobuzTrack[] | undefined): ArtistAlbumSummary[] {
  if (!tracks || tracks.length === 0) return [];

  const seen = new Set<string>();
  const compilations: ArtistAlbumSummary[] = [];

  for (const track of tracks) {
    const album = track.album;
    if (!album?.id || seen.has(album.id)) continue;

    seen.add(album.id);
    compilations.push({
      id: album.id,
      title: album.title,
      artwork: getQobuzImage(album.image),
      year: undefined,
      quality: formatQuality(
        track.hires_streamable,
        track.maximum_bit_depth,
        track.maximum_sampling_rate
      )
    });
  }

  return compilations;
}

function toArtistPlaylists(playlists: QobuzPlaylist[] | undefined): ArtistPlaylistSummary[] {
  if (!playlists) return [];

  return playlists.map(playlist => ({
    id: playlist.id,
    title: playlist.name,
    artwork: playlist.images?.[0],
    trackCount: playlist.tracks_count,
    owner: playlist.owner?.name
  }));
}

// ============ Model Converters ============

/**
 * Convert Qobuz API album response to UI AlbumDetail model
 */
export function convertQobuzAlbum(album: QobuzAlbum): AlbumDetail {
  const artwork = getQobuzImage(album.image);
  const quality = formatAlbumQuality(
    album.hires_streamable,
    album.maximum_bit_depth,
    album.maximum_sampling_rate
  );

  return {
    id: album.id,
    artwork,
    title: album.title,
    artist: album.artist?.name || 'Unknown Artist',
    artistId: album.artist?.id,
    year: album.release_date_original?.split('-')[0] || '',
    label: album.label?.name || '',
    genre: album.genre?.name || '',
    quality,
    trackCount: album.tracks_count || album.tracks?.items?.length || 0,
    duration: formatDuration(album.duration || 0),
    tracks: album.tracks?.items?.map((track, index) => ({
      id: track.id,
      number: index + 1,
      title: track.title,
      artist: track.performer?.name,
      duration: formatDuration(track.duration),
      durationSeconds: track.duration,
      quality: track.hires_streamable ? 'Hi-Res' : 'CD',
      hires: track.hires_streamable,
      bitDepth: track.maximum_bit_depth,
      samplingRate: track.maximum_sampling_rate,
      albumId: album.id,
      artistId: track.performer?.id ?? album.artist?.id,
      isrc: track.isrc
    })) || []
  };
}

/**
 * Categorize an album into the appropriate section
 * Priority order matters - check most specific categories first
 */
function categorizeAlbum(album: QobuzAlbum, mainArtistId: number): 'others' | 'live' | 'eps' | 'albums' {
  // 1. Different artist -> Others (highest priority)
  if (isDifferentArtist(album, mainArtistId)) {
    return 'others';
  }

  // 2. Unofficial releases (broadcasts, bootlegs) -> Others
  if (isUnofficialRelease(album)) {
    return 'others';
  }

  // 3. Compilations (greatest hits, tributes) -> Others
  if (isCompilationAlbum(album)) {
    return 'others';
  }

  // 4. Live albums -> Live
  if (isLiveAlbum(album)) {
    return 'live';
  }

  // 5. Check if it's a studio album first (deluxe, remasters, long albums)
  // This prevents deluxe editions from being classified as EPs
  if (isStudioAlbum(album)) {
    return 'albums';
  }

  // 6. EPs and Singles (only if not already classified as studio album)
  if (isEpOrSingle(album)) {
    return 'eps';
  }

  // 7. Default: treat as studio album
  return 'albums';
}

/**
 * Convert Qobuz API artist response to UI ArtistDetail model
 */
export function convertQobuzArtist(artist: QobuzArtist): ArtistDetail {
  const image = getQobuzImage(artist.image);
  const albumItems = artist.albums?.items || [];
  const albumsFetched = (artist.albums?.offset || 0) + albumItems.length;

  const albums: ArtistAlbumSummary[] = [];
  const epsSingles: ArtistAlbumSummary[] = [];
  const liveAlbums: ArtistAlbumSummary[] = [];
  const others: ArtistAlbumSummary[] = [];

  for (const album of albumItems) {
    const summary = toArtistAlbumSummary(album);
    const category = categorizeAlbum(album, artist.id);

    switch (category) {
      case 'live':
        liveAlbums.push(summary);
        break;
      case 'eps':
        epsSingles.push(summary);
        break;
      case 'others':
        others.push(summary);
        break;
      case 'albums':
      default:
        albums.push(summary);
        break;
    }
  }

  return {
    id: artist.id,
    name: artist.name,
    image,
    albumsCount: artist.albums_count,
    biography: artist.biography,
    albums,
    epsSingles,
    liveAlbums,
    compilations: buildCompilationAlbums(artist.tracks_appears_on?.items),
    others,
    playlists: toArtistPlaylists(artist.playlists),
    totalAlbums: artist.albums?.total || artist.albums_count || 0,
    albumsFetched
  };
}

export function appendArtistAlbums(
  artist: ArtistDetail,
  newAlbums: QobuzAlbum[],
  totalAlbums?: number,
  albumsFetched?: number
): ArtistDetail {
  if (newAlbums.length === 0) return artist;

  const existingAlbumIds = new Set(artist.albums.map(album => album.id));
  const existingEpIds = new Set(artist.epsSingles.map(album => album.id));
  const existingLiveIds = new Set(artist.liveAlbums.map(album => album.id));
  const existingOtherIds = new Set(artist.others.map(album => album.id));

  const albums = [...artist.albums];
  const epsSingles = [...artist.epsSingles];
  const liveAlbums = [...artist.liveAlbums];
  const others = [...artist.others];

  for (const album of newAlbums) {
    const summary = toArtistAlbumSummary(album);
    const category = categorizeAlbum(album, artist.id);

    switch (category) {
      case 'live':
        if (!existingLiveIds.has(summary.id)) {
          liveAlbums.push(summary);
          existingLiveIds.add(summary.id);
        }
        break;
      case 'eps':
        if (!existingEpIds.has(summary.id)) {
          epsSingles.push(summary);
          existingEpIds.add(summary.id);
        }
        break;
      case 'others':
        if (!existingOtherIds.has(summary.id)) {
          others.push(summary);
          existingOtherIds.add(summary.id);
        }
        break;
      case 'albums':
      default:
        if (!existingAlbumIds.has(summary.id)) {
          albums.push(summary);
          existingAlbumIds.add(summary.id);
        }
        break;
    }
  }

  return {
    ...artist,
    albums,
    epsSingles,
    liveAlbums,
    others,
    totalAlbums: totalAlbums ?? artist.totalAlbums,
    albumsFetched: albumsFetched ?? artist.albumsFetched + newAlbums.length
  };
}
