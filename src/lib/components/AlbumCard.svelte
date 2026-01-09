<script lang="ts">
  import { Play, Disc3 } from 'lucide-svelte';

  interface Props {
    artwork: string;
    title: string;
    artist: string;
    quality?: string;
    size?: 'standard' | 'large';
    onclick?: () => void;
  }

  let { artwork, title, artist, quality, size = 'standard', onclick }: Props = $props();

  let isHovered = $state(false);
  let imageError = $state(false);
  const cardSize = $derived(size === 'large' ? 200 : 180);

  function handleImageError() {
    imageError = true;
  }
</script>

<div
  class="album-card"
  style="width: {cardSize}px"
  onmouseenter={() => (isHovered = true)}
  onmouseleave={() => (isHovered = false)}
  onclick={onclick}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && onclick?.()}
>
  <!-- Artwork Container -->
  <div
    class="artwork-container"
    style="width: {cardSize}px; height: {cardSize}px; transform: scale({isHovered ? 1.02 : 1})"
  >
    {#if imageError || !artwork}
      <div class="artwork-placeholder">
        <Disc3 size={48} />
      </div>
    {:else}
      <img src={artwork} alt={title} onerror={handleImageError} />
    {/if}

    <!-- Quality Indicator -->
    {#if quality}
      <div class="quality-badge">{quality}</div>
    {/if}

    <!-- Play Button Overlay -->
    {#if isHovered}
      <div class="play-overlay">
        <div class="play-button">
          <Play size={24} fill="white" color="white" />
        </div>
      </div>
    {/if}
  </div>

  <!-- Text Info -->
  <div class="info">
    <div class="title">{title}</div>
    <div class="artist">{artist}</div>
  </div>
</div>

<style>
  .album-card {
    flex-shrink: 0;
    cursor: pointer;
    transition: transform 150ms ease;
  }

  .artwork-container {
    position: relative;
    margin-bottom: 8px;
    border-radius: 8px;
    overflow: hidden;
    transition: transform 150ms ease-out;
  }

  .artwork-container img {
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
    background: linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%);
    color: var(--text-muted);
  }

  .quality-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 11px;
    font-weight: 600;
    color: white;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-button {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(66, 133, 244, 0.9);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .info {
    width: 100%;
  }

  .title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 2px;
  }

  .artist {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-muted);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
