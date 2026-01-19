/**
 * Nostr Module
 *
 * Central exports for all Nostr functionality
 */

// Auth
export {
  loginWithNsec,
  loginWithBunker,
  logout,
  restoreSession,
  getCurrentUser,
  getSigner,
  isLoggedIn,
  signEvent,
  subscribe as subscribeAuth,
  type AuthMethod,
  type NostrUser
} from './auth';

// Types
export {
  MUSIC_TRACK_KIND,
  PLAYLIST_KIND,
  parseMusicTrackEvent,
  parsePlaylistEvent,
  createTrackReference,
  type NostrMusicTrack,
  type NostrPlaylist,
  type TrackReference,
  type ZapSplit
} from './types';

// Client
export {
  initPool,
  getPool,
  getRelays,
  setRelays,
  closePool,
  fetchTracksByArtist,
  fetchTrack,
  fetchTracksByRefs,
  fetchPlaylistsByOwner,
  fetchPlaylist,
  fetchPlaylistWithTracks,
  searchTracks,
  fetchRecentTracks,
  fetchTracksByGenre,
  subscribeToTracks,
  subscribeToPlaylists
} from './client';

// Player
export {
  initPlayer,
  destroyPlayer,
  playTrack as playerPlayTrack,
  setQueue,
  togglePlay,
  play,
  pause,
  stop,
  seek,
  setVolume,
  next,
  previous,
  playIndex,
  toggleShuffle,
  toggleRepeat,
  subscribe as subscribePlayer,
  getState as getPlayerState,
  formatTime
} from './player';

// Adapters
export {
  formatDuration,
  formatQuality,
  shortNpub,
  nostrTrackToTrack,
  nostrTrackToDisplayTrack,
  nostrTrackToPlaylistTrack,
  nostrTrackToTrackInfo,
  nostrPlaylistToPlaylistInfo,
  nostrTrackToQueueTrack,
  nostrTracksToQueue,
  type NostrTrackInfo,
  type PlaylistInfo,
  type QueueTrack
} from './adapters';
