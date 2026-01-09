<script lang="ts">
  import { ArrowLeft } from 'lucide-svelte';
  import Toggle from '../Toggle.svelte';
  import Dropdown from '../Dropdown.svelte';
  import VolumeSlider from '../VolumeSlider.svelte';
  import Tooltip from '../Tooltip.svelte';

  interface Props {
    onBack?: () => void;
  }

  let { onBack }: Props = $props();

  // Audio settings
  let streamingQuality = $state('Hi-Res');
  let preferHighest = $state(true);
  let outputDevice = $state('System Default');
  let exclusiveMode = $state(false);
  let dacPassthrough = $state(false);

  // Playback settings
  let gaplessPlayback = $state(true);
  let crossfade = $state(0);
  let normalizeVolume = $state(false);

  // Appearance settings
  let theme = $state('Dark');
  let compactMode = $state(false);

  // Integrations
  let lastfmConnected = $state(false);
  let scrobbling = $state(false);
</script>

<div class="settings-view">
  <!-- Header -->
  <div class="header">
    {#if onBack}
      <button class="back-btn" onclick={onBack}>
        <ArrowLeft size={16} />
        <span>Back</span>
      </button>
    {/if}
    <h1 class="title">Settings</h1>
  </div>

  <!-- Account Section -->
  <section class="section">
    <h3 class="section-title">Account</h3>
    <div class="account-card">
      <div class="avatar">U</div>
      <div class="account-info">
        <div class="username">Username</div>
        <div class="email">email@example.com</div>
        <div class="subscription">Studio Premier</div>
      </div>
      <button class="logout-btn">Logout</button>
    </div>
  </section>

  <!-- Audio Section -->
  <section class="section">
    <h3 class="section-title">Audio</h3>
    <div class="setting-row">
      <span class="setting-label">Streaming Quality</span>
      <Dropdown
        value={streamingQuality}
        options={['MP3', 'CD Quality', 'Hi-Res', 'Hi-Res+']}
        onchange={(v) => (streamingQuality = v)}
      />
    </div>
    <div class="setting-row">
      <span class="setting-label">Prefer highest available</span>
      <Toggle enabled={preferHighest} onchange={(v) => (preferHighest = v)} />
    </div>
    <div class="setting-row">
      <span class="setting-label">Output Device</span>
      <Dropdown
        value={outputDevice}
        options={['System Default', 'Built-in Speakers', 'USB DAC', 'HDMI Output']}
        onchange={(v) => (outputDevice = v)}
      />
    </div>
    <div class="setting-row">
      <div class="label-with-tooltip">
        <span class="setting-label">Exclusive Mode</span>
        <Tooltip text="Locks the audio device for exclusive use by QBZ for better quality" />
      </div>
      <Toggle enabled={exclusiveMode} onchange={(v) => (exclusiveMode = v)} />
    </div>
    <div class="setting-row">
      <div class="label-with-tooltip">
        <span class="setting-label">DAC Passthrough</span>
        <Tooltip text="Bypass the system audio mixer to send audio directly to your DAC at its native sample rate. Recommended for external DACs." />
      </div>
      <Toggle enabled={dacPassthrough} onchange={(v) => (dacPassthrough = v)} />
    </div>
    <div class="setting-row last">
      <span class="setting-label">Sample Rate</span>
      <span class="setting-value">192 kHz</span>
    </div>
  </section>

  <!-- Playback Section -->
  <section class="section">
    <h3 class="section-title">Playback</h3>
    <div class="setting-row">
      <span class="setting-label">Gapless Playback</span>
      <Toggle enabled={gaplessPlayback} onchange={(v) => (gaplessPlayback = v)} />
    </div>
    <div class="setting-row">
      <span class="setting-label">Crossfade</span>
      <div class="slider-container">
        <VolumeSlider value={crossfade} onchange={(v) => (crossfade = v)} max={12} showValue />
      </div>
    </div>
    <div class="setting-row last">
      <span class="setting-label">Normalize Volume</span>
      <Toggle enabled={normalizeVolume} onchange={(v) => (normalizeVolume = v)} />
    </div>
  </section>

  <!-- Appearance Section -->
  <section class="section">
    <h3 class="section-title">Appearance</h3>
    <div class="setting-row">
      <span class="setting-label">Theme</span>
      <Dropdown
        value={theme}
        options={['Dark', 'Light', 'OLED Black', 'Warm']}
        onchange={(v) => (theme = v)}
      />
    </div>
    <div class="setting-row last">
      <span class="setting-label">Compact Mode</span>
      <Toggle enabled={compactMode} onchange={(v) => (compactMode = v)} />
    </div>
  </section>

  <!-- Integrations Section -->
  <section class="section">
    <h3 class="section-title">Integrations</h3>
    <div class="setting-row" class:last={!lastfmConnected}>
      <span class="setting-label">Last.fm</span>
      <button
        class="connect-btn"
        class:connected={lastfmConnected}
        onclick={() => (lastfmConnected = !lastfmConnected)}
      >
        {lastfmConnected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
    {#if lastfmConnected}
      <div class="setting-row last">
        <span class="setting-label">Scrobbling</span>
        <Toggle enabled={scrobbling} onchange={(v) => (scrobbling = v)} />
      </div>
    {/if}
  </section>

  <!-- Storage Section -->
  <section class="section">
    <h3 class="section-title">Storage</h3>
    <div class="setting-row">
      <span class="setting-label">Cache Size</span>
      <span class="setting-value">2.4 GB</span>
    </div>
    <div class="setting-row last">
      <span class="setting-label">Clear Cache</span>
      <button class="clear-btn">Clear</button>
    </div>
  </section>
</div>

<style>
  .settings-view {
    width: 100%;
  }

  .header {
    margin-bottom: 32px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    margin-bottom: 16px;
    transition: color 150ms ease;
  }

  .back-btn:hover {
    color: var(--text-secondary);
  }

  .title {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .section {
    background-color: var(--bg-secondary);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 16px;
  }

  .account-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 0;
  }

  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background-color: var(--accent-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 24px;
    font-weight: 600;
  }

  .account-info {
    flex: 1;
  }

  .username {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .email {
    font-size: 14px;
    color: var(--text-muted);
  }

  .subscription {
    font-size: 14px;
    color: var(--accent-primary);
  }

  .logout-btn {
    padding: 8px 24px;
    border-radius: 8px;
    border: 1px solid #ff6b6b;
    background: none;
    color: #ff6b6b;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .logout-btn:hover {
    background-color: rgba(255, 107, 107, 0.1);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    border-bottom: 1px solid var(--bg-tertiary);
  }

  .setting-row.last {
    border-bottom: none;
  }

  .setting-label {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .setting-value {
    font-size: 14px;
    color: var(--text-muted);
  }

  .label-with-tooltip {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .slider-container {
    width: 240px;
  }

  .connect-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
    background-color: var(--accent-primary);
    color: white;
    border: none;
  }

  .connect-btn:hover {
    background-color: var(--accent-hover);
  }

  .connect-btn.connected {
    background: none;
    border: 1px solid var(--text-muted);
    color: var(--text-muted);
  }

  .connect-btn.connected:hover {
    border-color: var(--text-secondary);
    color: var(--text-secondary);
  }

  .clear-btn {
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #ff6b6b;
    background: none;
    color: #ff6b6b;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .clear-btn:hover {
    background-color: rgba(255, 107, 107, 0.1);
  }
</style>
