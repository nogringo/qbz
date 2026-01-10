<script lang="ts">
  import LyricsLines from './LyricsLines.svelte';

  interface LyricsLine {
    text: string;
  }

  interface Props {
    lines: LyricsLine[];
    activeIndex?: number;
    activeProgress?: number;
    isSynced?: boolean;
    align?: 'left' | 'center';
    title?: string;
    artist?: string;
    artwork?: string;
  }

  let {
    lines,
    activeIndex = -1,
    activeProgress = 0,
    isSynced = false,
    align = 'center',
    title = '',
    artist = '',
    artwork
  }: Props = $props();

  const isCenter = $derived(align === 'center');
  const hasArtwork = $derived(!!artwork);
</script>

<section
  class="lyrics-immersive"
  class:center={isCenter}
  class:no-artwork={!hasArtwork}
>
  {#if hasArtwork}
    <div class="artwork-pane">
      <div class="artwork-frame">
        <img src={artwork} alt={title || 'Artwork'} />
      </div>
    </div>
  {/if}

  <div class="lyrics-pane">
    <div class="header">
      {#if title || artist}
        <div class="title">{title}</div>
        <div class="artist">{artist}</div>
      {/if}
    </div>

    <LyricsLines
      {lines}
      {activeIndex}
      {activeProgress}
      {isSynced}
      center={isCenter}
      compact={false}
    />
  </div>
</section>

<style>
  .lyrics-immersive {
    display: grid;
    grid-template-columns: minmax(260px, 40%) minmax(0, 60%);
    gap: 48px;
    height: 100%;
    width: 100%;
    padding: 48px;
    color: var(--text-primary);
    background: var(--bg-primary);
  }

  .lyrics-immersive.no-artwork {
    grid-template-columns: 1fr;
  }

  .lyrics-immersive.center {
    align-items: center;
  }

  .artwork-pane {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .artwork-frame {
    width: min(420px, 100%);
    aspect-ratio: 1 / 1;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
    border: 1px solid var(--bg-tertiary);
  }

  .artwork-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .lyrics-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .header {
    margin-bottom: 20px;
  }

  .title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .artist {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
  }
</style>
