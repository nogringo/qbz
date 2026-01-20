<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Loader2, Play, Music, List, Pencil, Trash2, Copy, Check } from 'lucide-svelte';
  import {
    fetchPlaylistWithTracks,
    fetchProfile,
    deletePlaylist,
    type NostrProfile
  } from '$lib/nostr/client';
  import type { NostrMusicTrack, NostrPlaylist } from '$lib/nostr/types';
  import { formatDuration } from '$lib/nostr/adapters';
  import { nostrToBackendTrack, nostrToPlayingTrack, getNostrTrackIds, playNostrTrackNext, playNostrTrackLater, copyBlossomUrl, copyNaddr, copyZaptraxLink } from '$lib/nostr/trackUtils';
  import { getAuthState } from '$lib/stores/authStore';
  import { setQueue as setBackendQueue, setNostrTrackIds } from '$lib/stores/queueStore';
  import TrackMenu from '$lib/components/TrackMenu.svelte';
  import {
    subscribe as subscribePlayer,
    getPlayerState,
    playTrackUrl
  } from '$lib/stores/playerStore';

  interface Props {
    pubkey: string;
    dTag: string;
    onBack?: () => void;
    onArtistClick?: (pubkey: string) => void;
    onEditPlaylist?: (playlist: NostrPlaylist, tracks: NostrMusicTrack[]) => void;
    onAddToNostrPlaylist?: (track: NostrMusicTrack) => void;
    // Pre-loaded data (used after edit to avoid relay propagation delay)
    initialData?: { playlist: NostrPlaylist; tracks: NostrMusicTrack[] } | null;
    onInitialDataConsumed?: () => void;
  }

  let { pubkey, dTag, onBack, onArtistClick, onEditPlaylist, onAddToNostrPlaylist, initialData, onInitialDataConsumed }: Props = $props();

  // Data
  let playlist = $state<NostrPlaylist | null>(null);
  let tracks = $state<NostrMusicTrack[]>([]);
  let ownerProfile = $state<NostrProfile | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // UI state
  let copied = $state(false);
  let isDeleting = $state(false);
  let showDeleteConfirm = $state(false);

  // Player state
  let playerState = $state(getPlayerState());

  // Auth state
  let authState = $derived(getAuthState());
  let isOwner = $derived(authState.userInfo?.pubkey === pubkey);

  // Reload playlist when pubkey or dTag changes
  $effect(() => {
    // Track these values to trigger reload when they change
    const _pubkey = pubkey;
    const _dTag = dTag;
    loadPlaylist();
  });

  // Optimistic UI: instantly update when initialData changes (after edit)
  $effect(() => {
    if (initialData && initialData.playlist.pubkey === pubkey && initialData.playlist.d === dTag) {
      // Directly update state without loading
      playlist = initialData.playlist;
      tracks = initialData.tracks;
      // Notify parent to clear the data
      onInitialDataConsumed?.();
    }
  });

  onMount(() => {
    const unsubscribe = subscribePlayer(() => {
      playerState = getPlayerState();
    });

    return unsubscribe;
  });

  async function loadPlaylist() {
    isLoading = true;
    error = null;

    try {
      const result = await fetchPlaylistWithTracks(pubkey, dTag);
      if (!result) {
        error = 'Playlist not found';
        return;
      }

      playlist = result.playlist;
      tracks = result.tracks;

      // Fetch owner profile
      ownerProfile = await fetchProfile(pubkey);
    } catch (err) {
      console.error('Failed to load playlist:', err);
      error = 'Failed to load playlist';
    } finally {
      isLoading = false;
    }
  }

  async function handlePlayTrack(track: NostrMusicTrack, index: number) {
    // Convert all tracks to backend format
    const backendTracks = tracks.map(nostrToBackendTrack);

    // Track which IDs are Nostr tracks
    setNostrTrackIds(getNostrTrackIds(tracks));

    // Set queue in Rust backend
    await setBackendQueue(backendTracks, index);

    // Play the clicked track
    await playTrackUrl(track.url, nostrToPlayingTrack(track));
  }

  async function handlePlayAll() {
    if (tracks.length === 0) return;

    const firstTrack = tracks[0];

    // Convert all tracks to backend format
    const backendTracks = tracks.map(nostrToBackendTrack);

    // Track which IDs are Nostr tracks
    setNostrTrackIds(getNostrTrackIds(tracks));

    // Set queue in Rust backend
    await setBackendQueue(backendTracks, 0);

    // Play the first track
    await playTrackUrl(firstTrack.url, nostrToPlayingTrack(firstTrack));
  }

  function handleEdit() {
    if (playlist && onEditPlaylist) {
      onEditPlaylist(playlist, tracks);
    }
  }

  async function handleDelete() {
    if (!playlist || isDeleting) return;

    isDeleting = true;
    try {
      await deletePlaylist(playlist.id, playlist.d, playlist.pubkey);
      // Navigate back after deletion
      onBack?.();
    } catch (err) {
      console.error('Failed to delete playlist:', err);
      error = 'Failed to delete playlist';
    } finally {
      isDeleting = false;
      showDeleteConfirm = false;
    }
  }

  async function copyNaddrToClipboard() {
    if (!playlist) return;
    await navigator.clipboard.writeText(playlist.naddr);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  function isCurrentTrack(track: NostrMusicTrack): boolean {
    return playerState.currentTrack?.nostrEventId === track.id;
  }

  function formatTime(seconds: number | undefined): string {
    return formatDuration(seconds);
  }

  function getOwnerDisplayName(): string {
    return ownerProfile?.displayName || ownerProfile?.name || pubkey.slice(0, 12) + '...';
  }

  function getTotalDuration(): string {
    const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    }
    return `${minutes} min`;
  }
</script>

<div class="nostr-playlist-view">
  <!-- Header -->
  <div class="header">
    {#if onBack}
      <button class="back-btn" onclick={onBack}>
        <ArrowLeft size={16} />
        <span>Back</span>
      </button>
    {/if}
  </div>

  {#if isLoading}
    <div class="loading">
      <Loader2 size={32} class="spinner" />
      <span>Loading playlist...</span>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={loadPlaylist}>Retry</button>
    </div>
  {:else if playlist}
    <!-- Playlist Header -->
    <div class="playlist-header">
      {#if playlist.image}
        <img src={playlist.image} alt="" class="playlist-image" />
      {:else}
        <div class="playlist-image-placeholder">
          <List size={48} />
        </div>
      {/if}
      <div class="playlist-info">
        <span class="playlist-type">Playlist</span>
        <h1 class="playlist-title">{playlist.title}</h1>
        {#if playlist.description}
          <p class="playlist-description">{playlist.description}</p>
        {/if}
        <div class="playlist-meta">
          <button
            class="owner-link"
            onclick={() => onArtistClick?.(pubkey)}
          >
            {#if ownerProfile?.picture}
              <img src={ownerProfile.picture} alt="" class="owner-avatar" />
            {/if}
            <span>{getOwnerDisplayName()}</span>
          </button>
          <span class="meta-dot">•</span>
          <span>{tracks.length} tracks</span>
          <span class="meta-dot">•</span>
          <span>{getTotalDuration()}</span>
        </div>
        <div class="playlist-actions">
          {#if tracks.length > 0}
            <button class="play-btn" onclick={handlePlayAll}>
              <Play size={20} fill="white" />
              <span>Play All</span>
            </button>
          {/if}
          {#if isOwner}
            <button class="action-btn" onclick={handleEdit} title="Edit playlist">
              <Pencil size={18} />
            </button>
            <button
              class="action-btn danger"
              onclick={() => showDeleteConfirm = true}
              title="Delete playlist"
            >
              <Trash2 size={18} />
            </button>
          {/if}
          <button
            class="action-btn"
            class:copied
            onclick={copyNaddrToClipboard}
            title="Copy naddr"
          >
            {#if copied}
              <Check size={18} />
            {:else}
              <Copy size={18} />
            {/if}
          </button>
        </div>
      </div>
    </div>

    <!-- Track List -->
    <section class="section">
      {#if tracks.length === 0}
        <div class="empty">
          <Music size={48} />
          <p>This playlist has no tracks</p>
          {#if isOwner}
            <p class="hint">Add tracks from your favorites or while browsing</p>
          {/if}
        </div>
      {:else}
        <div class="track-list">
          {#each tracks as track, index}
            <button
              class="track-item"
              class:playing={isCurrentTrack(track)}
              onclick={() => handlePlayTrack(track, index)}
            >
              <div class="track-index">
                {#if isCurrentTrack(track) && playerState.isPlaying}
                  <div class="playing-indicator">
                    <div class="bar"></div>
                    <div class="bar"></div>
                    <div class="bar"></div>
                  </div>
                {:else}
                  {index + 1}
                {/if}
              </div>
              {#if track.image}
                <img src={track.image} alt="" class="track-art" />
              {:else}
                <div class="track-art-placeholder"><Music size={16} /></div>
              {/if}
              <div class="track-info">
                <span class="track-title">{track.title}</span>
                <span
                  class="track-artist-link"
                  role="button"
                  tabindex="0"
                  onclick={(e) => {
                    e.stopPropagation();
                    onArtistClick?.(track.pubkey);
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      onArtistClick?.(track.pubkey);
                    }
                  }}
                >
                  {track.artist}
                </span>
              </div>
              {#if track.album}
                <span class="track-album">{track.album}</span>
              {/if}
              <span class="track-duration">{track.duration ? formatTime(track.duration) : '--:--'}</span>
              <TrackMenu
                onPlayNext={() => playNostrTrackNext(track)}
                onPlayLater={() => playNostrTrackLater(track)}
                onCopyBlossomUrl={() => copyBlossomUrl(track)}
                onCopyNaddr={() => copyNaddr(track)}
                onCopyZaptraxLink={() => copyZaptraxLink(track)}
                onGoToArtist={() => onArtistClick?.(track.pubkey)}
                onAddToNostrPlaylist={() => onAddToNostrPlaylist?.(track)}
              />
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
{#if showDeleteConfirm}
  <div class="dialog-overlay" onclick={() => showDeleteConfirm = false} role="dialog" aria-modal="true">
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>Delete Playlist</h3>
      <p>Are you sure you want to delete "{playlist?.title}"? This action cannot be undone.</p>
      <div class="dialog-actions">
        <button class="dialog-btn cancel" onclick={() => showDeleteConfirm = false}>
          Cancel
        </button>
        <button class="dialog-btn delete" onclick={handleDelete} disabled={isDeleting}>
          {#if isDeleting}
            <Loader2 size={16} class="spinner" />
          {/if}
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .nostr-playlist-view {
    padding: 24px 32px;
    max-width: 1000px;
    overflow-y: auto;
    height: 100%;
  }

  /* Header */
  .header {
    margin-bottom: 24px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--text-secondary, #aaa);
    cursor: pointer;
    padding: 8px 0;
    font-size: 14px;
  }

  .back-btn:hover {
    color: var(--text-primary, #fff);
  }

  /* Loading / Error / Empty */
  .loading, .error, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px;
    color: var(--text-muted, #888);
    gap: 12px;
  }

  .empty .hint {
    font-size: 12px;
    opacity: 0.7;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Playlist Header */
  .playlist-header {
    display: flex;
    gap: 24px;
    margin-bottom: 32px;
  }

  .playlist-image, .playlist-image-placeholder {
    width: 220px;
    height: 220px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .playlist-image-placeholder {
    background: var(--bg-tertiary, #2a2a2a);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #888);
  }

  .playlist-info {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 8px;
  }

  .playlist-type {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-muted, #888);
  }

  .playlist-title {
    font-size: 42px;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary, #fff);
    line-height: 1.1;
  }

  .playlist-description {
    font-size: 14px;
    color: var(--text-secondary, #aaa);
    margin: 0;
    max-width: 500px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .playlist-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-muted, #888);
    margin-top: 4px;
  }

  .meta-dot {
    opacity: 0.5;
  }

  .owner-link {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--text-primary, #fff);
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    font-size: inherit;
  }

  .owner-link:hover {
    text-decoration: underline;
  }

  .owner-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
  }

  .playlist-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
  }

  .play-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--accent-primary, #6366f1);
    border: none;
    border-radius: 24px;
    padding: 12px 28px;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s, background 0.2s;
  }

  .play-btn:hover {
    background: var(--accent-hover, #5558e8);
    transform: scale(1.02);
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: transparent;
    border: 1px solid var(--text-muted, #888);
    border-radius: 50%;
    color: var(--text-muted, #888);
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    border-color: var(--text-primary, #fff);
    color: var(--text-primary, #fff);
    background: var(--bg-secondary, #1a1a1a);
  }

  .action-btn.danger:hover {
    border-color: #ef4444;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .action-btn.copied {
    border-color: #22c55e;
    color: #22c55e;
  }

  /* Section */
  .section {
    margin-bottom: 32px;
  }

  /* Track List */
  .track-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    color: var(--text-primary, #fff);
  }

  .track-item:hover {
    background: var(--bg-secondary, #1a1a1a);
  }

  .track-item.playing {
    background: var(--bg-secondary, #1a1a1a);
  }

  .track-item.playing .track-title {
    color: var(--accent-primary, #6366f1);
  }

  .track-index {
    width: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted, #888);
  }

  .playing-indicator {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .playing-indicator .bar {
    width: 3px;
    background-color: var(--accent-primary);
    border-radius: 9999px;
    transform-origin: bottom;
    animation: equalize 1s ease-in-out infinite;
  }

  .playing-indicator .bar:nth-child(1) {
    height: 12px;
  }

  .playing-indicator .bar:nth-child(2) {
    height: 16px;
    animation-delay: 0.15s;
  }

  .playing-indicator .bar:nth-child(3) {
    height: 10px;
    animation-delay: 0.3s;
  }

  @keyframes equalize {
    0%, 100% {
      transform: scaleY(0.5);
      opacity: 0.7;
    }
    50% {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  .track-art, .track-art-placeholder {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .track-art-placeholder {
    background: var(--bg-tertiary, #2a2a2a);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #888);
  }

  .track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .track-title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-artist-link {
    font-size: 12px;
    color: var(--text-muted, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    width: fit-content;
    max-width: 100%;
  }

  .track-artist-link:hover {
    color: var(--text-primary, #fff);
    text-decoration: underline;
  }

  .track-album {
    font-size: 12px;
    color: var(--text-muted, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .track-duration {
    font-size: 12px;
    color: var(--text-muted, #888);
    min-width: 45px;
    text-align: right;
  }

  /* Delete Dialog */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: var(--bg-primary, #0a0a0a);
    border: 1px solid var(--bg-tertiary, #2a2a2a);
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    width: 100%;
  }

  .dialog h3 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--text-primary, #fff);
  }

  .dialog p {
    font-size: 14px;
    color: var(--text-secondary, #aaa);
    margin: 0 0 24px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .dialog-btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dialog-btn.cancel {
    background: transparent;
    border: 1px solid var(--text-muted, #888);
    color: var(--text-primary, #fff);
  }

  .dialog-btn.cancel:hover {
    border-color: var(--text-primary, #fff);
    background: var(--bg-secondary, #1a1a1a);
  }

  .dialog-btn.delete {
    background: #ef4444;
    border: none;
    color: #fff;
  }

  .dialog-btn.delete:hover:not(:disabled) {
    background: #dc2626;
  }

  .dialog-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
