<script lang="ts">
  import { ArrowLeft, Play, Shuffle, Plus, ListMusic } from 'lucide-svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import TrackRow from '../TrackRow.svelte';

  interface PlaylistTrack {
    id: number;
    title: string;
    duration: number;
    track_number: number;
    performer?: { name: string };
    album?: { id: string; title: string; image: { small?: string; thumbnail?: string; large?: string } };
    hires: boolean;
    maximum_bit_depth?: number;
    maximum_sampling_rate?: number;
  }

  interface Playlist {
    id: number;
    name: string;
    description?: string;
    owner: { id: number; name: string };
    images?: string[];
    tracks_count: number;
    duration: number;
    is_public: boolean;
    tracks?: { items: PlaylistTrack[]; total: number };
  }

  interface DisplayTrack {
    id: number;
    number: number;
    title: string;
    artist?: string;
    album?: string;
    albumArt?: string;
    duration: string;
    durationSeconds: number;
    hires?: boolean;
    bitDepth?: number;
    samplingRate?: number;
  }

  interface Props {
    playlistId: number;
    onBack: () => void;
    onTrackPlay?: (track: DisplayTrack) => void;
  }

  let { playlistId, onBack, onTrackPlay }: Props = $props();

  let playlist = $state<Playlist | null>(null);
  let tracks = $state<DisplayTrack[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let playBtnHovered = $state(false);

  onMount(() => {
    loadPlaylist();
  });

  async function loadPlaylist() {
    loading = true;
    error = null;
    try {
      const result = await invoke<Playlist>('get_playlist', { playlistId });
      playlist = result;

      if (result.tracks?.items) {
        tracks = result.tracks.items.map((t, idx) => ({
          id: t.id,
          number: idx + 1,
          title: t.title,
          artist: t.performer?.name,
          album: t.album?.title,
          albumArt: t.album?.image?.thumbnail || t.album?.image?.small,
          duration: formatDuration(t.duration),
          durationSeconds: t.duration,
          hires: t.hires,
          bitDepth: t.maximum_bit_depth,
          samplingRate: t.maximum_sampling_rate,
        }));
      }
    } catch (err) {
      console.error('Failed to load playlist:', err);
      error = String(err);
    } finally {
      loading = false;
    }
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatTotalDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} hr ${mins} min`;
    }
    return `${mins} min`;
  }

  function getPlaylistImage(): string {
    if (playlist?.images && playlist.images.length > 0) {
      return playlist.images[0];
    }
    // Return first track's album art if available
    if (tracks.length > 0 && tracks[0].albumArt) {
      return tracks[0].albumArt;
    }
    return '';
  }

  function handleTrackClick(track: DisplayTrack) {
    if (onTrackPlay) {
      onTrackPlay(track);
    }
  }

  async function handlePlayAll() {
    if (tracks.length > 0 && onTrackPlay) {
      // Set queue with all tracks and play first
      const queueTracks = tracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist || 'Unknown Artist',
        album: t.album || playlist?.name || 'Playlist',
        duration_secs: t.durationSeconds,
        artwork_url: t.albumArt || getPlaylistImage(),
      }));

      try {
        await invoke('set_queue', { tracks: queueTracks, startIndex: 0 });
        onTrackPlay(tracks[0]);
      } catch (err) {
        console.error('Failed to set queue:', err);
      }
    }
  }

  async function handleShuffle() {
    if (tracks.length > 0 && onTrackPlay) {
      try {
        await invoke('set_shuffle', { enabled: true });
        await handlePlayAll();
      } catch (err) {
        console.error('Failed to shuffle:', err);
      }
    }
  }

  async function handleAddToQueue() {
    if (tracks.length > 0) {
      const queueTracks = tracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist || 'Unknown Artist',
        album: t.album || playlist?.name || 'Playlist',
        duration_secs: t.durationSeconds,
        artwork_url: t.albumArt || getPlaylistImage(),
      }));

      try {
        await invoke('add_tracks_to_queue', { tracks: queueTracks });
      } catch (err) {
        console.error('Failed to add to queue:', err);
      }
    }
  }
</script>

<div class="playlist-detail">
  <!-- Back Navigation -->
  <button class="back-btn" onclick={onBack}>
    <ArrowLeft size={16} />
    <span>Back</span>
  </button>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading playlist...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>Failed to load playlist</p>
      <p class="error-detail">{error}</p>
      <button class="retry-btn" onclick={loadPlaylist}>Retry</button>
    </div>
  {:else if playlist}
    <!-- Playlist Header -->
    <div class="playlist-header">
      <!-- Playlist Artwork -->
      <div class="artwork">
        {#if getPlaylistImage()}
          <img src={getPlaylistImage()} alt={playlist.name} />
        {:else}
          <div class="artwork-placeholder">
            <ListMusic size={64} />
          </div>
        {/if}
      </div>

      <!-- Playlist Metadata -->
      <div class="metadata">
        <span class="playlist-label">Playlist</span>
        <h1 class="playlist-title">{playlist.name}</h1>
        {#if playlist.description}
          <p class="playlist-description">{playlist.description}</p>
        {/if}
        <div class="playlist-info">
          <span class="owner">{playlist.owner.name}</span>
          <span class="separator">•</span>
          <span>{playlist.tracks_count} tracks</span>
          <span class="separator">•</span>
          <span>{formatTotalDuration(playlist.duration)}</span>
        </div>

        <!-- Action Buttons -->
        <div class="actions">
          <button
            class="play-btn"
            style="background-color: {playBtnHovered ? 'var(--accent-hover)' : 'var(--accent-primary)'}"
            onmouseenter={() => (playBtnHovered = true)}
            onmouseleave={() => (playBtnHovered = false)}
            onclick={handlePlayAll}
          >
            <Play size={18} fill="white" color="white" />
            <span>Play</span>
          </button>
          <button class="secondary-btn" onclick={handleShuffle}>
            <Shuffle size={18} />
            <span>Shuffle</span>
          </button>
          <button class="icon-btn" onclick={handleAddToQueue} title="Add all to queue">
            <Plus size={20} color="white" />
          </button>
        </div>
      </div>
    </div>

    <!-- Track List -->
    <div class="track-list">
      <div class="track-list-header">
        <span class="col-number">#</span>
        <span class="col-title">Title</span>
        <span class="col-album">Album</span>
        <span class="col-duration">Duration</span>
      </div>

      {#each tracks as track (track.id)}
        <TrackRow
          number={track.number}
          title={track.title}
          artist={track.artist}
          duration={track.duration}
          hires={track.hires}
          bitDepth={track.bitDepth}
          samplingRate={track.samplingRate}
          onclick={() => handleTrackClick(track)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .playlist-detail {
    padding: 24px;
    padding-bottom: 100px;
    overflow-y: auto;
    height: 100%;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 14px;
    margin-bottom: 24px;
    transition: color 150ms ease;
  }

  .back-btn:hover {
    color: var(--text-primary);
  }

  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px;
    color: var(--text-muted);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--bg-tertiary);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-detail {
    font-size: 12px;
    margin-top: 8px;
  }

  .retry-btn {
    margin-top: 16px;
    padding: 8px 24px;
    background-color: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  .playlist-header {
    display: flex;
    gap: 32px;
    margin-bottom: 32px;
  }

  .artwork {
    width: 232px;
    height: 232px;
    flex-shrink: 0;
    border-radius: 8px;
    overflow: hidden;
    background-color: var(--bg-tertiary);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .artwork img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .artwork-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .metadata {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-width: 0;
  }

  .playlist-label {
    font-size: 12px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-weight: 600;
    letter-spacing: 0.1em;
    margin-bottom: 8px;
  }

  .playlist-title {
    font-size: 48px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 8px 0;
    line-height: 1.1;
  }

  .playlist-description {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 0 0 12px 0;
    line-height: 1.4;
  }

  .playlist-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 24px;
  }

  .owner {
    font-weight: 500;
    color: var(--text-primary);
  }

  .separator {
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .play-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 32px;
    background-color: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .secondary-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background-color: transparent;
    color: var(--text-primary);
    border: 1px solid var(--text-muted);
    border-radius: 24px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 150ms ease;
  }

  .secondary-btn:hover {
    border-color: var(--text-primary);
  }

  .icon-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 150ms ease;
  }

  .icon-btn:hover {
    opacity: 1;
  }

  .track-list {
    margin-top: 24px;
  }

  .track-list-header {
    display: grid;
    grid-template-columns: 48px 1fr 1fr 80px;
    gap: 16px;
    padding: 8px 16px;
    font-size: 12px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-weight: 600;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--bg-tertiary);
    margin-bottom: 8px;
  }

  .col-number {
    text-align: center;
  }

  .col-duration {
    text-align: right;
  }
</style>
