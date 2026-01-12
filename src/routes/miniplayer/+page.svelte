<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import {
    Shuffle,
    SkipBack,
    SkipForward,
    Play,
    Pause,
    Repeat,
    Repeat1,
    Pin,
    PinOff,
    Maximize2,
    Volume2,
    VolumeX,
    Volume1,
    ListMusic
  } from 'lucide-svelte';
  import {
    subscribe as subscribePlayer,
    getPlayerState,
    togglePlay,
    seek as playerSeek,
    setVolume as playerSetVolume,
    startPolling,
    stopPolling,
    type PlayerState
  } from '$lib/stores/playerStore';
  import {
    subscribe as subscribeQueue,
    getQueueState,
    toggleShuffle,
    toggleRepeat,
    nextTrack,
    previousTrack,
    type RepeatMode
  } from '$lib/stores/queueStore';
  import { exitMiniplayerMode, setMiniplayerAlwaysOnTop } from '$lib/services/miniplayerService';

  // Player state
  let playerState = $state<PlayerState>(getPlayerState());
  let isShuffle = $state(false);
  let repeatMode = $state<RepeatMode>('off');
  let isPinned = $state(true);
  let isDragging = $state(false);
  let isDraggingProgress = $state(false);
  let isDraggingVolume = $state(false);
  let queueCount = $state(0);

  // Refs
  let progressRef: HTMLDivElement;
  let volumeRef: HTMLDivElement;

  // Derived state
  const progress = $derived(playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0);

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Store subscriptions
  let unsubscribePlayer: (() => void) | null = null;
  let unsubscribeQueue: (() => void) | null = null;

  onMount(async () => {
    console.log('[MiniPlayer] Mounting, starting polling...');

    // Start listening for playback events
    await startPolling();

    // Subscribe to player state
    unsubscribePlayer = subscribePlayer(() => {
      playerState = getPlayerState();
    });

    // Subscribe to queue state
    unsubscribeQueue = subscribeQueue(() => {
      const qState = getQueueState();
      isShuffle = qState.isShuffle;
      repeatMode = qState.repeatMode;
      queueCount = qState.tracks.length;
    });

    // Initial state
    const qState = getQueueState();
    isShuffle = qState.isShuffle;
    repeatMode = qState.repeatMode;
    queueCount = qState.tracks.length;
  });

  onDestroy(() => {
    console.log('[MiniPlayer] Unmounting, stopping polling...');
    unsubscribePlayer?.();
    unsubscribeQueue?.();
    stopPolling();
  });

  // Playback controls
  async function handlePlayPause(): Promise<void> {
    try {
      await togglePlay();
    } catch (err) {
      console.error('[MiniPlayer] Failed to toggle playback:', err);
    }
  }

  async function handleNext(): Promise<void> {
    try {
      await nextTrack();
    } catch (err) {
      console.error('[MiniPlayer] Failed to skip to next:', err);
    }
  }

  async function handlePrevious(): Promise<void> {
    try {
      await previousTrack();
    } catch (err) {
      console.error('[MiniPlayer] Failed to skip to previous:', err);
    }
  }

  async function handleToggleShuffle(): Promise<void> {
    try {
      await toggleShuffle();
    } catch (err) {
      console.error('[MiniPlayer] Failed to toggle shuffle:', err);
    }
  }

  async function handleToggleRepeat(): Promise<void> {
    try {
      await toggleRepeat();
    } catch (err) {
      console.error('[MiniPlayer] Failed to toggle repeat:', err);
    }
  }

  // Progress bar
  function handleProgressMouseDown(e: MouseEvent): void {
    isDraggingProgress = true;
    updateProgress(e);
    document.addEventListener('mousemove', handleProgressMouseMove);
    document.addEventListener('mouseup', handleProgressMouseUp);
  }

  function handleProgressMouseMove(e: MouseEvent): void {
    if (isDraggingProgress) updateProgress(e);
  }

  function handleProgressMouseUp(): void {
    isDraggingProgress = false;
    document.removeEventListener('mousemove', handleProgressMouseMove);
    document.removeEventListener('mouseup', handleProgressMouseUp);
  }

  function updateProgress(e: MouseEvent): void {
    if (progressRef && playerState.duration > 0) {
      const rect = progressRef.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const newTime = Math.round((percentage / 100) * playerState.duration);
      playerSeek(newTime);
    }
  }

  // Volume control
  function handleVolumeMouseDown(e: MouseEvent): void {
    isDraggingVolume = true;
    updateVolume(e);
    document.addEventListener('mousemove', handleVolumeMouseMove);
    document.addEventListener('mouseup', handleVolumeMouseUp);
  }

  function handleVolumeMouseMove(e: MouseEvent): void {
    if (isDraggingVolume) updateVolume(e);
  }

  function handleVolumeMouseUp(): void {
    isDraggingVolume = false;
    document.removeEventListener('mousemove', handleVolumeMouseMove);
    document.removeEventListener('mouseup', handleVolumeMouseUp);
  }

  function updateVolume(e: MouseEvent): void {
    if (volumeRef) {
      const rect = volumeRef.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      playerSetVolume(Math.round(percentage));
    }
  }

  function handleMuteToggle(): void {
    playerSetVolume(playerState.volume === 0 ? 75 : 0);
  }

  // Window controls
  async function handleRestore(): Promise<void> {
    console.log('[MiniPlayer] Restore button clicked');
    await exitMiniplayerMode();
  }

  async function togglePin(): Promise<void> {
    isPinned = !isPinned;
    await setMiniplayerAlwaysOnTop(isPinned);
  }

  async function startDrag(): Promise<void> {
    try {
      isDragging = true;
      const window = getCurrentWindow();
      await window.startDragging();
    } catch (err) {
      console.error('[MiniPlayer] Failed to start dragging:', err);
    } finally {
      isDragging = false;
    }
  }

  // Queue info (placeholder - will open queue panel later)
  function handleOpenQueue(): void {
    console.log('[MiniPlayer] Queue button clicked, tracks:', queueCount);
    // TODO: Open queue panel or switch to expanded mode
  }
</script>

<div
  class="miniplayer"
  class:dragging={isDragging}
  role="application"
  aria-label="MiniPlayer"
>
  <!-- Album Art Section -->
  <div class="artwork-section" onmousedown={startDrag}>
    {#if playerState.currentTrack?.artwork}
      <img src={playerState.currentTrack.artwork} alt="Album art" class="artwork" />
    {:else}
      <div class="artwork-placeholder">
        <Play size={32} />
      </div>
    {/if}
  </div>

  <!-- Main Content -->
  <div class="content-section">
    <!-- Header with track info and window controls -->
    <div class="header" onmousedown={startDrag}>
      <div class="track-info">
        <div class="title">{playerState.currentTrack?.title ?? 'No track playing'}</div>
        <div class="artist">{playerState.currentTrack?.artist ?? '—'}</div>
      </div>
      <div class="window-controls">
        <button class="window-btn" onclick={togglePin} title={isPinned ? 'Unpin' : 'Pin on top'}>
          {#if isPinned}
            <Pin size={14} />
          {:else}
            <PinOff size={14} />
          {/if}
        </button>
        <button class="window-btn restore" onclick={handleRestore} title="Restore window">
          <Maximize2 size={14} />
        </button>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="progress-section">
      <span class="time">{formatTime(playerState.currentTime)}</span>
      <div
        class="progress-bar"
        bind:this={progressRef}
        onmousedown={handleProgressMouseDown}
        role="slider"
        tabindex="0"
        aria-valuenow={playerState.currentTime}
        aria-valuemin={0}
        aria-valuemax={playerState.duration}
      >
        <div class="progress-track">
          <div class="progress-fill" style="width: {progress}%"></div>
        </div>
        <div class="progress-thumb" style="left: {progress}%"></div>
      </div>
      <span class="time remaining">-{formatTime(Math.max(0, playerState.duration - playerState.currentTime))}</span>
    </div>

    <!-- Controls Row -->
    <div class="controls-row">
      <!-- Playback Controls -->
      <div class="playback-controls">
        <button
          class="control-btn small"
          class:active={isShuffle}
          onclick={handleToggleShuffle}
          title="Shuffle"
        >
          <Shuffle size={14} />
        </button>

        <button class="control-btn" onclick={handlePrevious} title="Previous">
          <SkipBack size={18} />
        </button>

        <button class="control-btn play" onclick={handlePlayPause} title={playerState.isPlaying ? 'Pause' : 'Play'}>
          {#if playerState.isPlaying}
            <Pause size={20} />
          {:else}
            <Play size={20} />
          {/if}
        </button>

        <button class="control-btn" onclick={handleNext} title="Next">
          <SkipForward size={18} />
        </button>

        <button
          class="control-btn small"
          class:active={repeatMode !== 'off'}
          onclick={handleToggleRepeat}
          title={repeatMode === 'off' ? 'Repeat' : repeatMode === 'all' ? 'Repeat All' : 'Repeat One'}
        >
          {#if repeatMode === 'one'}
            <Repeat1 size={14} />
          {:else}
            <Repeat size={14} />
          {/if}
        </button>
      </div>

      <!-- Right Controls: Queue + Volume -->
      <div class="right-controls">
        <button
          class="control-btn small"
          onclick={handleOpenQueue}
          title="Queue ({queueCount} tracks)"
        >
          <ListMusic size={14} />
          {#if queueCount > 0}
            <span class="queue-badge">{queueCount > 99 ? '99+' : queueCount}</span>
          {/if}
        </button>

        <button class="control-btn small" onclick={handleMuteToggle} title={playerState.volume === 0 ? 'Unmute' : 'Mute'}>
          {#if playerState.volume === 0}
            <VolumeX size={14} />
          {:else if playerState.volume < 50}
            <Volume1 size={14} />
          {:else}
            <Volume2 size={14} />
          {/if}
        </button>
        <div
          class="volume-slider"
          bind:this={volumeRef}
          onmousedown={handleVolumeMouseDown}
          role="slider"
          tabindex="0"
          aria-valuenow={playerState.volume}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div class="volume-track">
            <div class="volume-fill" style="width: {playerState.volume}%"></div>
          </div>
          <div class="volume-thumb" style="left: {playerState.volume}%"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .miniplayer {
    display: flex;
    width: 100%;
    height: 100%;
    background: #18181b;
    color: white;
    user-select: none;
    overflow: hidden;
  }

  .miniplayer.dragging {
    cursor: grabbing;
  }

  /* Album Art Section */
  .artwork-section {
    width: 150px;
    height: 150px;
    flex-shrink: 0;
    cursor: grab;
    position: relative;
    background: #0f0f11;
  }

  .artwork-section:active {
    cursor: grabbing;
  }

  .artwork {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .artwork-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #27272a 0%, #18181b 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.3);
  }

  /* Content Section */
  .content-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
    min-width: 0;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
    cursor: grab;
  }

  .header:active {
    cursor: grabbing;
  }

  .track-info {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .title {
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fff;
    line-height: 1.3;
  }

  .artist {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }

  .window-controls {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .window-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: rgba(255, 255, 255, 0.06);
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .window-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.9);
  }

  .window-btn.restore:hover {
    background: rgba(99, 102, 241, 0.25);
    color: #a5b4fc;
  }

  /* Progress Section */
  .progress-section {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .time {
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.4);
    min-width: 30px;
  }

  .time.remaining {
    text-align: right;
  }

  .progress-bar {
    flex: 1;
    height: 16px;
    display: flex;
    align-items: center;
    cursor: pointer;
    position: relative;
  }

  .progress-track {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #6366f1;
    border-radius: 2px;
    transition: width 100ms linear;
  }

  .progress-thumb {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    background: white;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 150ms ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .progress-bar:hover .progress-thumb {
    opacity: 1;
  }

  /* Controls Row */
  .controls-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .playback-controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .right-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.15s ease;
    position: relative;
  }

  .control-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  .control-btn:active {
    transform: scale(0.95);
  }

  .control-btn.small {
    width: 26px;
    height: 26px;
  }

  .control-btn.active {
    color: #818cf8;
  }

  .control-btn.play {
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 2px;
  }

  .control-btn.play:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  .queue-badge {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    font-size: 9px;
    font-weight: 600;
    background: #6366f1;
    color: white;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Volume Control */
  .volume-slider {
    width: 50px;
    height: 16px;
    display: flex;
    align-items: center;
    cursor: pointer;
    position: relative;
  }

  .volume-track {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .volume-fill {
    height: 100%;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 2px;
  }

  .volume-thumb {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 150ms ease;
  }

  .volume-slider:hover .volume-thumb {
    opacity: 1;
  }
</style>
