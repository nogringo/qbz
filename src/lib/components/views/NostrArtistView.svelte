<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Loader2, Play, Music, UserPlus, UserCheck, Copy, Check } from 'lucide-svelte';
  import { nprofileEncode } from 'nostr-tools/nip19';
  import { getRelays } from '$lib/nostr/client';
  import { fetchArtistWithGossip, isFollowing, followPubkey, unfollowPubkey, type NostrArtist } from '$lib/nostr/client';
  import type { NostrMusicTrack } from '$lib/nostr/types';
  import {
    setQueue,
    getState as getPlayerState,
    subscribe as subscribePlayer,
    formatTime
  } from '$lib/nostr/player';
  import { getAuthState } from '$lib/stores/authStore';

  interface Props {
    pubkey: string;
    onBack?: () => void;
  }

  let { pubkey, onBack }: Props = $props();

  // Data
  let artist = $state<NostrArtist | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Follow state
  let following = $state(false);
  let isFollowLoading = $state(false);

  // Copy state
  let copied = $state(false);

  // Player state
  let playerState = $state(getPlayerState());

  onMount(() => {
    loadArtist();
    checkFollowStatus();

    const unsubscribe = subscribePlayer(() => {
      playerState = getPlayerState();
    });

    return unsubscribe;
  });

  async function loadArtist() {
    isLoading = true;
    error = null;

    try {
      artist = await fetchArtistWithGossip(pubkey);
    } catch (err) {
      console.error('Failed to load artist:', err);
      error = 'Failed to load artist';
    } finally {
      isLoading = false;
    }
  }

  async function checkFollowStatus() {
    const authState = getAuthState();
    if (!authState.userInfo?.pubkey) return;

    try {
      following = await isFollowing(authState.userInfo.pubkey, pubkey);
    } catch (err) {
      console.error('Failed to check follow status:', err);
    }
  }

  async function handleFollow() {
    const authState = getAuthState();
    if (!authState.userInfo?.pubkey || isFollowLoading) return;

    isFollowLoading = true;
    try {
      if (following) {
        await unfollowPubkey(authState.userInfo.pubkey, pubkey);
        following = false;
      } else {
        await followPubkey(authState.userInfo.pubkey, pubkey);
        following = true;
      }
    } catch (err) {
      console.error('Failed to follow/unfollow:', err);
    } finally {
      isFollowLoading = false;
    }
  }

  async function copyNprofile() {
    const relays = getRelays().slice(0, 3); // Include up to 3 relays
    const nprofile = nprofileEncode({ pubkey, relays });
    await navigator.clipboard.writeText(nprofile);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  async function handlePlayTrack(track: NostrMusicTrack, index: number) {
    if (artist) {
      await setQueue(artist.tracks, index);
    }
  }

  async function handlePlayAll() {
    if (artist && artist.tracks.length > 0) {
      await setQueue(artist.tracks, 0);
    }
  }

  function isCurrentTrack(track: NostrMusicTrack): boolean {
    return playerState.currentTrack?.id === track.id;
  }

  function getDisplayName(): string {
    if (!artist) return 'Unknown Artist';
    return artist.profile?.displayName || artist.profile?.name || artist.pubkey.slice(0, 12) + '...';
  }

  function getProfilePicture(): string | null {
    return artist?.profile?.picture || null;
  }

  function getBio(): string | null {
    return artist?.profile?.about || null;
  }
</script>

<div class="nostr-artist-view">
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
      <span>Loading artist with gossip model...</span>
      <span class="hint">Fetching from NIP-65 relays</span>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button onclick={loadArtist}>Retry</button>
    </div>
  {:else if artist}
    <!-- Artist Header -->
    <div class="artist-header">
      {#if getProfilePicture()}
        <img src={getProfilePicture()} alt="" class="artist-image" />
      {:else}
        <div class="artist-image-placeholder">
          <Music size={48} />
        </div>
      {/if}
      <div class="artist-info">
        <h1 class="artist-name">{getDisplayName()}</h1>
        {#if getBio()}
          <p class="artist-bio">{getBio()}</p>
        {/if}
        <div class="artist-stats">
          <span>{artist.tracks.length} tracks</span>
        </div>
        <div class="artist-actions">
          <button
            class="follow-btn"
            class:following
            onclick={handleFollow}
            disabled={isFollowLoading}
          >
            {#if isFollowLoading}
              <Loader2 size={16} class="spinner" />
            {:else if following}
              <UserCheck size={16} />
            {:else}
              <UserPlus size={16} />
            {/if}
            <span>{following ? 'Following' : 'Follow'}</span>
          </button>
          <button
            class="copy-btn"
            class:copied
            onclick={copyNprofile}
            title="Copy nprofile"
          >
            {#if copied}
              <Check size={16} />
            {:else}
              <Copy size={16} />
            {/if}
          </button>
        </div>
      </div>
    </div>

    <!-- Tracks Section -->
    <section class="section">
      <div class="section-header">
        <h2>Tracks</h2>
        {#if artist.tracks.length > 0}
          <button onclick={handlePlayAll} class="play-all-btn">
            <Play size={16} />
            Play All
          </button>
        {/if}
      </div>

      {#if artist.tracks.length === 0}
        <div class="empty">
          <Music size={48} />
          <p>No tracks found for this artist</p>
        </div>
      {:else}
        <div class="track-list">
          {#each artist.tracks as track, index}
            <button
              class="track-item"
              class:playing={isCurrentTrack(track)}
              onclick={() => handlePlayTrack(track, index)}
            >
              <div class="track-index">
                {#if isCurrentTrack(track) && playerState.isPlaying}
                  <div class="playing-indicator">
                    <span></span><span></span><span></span>
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
                {#if track.album}
                  <span class="track-album">{track.album}</span>
                {/if}
              </div>
              <span class="track-duration">{track.duration ? formatTime(track.duration) : '--:--'}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .nostr-artist-view {
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

  /* Loading / Error */
  .loading, .error, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px;
    color: var(--text-muted, #888);
    gap: 12px;
  }

  .loading .hint {
    font-size: 12px;
    opacity: 0.7;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Artist Header */
  .artist-header {
    display: flex;
    gap: 24px;
    margin-bottom: 24px;
  }

  .artist-image, .artist-image-placeholder {
    width: 180px;
    height: 180px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .artist-image-placeholder {
    background: var(--bg-tertiary, #2a2a2a);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #888);
  }

  .artist-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
  }

  .artist-name {
    font-size: 32px;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary, #fff);
  }

  .artist-bio {
    font-size: 14px;
    color: var(--text-secondary, #aaa);
    margin: 0;
    max-width: 500px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .artist-stats {
    font-size: 13px;
    color: var(--text-muted, #888);
  }

  .artist-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .follow-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--text-muted, #888);
    background: transparent;
    color: var(--text-primary, #fff);
    transition: all 0.2s;
    width: fit-content;
  }

  .follow-btn:hover:not(:disabled) {
    border-color: var(--text-primary, #fff);
    background: var(--bg-secondary, #1a1a1a);
  }

  .follow-btn.following {
    border-color: var(--accent-primary, #6366f1);
    color: var(--accent-primary, #6366f1);
  }

  .follow-btn.following:hover:not(:disabled) {
    border-color: #ef4444;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .follow-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border-radius: 50%;
    cursor: pointer;
    border: 1px solid var(--text-muted, #888);
    background: transparent;
    color: var(--text-muted, #888);
    transition: all 0.2s;
  }

  .copy-btn:hover {
    border-color: var(--text-primary, #fff);
    color: var(--text-primary, #fff);
    background: var(--bg-secondary, #1a1a1a);
  }

  .copy-btn.copied {
    border-color: #22c55e;
    color: #22c55e;
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
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    height: 14px;
  }

  .playing-indicator span {
    width: 3px;
    background: var(--accent-primary, #6366f1);
    animation: equalizer 0.5s ease-in-out infinite alternate;
  }

  .playing-indicator span:nth-child(1) { height: 60%; animation-delay: 0s; }
  .playing-indicator span:nth-child(2) { height: 100%; animation-delay: 0.2s; }
  .playing-indicator span:nth-child(3) { height: 40%; animation-delay: 0.4s; }

  @keyframes equalizer {
    from { height: 20%; }
    to { height: 100%; }
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

  .track-album {
    font-size: 12px;
    color: var(--text-muted, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-duration {
    font-size: 12px;
    color: var(--text-muted, #888);
    min-width: 45px;
    text-align: right;
  }
</style>
