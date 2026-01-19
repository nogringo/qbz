<script lang="ts">
  import { Settings } from 'lucide-svelte';

  interface Props {
    username: string;
    onSettingsClick: () => void;
    onAboutClick?: () => void;
  }

  let { username, onSettingsClick, onAboutClick }: Props = $props();
</script>

<div class="user-card">
  <!-- App Logo -->
  <button
    class="logo-btn"
    onclick={(e) => {
      e.stopPropagation();
      onAboutClick?.();
    }}
    title="About QBZ"
  >
    <div class="logo-glow"></div>
    <img src="/icons/AppIcons/android/72x72.png" alt="QBZ" class="logo-img" />
  </button>

  <!-- User Info -->
  <div class="user-info">
    <div class="username">{username}</div>
  </div>

  <!-- Settings Button -->
  <button
    class="action-btn"
    onclick={(e) => {
      e.stopPropagation();
      onSettingsClick();
    }}
    title="Settings"
  >
    <Settings size={14} />
  </button>
</div>

<style>
  .user-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .user-card:hover {
    background-color: var(--bg-hover);
  }

  .logo-btn {
    position: relative;
    width: 32px;
    height: 32px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo-glow {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 200ms ease;
    pointer-events: none;
  }

  .logo-btn:hover .logo-glow {
    opacity: 1;
  }

  .logo-img {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    position: relative;
    z-index: 1;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .username {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }


  .action-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 4px;
    transition: all 150ms ease;
  }

  .action-btn:hover {
    color: var(--text-primary);
    background-color: var(--bg-tertiary);
  }
</style>
