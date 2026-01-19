<script lang="ts">
  import { onMount } from 'svelte';
  import { Heart, Play, Music, Search, X } from 'lucide-svelte';
  import { fetchLikedTracks, unlikeTrack, type NostrMusicTrack } from '$lib/nostr/client';
  import { formatDuration } from '$lib/nostr/adapters';
  import { nostrToBackendTrack, nostrToPlayingTrack, getNostrTrackIds, playNostrTrackNext, playNostrTrackLater } from '$lib/nostr/trackUtils';
  import { getAuthState } from '$lib/stores/authStore';
  import { selectNostrArtist } from '$lib/stores/navigationStore';
  import { setQueue as setBackendQueue, setNostrTrackIds } from '$lib/stores/queueStore';
  import TrackMenu from '$lib/components/TrackMenu.svelte';
  import {
    subscribe as subscribePlayer,
    getPlayerState,
    setIsFavorite,
    playTrackUrl,
    type PlayingTrack
  } from '$lib/stores/playerStore';

  let likedTracks = $state<NostrMusicTrack[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchQuery = $state('');

  // Current playing track from playerStore
  let currentTrack = $state<PlayingTrack | null>(null);
  let isPlaying = $state(false);
  let isFavorite = $state(true); // Track favorite status for sync

  // Filtered tracks based on search
  let filteredTracks = $derived.by(() => {
    if (!searchQuery.trim()) return likedTracks;
    const query = searchQuery.toLowerCase();
    return likedTracks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.artist.toLowerCase().includes(query) ||
      (t.album?.toLowerCase().includes(query) ?? false)
    );
  });

  onMount(() => {
    loadLikedTracks();

    // Subscribe to player state for playing indicator and favorite sync
    const unsubscribe = subscribePlayer(() => {
      const state = getPlayerState();
      const prevFavorite = isFavorite;
      const prevTrackId = currentTrack?.nostrEventId;

      currentTrack = state.currentTrack;
      isPlaying = state.isPlaying;
      isFavorite = state.isFavorite;

      // If favorite changed to false for the current track, remove it from local list
      if (prevFavorite && !state.isFavorite && prevTrackId) {
        likedTracks = likedTracks.filter(t => t.id !== prevTrackId);
      }
    });

    return () => unsubscribe();
  });

  // Check if a track is the currently playing track
  function isTrackPlaying(track: NostrMusicTrack): boolean {
    if (!currentTrack || !currentTrack.nostrEventId) return false;
    return currentTrack.nostrEventId === track.id;
  }

  async function loadLikedTracks() {
    const authState = getAuthState();
    if (!authState.isLoggedIn || !authState.userInfo?.pubkey) {
      error = 'Not logged in';
      return;
    }

    loading = true;
    error = null;

    try {
      likedTracks = await fetchLikedTracks(authState.userInfo.pubkey);
    } catch (err) {
      console.error('[NostrFavorites] Failed to load liked tracks:', err);
      error = String(err);
    } finally {
      loading = false;
    }
  }

  async function handleTrackClick(track: NostrMusicTrack, index: number) {
    // Convert all tracks to backend format
    const backendTracks = filteredTracks.map(nostrToBackendTrack);

    // Track which IDs are Nostr tracks
    setNostrTrackIds(getNostrTrackIds(filteredTracks));

    // Set queue in Rust backend
    await setBackendQueue(backendTracks, index);

    // Play the clicked track
    await playTrackUrl(track.url, nostrToPlayingTrack(track));
  }

  async function handlePlayAll() {
    if (filteredTracks.length === 0) return;

    const firstTrack = filteredTracks[0];

    // Convert all tracks to backend format
    const backendTracks = filteredTracks.map(nostrToBackendTrack);

    // Track which IDs are Nostr tracks
    setNostrTrackIds(getNostrTrackIds(filteredTracks));

    // Set queue in Rust backend
    await setBackendQueue(backendTracks, 0);

    // Play the first track
    await playTrackUrl(firstTrack.url, nostrToPlayingTrack(firstTrack));
  }

  function handleArtistClick(pubkey: string) {
    selectNostrArtist(pubkey);
  }

  async function handleUnlike(track: NostrMusicTrack, event: MouseEvent) {
    event.stopPropagation(); // Don't trigger track play

    const authState = getAuthState();
    if (!authState.isLoggedIn || !authState.userInfo?.pubkey) return;

    // Optimistic UI: remove from local list immediately
    likedTracks = likedTracks.filter(t => t.id !== track.id);

    // If this is the currently playing track, update playerStore
    if (currentTrack?.nostrEventId === track.id) {
      setIsFavorite(false);
    }

    // Broadcast unlike in background
    try {
      await unlikeTrack(authState.userInfo.pubkey, track.pubkey, track.d);
    } catch (err) {
      console.error('[NostrFavorites] Failed to unlike:', err);
      // Could restore the track on error, but the cache is already updated
    }
  }

  function getQuality(track: NostrMusicTrack): string {
    if (track.format) {
      return track.format.toUpperCase();
    }
    return 'Nostr';
  }
</script>

<div class="nostr-favorites-view">
  <!-- Header -->
  <div class="header">
    <div class="header-icon">
      <Heart size={32} fill="var(--accent-primary)" color="var(--accent-primary)" />
    </div>
    <div class="header-content">
      <h1>Liked Tracks</h1>
      <p class="subtitle">Your favorite music on Nostr</p>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <!-- Search -->
    <div class="search-container">
      <Search size={16} class="search-icon" />
      <input
        type="text"
        placeholder="Search liked tracks..."
        bind:value={searchQuery}
        class="search-input"
      />
      {#if searchQuery}
        <button class="search-clear" onclick={() => searchQuery = ''}>
          <X size={14} />
        </button>
      {/if}
    </div>

    <!-- Play All Button -->
    {#if filteredTracks.length > 0}
      <div class="actions">
        <button class="play-btn" onclick={handlePlayAll}>
          <Play size={16} fill="white" />
          <span>Play All</span>
        </button>
      </div>
    {/if}

    <!-- Count -->
    <span class="results-count">
      {filteredTracks.length}{searchQuery ? ` / ${likedTracks.length}` : ''} tracks
    </span>
  </div>

  <!-- Content -->
  <div class="content">
    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading liked tracks...</p>
      </div>
    {:else if error}
      <div class="error">
        <p>Failed to load liked tracks</p>
        <p class="error-detail">{error}</p>
        <button class="retry-btn" onclick={loadLikedTracks}>Retry</button>
      </div>
    {:else if likedTracks.length === 0}
      <div class="empty">
        <Heart size={48} />
        <p>No liked tracks yet</p>
        <p class="empty-hint">Like tracks to see them here</p>
      </div>
    {:else if filteredTracks.length === 0}
      <div class="empty">
        <Search size={48} />
        <p>No tracks match "{searchQuery}"</p>
      </div>
    {:else}
      <div class="track-list">
        {#each filteredTracks as track, index (track.id)}
          {@const playing = isTrackPlaying(track)}
          <div
            class="track-row"
            class:playing
            role="button"
            tabindex="0"
            onclick={() => handleTrackClick(track, index)}
            onkeydown={(e) => e.key === 'Enter' && handleTrackClick(track, index)}
          >
            <!-- Track Number / Playing Indicator -->
            <div class="track-number">
              {#if playing && isPlaying}
                <div class="playing-indicator">
                  <div class="bar"></div>
                  <div class="bar"></div>
                  <div class="bar"></div>
                </div>
              {:else}
                <span class="number">{index + 1}</span>
                <Play size={16} class="play-icon" fill="white" />
              {/if}
            </div>

            <!-- Artwork -->
            <div class="track-artwork">
              {#if track.image}
                <img src={track.image} alt={track.title} loading="lazy" />
              {:else}
                <div class="artwork-placeholder">
                  <Music size={20} />
                </div>
              {/if}
            </div>

            <!-- Info -->
            <div class="track-info">
              <div class="track-title" class:active={playing}>{track.title}</div>
              <button
                class="track-artist"
                type="button"
                onclick={(e) => { e.stopPropagation(); handleArtistClick(track.pubkey); }}
              >
                {track.artist}
              </button>
            </div>

            <!-- Album -->
            {#if track.album}
              <div class="track-album">{track.album}</div>
            {/if}

            <!-- Duration -->
            <div class="track-duration">{formatDuration(track.duration)}</div>

            <!-- Quality -->
            <div class="track-quality">{getQuality(track)}</div>

            <!-- Unlike button -->
            <button
              class="unlike-btn"
              type="button"
              title="Remove from liked"
              onclick={(e) => handleUnlike(track, e)}
            >
              <Heart size={14} fill="var(--accent-primary)" color="var(--accent-primary)" />
            </button>

            <!-- Track Menu -->
            <TrackMenu
              onPlayNext={() => playNostrTrackNext(track)}
              onPlayLater={() => playNostrTrackLater(track)}
              onGoToArtist={() => handleArtistClick(track.pubkey)}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .nostr-favorites-view {
    padding: 24px;
    padding-right: 8px;
    padding-bottom: 100px;
    overflow-y: auto;
    height: 100%;
  }

  .nostr-favorites-view::-webkit-scrollbar {
    width: 6px;
  }

  .nostr-favorites-view::-webkit-scrollbar-track {
    background: transparent;
  }

  .nostr-favorites-view::-webkit-scrollbar-thumb {
    background: var(--bg-tertiary);
    border-radius: 3px;
  }

  .nostr-favorites-view::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 32px;
  }

  .header-icon {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--accent-primary) 0%, #ff6b9d 100%);
    border-radius: 16px;
  }

  .header-content h1 {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 4px 0;
  }

  .subtitle {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .search-container {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: var(--bg-tertiary);
    border-radius: 8px;
    padding: 8px 12px;
    flex: 1;
    max-width: 300px;
  }

  .search-container :global(.search-icon) {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 14px;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-clear {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .search-clear:hover {
    color: var(--text-primary);
  }

  .actions {
    display: flex;
    gap: 12px;
  }

  .play-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    background-color: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .play-btn:hover {
    background-color: var(--accent-hover);
  }

  .results-count {
    margin-left: auto;
    font-size: 13px;
    color: var(--text-muted);
  }

  .content {
    min-height: 200px;
  }

  .loading,
  .error,
  .empty {
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

  .empty-hint {
    font-size: 13px;
    margin-top: 8px;
  }

  .track-list {
    display: flex;
    flex-direction: column;
  }

  .track-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .track-row:hover {
    background-color: var(--bg-hover);
  }

  .track-row.playing {
    background-color: var(--bg-secondary);
  }

  .track-row:hover .number {
    display: none;
  }

  .track-row:hover :global(.play-icon) {
    display: block;
  }

  /* Playing indicator animation */
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

  .track-number {
    width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .track-number .number {
    font-size: 14px;
    color: var(--text-muted);
  }

  .track-number :global(.play-icon) {
    display: none;
  }

  .track-artwork {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .track-artwork img {
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
    background: var(--bg-tertiary);
    color: var(--text-muted);
  }

  .track-info {
    flex: 1;
    min-width: 0;
  }

  .track-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-title.active {
    color: var(--accent-primary);
  }

  .track-artist {
    font-size: 13px;
    color: var(--text-muted);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  .track-artist:hover {
    color: var(--text-primary);
    text-decoration: underline;
  }

  .track-album {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-duration {
    font-size: 14px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    width: 60px;
    text-align: right;
  }

  .track-quality {
    font-size: 12px;
    color: var(--text-muted);
    width: 60px;
    text-align: right;
  }

  .unlike-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .unlike-btn:hover {
    background-color: var(--bg-tertiary);
    transform: scale(1.1);
  }

  .unlike-btn:hover :global(svg) {
    fill: var(--text-muted);
    color: var(--text-muted);
  }
</style>
