<script lang="ts">
  import { Music } from 'lucide-svelte';

  interface Props {
    artworks: string[];  // Album art URLs from tracks
    size?: number;       // Total width in px
    class?: string;      // Additional CSS classes
  }

  let {
    artworks = [],
    size = 120,
    class: className = ''
  }: Props = $props();

  // Upscale Qobuz image URLs to larger resolution
  function upscaleImageUrl(url: string): string {
    if (!url) return url;
    // Qobuz playlist thumbnails are often small (50x50 or 100x100)
    // Try to get 600x600 versions for better quality
    return url
      .replace(/_50\.jpg/, '_600.jpg')
      .replace(/_100\.jpg/, '_600.jpg')
      .replace(/_150\.jpg/, '_600.jpg')
      .replace(/_230\.jpg/, '_600.jpg')
      .replace(/_300\.jpg/, '_600.jpg')
      .replace(/\/50x50\//, '/600x600/')
      .replace(/\/100x100\//, '/600x600/')
      .replace(/\/150x150\//, '/600x600/')
      .replace(/\/230x230\//, '/600x600/')
      .replace(/\/300x300\//, '/600x600/');
  }

  // Get unique artworks (dedupe same album covers) and upscale
  const uniqueArtworks = $derived(() => {
    const seen = new Set<string>();
    return artworks.filter(art => {
      if (!art || seen.has(art)) return false;
      seen.add(art);
      return true;
    }).slice(0, 4).map(upscaleImageUrl);
  });

  const count = $derived(uniqueArtworks().length);
</script>

<div
  class="collage {className}"
  class:single={count === 1}
  class:empty={count === 0}
  style="--size: {size}px; --count: {count}"
>
  {#if count === 0}
    <!-- Empty placeholder -->
    <div class="placeholder">
      <Music size={size * 0.3} />
    </div>
  {:else if count === 1}
    <!-- Single cover -->
    <img src={uniqueArtworks()[0]} alt="" class="single-cover" />
  {:else}
    <!-- Collage with overlap -->
    {#each uniqueArtworks() as art, i}
      <img
        src={art}
        alt=""
        class="cover"
        style="--index: {i}"
      />
    {/each}
  {/if}
</div>

<style>
  .collage {
    position: relative;
    width: var(--size);
    height: var(--size);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 6px;
    background: var(--bg-tertiary);
    flex-shrink: 0;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    background: var(--bg-tertiary);
  }

  .single-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Collage covers - full height, will be cropped on sides */
  .cover {
    position: absolute;
    top: 0;
    height: 100%;
    width: auto;
    aspect-ratio: 1;
    object-fit: cover;
    /* First cover on top (highest z-index), last on bottom */
    z-index: calc(4 - var(--index));
    /* Shadow on right edge for depth */
    box-shadow: 3px 0 10px rgba(0, 0, 0, 0.5);
  }

  /* 2 covers */
  .collage[style*="--count: 2"] .cover {
    left: calc(var(--index) * (var(--size) * 0.5));
  }

  /* 3 covers */
  .collage[style*="--count: 3"] .cover {
    left: calc(var(--index) * (var(--size) * 0.33));
  }

  /* 4 covers */
  .collage[style*="--count: 4"] .cover {
    left: calc(var(--index) * (var(--size) * 0.25));
  }
</style>
