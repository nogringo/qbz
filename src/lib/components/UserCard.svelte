<script lang="ts">
  import { Settings, LogOut } from 'lucide-svelte';

  interface Props {
    username: string;
    subscription: string;
    avatarUrl?: string;
    onSettingsClick: () => void;
    onLogout?: () => void;
  }

  let { username, subscription, avatarUrl, onSettingsClick, onLogout }: Props = $props();
</script>

<div class="user-card">
  <!-- Avatar -->
  <div class="avatar">
    {#if avatarUrl}
      <img src={avatarUrl} alt={username} />
    {:else}
      {username.charAt(0).toUpperCase()}
    {/if}
  </div>

  <!-- User Info -->
  <div class="user-info">
    <div class="username">{username}</div>
    <div class="subscription">{subscription}</div>
  </div>

  <!-- Action Buttons -->
  <div class="action-buttons">
    <button
      class="action-btn"
      onclick={(e) => {
        e.stopPropagation();
        onSettingsClick();
      }}
      title="Settings"
    >
      <Settings size={18} />
    </button>
    {#if onLogout}
      <button
        class="action-btn logout-btn"
        onclick={(e) => {
          e.stopPropagation();
          onLogout();
        }}
        title="Logout"
      >
        <LogOut size={18} />
      </button>
    {/if}
  </div>
</div>

<style>
  .user-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .user-card:hover {
    background-color: var(--bg-hover);
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--accent-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 14px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .username {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subscription {
    font-size: 12px;
    color: var(--accent-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 6px;
    transition: all 150ms ease;
  }

  .action-btn:hover {
    color: var(--text-primary);
    background-color: var(--bg-tertiary);
  }

  .logout-btn:hover {
    color: #ff6b6b;
  }
</style>
