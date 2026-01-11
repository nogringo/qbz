<script lang="ts">
  import { Disc, Music } from 'lucide-svelte';

  interface Props {
    quality?: string;
    bitDepth?: number;
    samplingRate?: number;
    compact?: boolean;
  }

  let {
    quality = '',
    bitDepth,
    samplingRate,
    compact = false
  }: Props = $props();

  // Determine quality tier
  const tier = $derived.by(() => {
    if (bitDepth && bitDepth >= 24 && samplingRate && samplingRate > 96) {
      return 'max';
    }
    if (bitDepth && bitDepth >= 24) {
      return 'hires';
    }
    if (quality.toLowerCase().includes('mp3') || quality.toLowerCase().includes('320')) {
      return 'lossy';
    }
    if (bitDepth === 16 || quality.toLowerCase().includes('cd') || quality.toLowerCase().includes('flac') || quality.toLowerCase().includes('lossless')) {
      return 'cd';
    }
    if (samplingRate && samplingRate >= 44.1) {
      return 'cd';
    }
    return 'unknown';
  });

  // Format the display text
  const displayText = $derived.by(() => {
    if (tier === 'max' || tier === 'hires') {
      const depth = bitDepth || 24;
      const rate = samplingRate ? `${samplingRate} kHz` : '';
      return compact ? `${depth}/${samplingRate || ''}` : `${depth}-bit${rate ? ` / ${rate}` : ''}`;
    }
    if (tier === 'cd') {
      const depth = bitDepth || 16;
      const rate = samplingRate || 44.1;
      return compact ? `${depth}/${rate}` : `${depth}-bit / ${rate} kHz`;
    }
    if (tier === 'lossy') {
      return compact ? '320k' : '320 kbps';
    }
    return '';
  });

  const tierLabel = $derived.by(() => {
    if (tier === 'max') return 'Hi-Res';
    if (tier === 'hires') return 'Hi-Res';
    if (tier === 'cd') return 'CD';
    if (tier === 'lossy') return 'MP3';
    return '';
  });
</script>

{#if tier !== 'unknown'}
  <div class="quality-badge tier-{tier}" class:compact>
    <!-- Icon -->
    <div class="badge-icon">
      {#if tier === 'max' || tier === 'hires'}
        <!-- Hi-Res Audio Icon (simplified) -->
        <svg viewBox="0 0 24 24" fill="currentColor" class="hires-icon">
          <rect x="2" y="6" width="4" height="12" rx="1" />
          <rect x="8" y="3" width="4" height="18" rx="1" />
          <rect x="14" y="8" width="4" height="8" rx="1" />
          <rect x="20" y="5" width="2" height="14" rx="1" />
        </svg>
      {:else if tier === 'cd'}
        <Disc size={14} />
      {:else if tier === 'lossy'}
        <Music size={14} />
      {/if}
    </div>

    <!-- Text -->
    <div class="badge-text">
      {#if !compact}
        <span class="tier-label">{tierLabel}</span>
      {/if}
      <span class="quality-info">{displayText}</span>
    </div>
  </div>
{/if}

<style>
  .quality-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: var(--font-sans, system-ui);
  }

  .quality-badge.compact {
    padding: 2px 6px;
    gap: 4px;
  }

  .badge-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .hires-icon {
    width: 16px;
    height: 16px;
  }

  .compact .hires-icon {
    width: 12px;
    height: 12px;
  }

  .badge-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .compact .badge-text {
    flex-direction: row;
    gap: 4px;
    align-items: center;
  }

  .tier-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .compact .tier-label {
    font-size: 9px;
  }

  .quality-info {
    font-size: 11px;
    font-weight: 500;
    opacity: 0.9;
  }

  .compact .quality-info {
    font-size: 10px;
  }

  /* Tier colors */
  .tier-max {
    background: linear-gradient(135deg, rgba(255, 170, 0, 0.15) 0%, rgba(255, 136, 0, 0.15) 100%);
    border: 1px solid rgba(255, 170, 0, 0.3);
    color: #ffaa00;
  }

  .tier-hires {
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.25);
    color: #60a5fa;
  }

  .tier-cd {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
  }

  .tier-lossy {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.5);
  }
</style>
