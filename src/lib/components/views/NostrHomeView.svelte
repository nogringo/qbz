<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, Play, Music, List } from 'lucide-svelte';
  import { fetchRecentTracks, fetchPlaylistsByOwner } from '$lib/nostr/client';
  import type { NostrMusicTrack, NostrPlaylist } from '$lib/nostr/types';
  import {
    initPlayer,
    setQueue,
    getState as getPlayerState,
    subscribe as subscribePlayer,
    formatTime
  } from '$lib/nostr/player';
  import { getAuthState } from '$lib/stores/authStore';

  interface Props {
    userName?: string;
    onArtistClick?: (pubkey: string) => void;
  }

  let { userName = 'Nostr User', onArtistClick }: Props = $props();

  // Data
  let tracks = $state<NostrMusicTrack[]>([]);
  let playlists = $state<NostrPlaylist[]>([]);

  // Loading states
  let isLoadingTracks = $state(true);
  let isLoadingPlaylists = $state(true);
  let error = $state<string | null>(null);

  // Player state - needs $state for Svelte 5 reactivity
  let playerState = $state(getPlayerState());

  // Get greeting based on time
  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  const greeting = getGreeting();

  onMount(() => {
    initPlayer();
    loadData();

    // Subscribe to player state changes (reactive, no polling)
    const unsubscribe = subscribePlayer(() => {
      playerState = getPlayerState();
    });

    return unsubscribe;
  });

  async function loadData() {
    const authState = getAuthState();

    // Load recent tracks
    try {
      isLoadingTracks = true;
      tracks = await fetchRecentTracks(30);
    } catch (err) {
      console.error('Failed to load tracks:', err);
      error = 'Failed to load tracks';
    } finally {
      isLoadingTracks = false;
    }

    // Load user's playlists
    if (authState.userInfo?.pubkey) {
      try {
        isLoadingPlaylists = true;
        playlists = await fetchPlaylistsByOwner(authState.userInfo.pubkey, 20);
      } catch (err) {
        console.error('Failed to load playlists:', err);
      } finally {
        isLoadingPlaylists = false;
      }
    } else {
      isLoadingPlaylists = false;
    }
  }

  async function handlePlayTrack(track: NostrMusicTrack, index: number) {
    // Set queue starting from clicked track
    await setQueue(tracks, index);
  }

  async function handlePlayAll() {
    if (tracks.length > 0) {
      await setQueue(tracks, 0);
    }
  }

  function isCurrentTrack(track: NostrMusicTrack): boolean {
    return playerState.currentTrack?.id === track.id;
  }
</script>

<div class="nostr-home">
  <!-- Header -->
  <div class="header">
    <div class="greeting">
      <h1>{greeting}, {userName}</h1>
      <p>Discover music on Nostr</p>
    </div>
  </div>

  <!-- Recent Tracks Section -->
  <section class="section">
    <div class="section-header">
      <h2>Recent Tracks</h2>
      {#if tracks.length > 0}
        <button onclick={handlePlayAll} class="play-all-btn">
          <Play size={16} />
          Play All
        </button>
      {/if}
    </div>

    {#if isLoadingTracks}
      <div class="loading">
        <Loader2 size={24} class="spinner" />
        <span>Loading tracks from Nostr...</span>
      </div>
    {:else if tracks.length === 0}
      <div class="empty">
        <Music size={48} />
        <p>No tracks found on Nostr relays</p>
        <p class="hint">Tracks need to be published as kind 36787 events</p>
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
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Playlists Section -->
  {#if playlists.length > 0}
    <section class="section">
      <div class="section-header">
        <h2>Your Playlists</h2>
      </div>
      <div class="playlist-grid">
        {#each playlists as playlist}
          <div class="playlist-card">
            {#if playlist.image}
              <img src={playlist.image} alt="" class="playlist-art" />
            {:else}
              <div class="playlist-art-placeholder"><List size={32} /></div>
            {/if}
            <div class="playlist-info">
              <span class="playlist-title">{playlist.title}</span>
              <span class="playlist-count">{playlist.trackRefs.length} tracks</span>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .nostr-home {
    padding: 24px 32px;
    max-width: 1200px;
    overflow-y: auto;
    height: 100%;
  }

  /* Header */
  .header {
    margin-bottom: 32px;
  }

  .greeting h1 {
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 4px;
    color: var(--text-primary, #fff);
  }

  .greeting p {
    font-size: 14px;
    color: var(--text-muted, #888);
    margin: 0;
  }

  /* Section */
  .section {
    margin-bottom: 32px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-header h2 {
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    color: var(--text-primary, #fff);
  }

  .play-all-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--accent-primary, #6366f1);
    border: none;
    border-radius: 20px;
    padding: 8px 16px;
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .play-all-btn:hover {
    background: var(--accent-hover, #5558e8);
  }

  /* Loading / Empty */
  .loading, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px;
    color: var(--text-muted, #888);
    gap: 12px;
  }

  .empty p {
    margin: 0;
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

  /* Playlist Grid */
  .playlist-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }

  .playlist-card {
    background: var(--bg-secondary, #1a1a1a);
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
  }

  .playlist-card:hover {
    background: var(--bg-tertiary, #2a2a2a);
  }

  .playlist-art, .playlist-art-placeholder {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 6px;
    object-fit: cover;
    margin-bottom: 12px;
  }

  .playlist-art-placeholder {
    background: var(--bg-tertiary, #2a2a2a);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #888);
  }

  .playlist-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .playlist-title {
    font-weight: 500;
    color: var(--text-primary, #fff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .playlist-count {
    font-size: 12px;
    color: var(--text-muted, #888);
  }
</style>
