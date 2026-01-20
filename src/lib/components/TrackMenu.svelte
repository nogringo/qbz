<script lang="ts">
  import { tick } from 'svelte';
  import {
    MoreHorizontal,
    Play,
    ListPlus,
    ListEnd,
    Heart,
    ListMusic,
    User,
    Link,
    Trash2
  } from 'lucide-svelte';

  interface Props {
    onPlayNow?: () => void;
    onPlayNext?: () => void;
    onPlayLater?: () => void;
    onAddFavorite?: () => void;
    onAddToNostrPlaylist?: () => void;
    onRemoveFromPlaylist?: () => void;
    onCopyBlossomUrl?: () => void;
    onCopyNaddr?: () => void;
    onCopyZaptraxLink?: () => void;
    onGoToArtist?: () => void;
  }

  let {
    onPlayNow,
    onPlayNext,
    onPlayLater,
    onAddFavorite,
    onAddToNostrPlaylist,
    onRemoveFromPlaylist,
    onCopyBlossomUrl,
    onCopyNaddr,
    onCopyZaptraxLink,
    onGoToArtist
  }: Props = $props();

  let isOpen = $state(false);
  let menuRef: HTMLDivElement | null = null;
  let triggerRef: HTMLButtonElement | null = null;
  let menuEl: HTMLDivElement | null = null;
  let menuStyle = $state('');

  // Portal action - moves element to body to escape stacking context
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }

  const hasPlayback = $derived(!!(onPlayNow || onPlayNext || onPlayLater));
  const hasLibrary = $derived(!!(onAddFavorite || onAddToNostrPlaylist || onRemoveFromPlaylist));
  const hasCopy = $derived(!!(onCopyBlossomUrl || onCopyNaddr || onCopyZaptraxLink));
  const hasNav = $derived(!!onGoToArtist);
  const hasMenu = $derived(hasPlayback || hasLibrary || hasCopy || hasNav);

  function closeMenu() {
    isOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as Node;
    // Check if click is outside both the trigger container and the menu (which is in portal)
    const isOutsideTrigger = menuRef && !menuRef.contains(target);
    const isOutsideMenu = menuEl && !menuEl.contains(target);
    if (isOutsideTrigger && isOutsideMenu) {
      closeMenu();
    }
  }

  async function setMenuPosition() {
    await tick();
    if (!triggerRef || !menuEl) return;

    const triggerRect = triggerRef.getBoundingClientRect();
    const menuRect = menuEl.getBoundingClientRect();
    const padding = 8;

    let left = triggerRect.right - menuRect.width;
    let top = triggerRect.bottom + 6;

    if (left < padding) left = padding;
    if (left + menuRect.width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - menuRect.width - padding);
    }

    if (top + menuRect.height > window.innerHeight - padding) {
      top = triggerRect.top - menuRect.height - 6;
      if (top < padding) top = padding;
    }

    menuStyle = `left: ${left}px; top: ${top}px;`;
  }

  function handleAction(action?: () => void) {
    if (!action) return;
    action();
    closeMenu();
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      const handleResize = () => setMenuPosition();
      const handleScroll = () => setMenuPosition();

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  });
</script>

{#if hasMenu}
  <div
    class="track-menu"
    bind:this={menuRef}
    onmousedown={(e) => e.stopPropagation()}
    onclick={(e) => e.stopPropagation()}
  >
    <button
      class="menu-trigger"
      bind:this={triggerRef}
      onclick={(e) => {
        e.stopPropagation();
        isOpen = !isOpen;
        if (isOpen) setMenuPosition();
      }}
      aria-label="Track actions"
    >
      <MoreHorizontal size={18} />
    </button>

    {#if isOpen}
      <div class="menu" bind:this={menuEl} style={menuStyle} use:portal>
        {#if hasPlayback}
          {#if onPlayNow}
            <button class="menu-item" onclick={() => handleAction(onPlayNow)}>
              <Play size={14} />
              <span>Play now</span>
            </button>
          {/if}
          {#if onPlayNext}
            <button class="menu-item" onclick={() => handleAction(onPlayNext)}>
              <ListPlus size={14} />
              <span>Play next</span>
            </button>
          {/if}
          {#if onPlayLater}
            <button class="menu-item" onclick={() => handleAction(onPlayLater)}>
              <ListEnd size={14} />
              <span>Play later</span>
            </button>
          {/if}
        {/if}

        {#if hasPlayback && (hasLibrary || hasCopy || hasNav)}
          <div class="separator"></div>
        {/if}

        {#if hasLibrary}
          {#if onAddFavorite}
            <button class="menu-item" onclick={() => handleAction(onAddFavorite)}>
              <Heart size={14} />
              <span>Add to favorites</span>
            </button>
          {/if}
          {#if onAddToNostrPlaylist}
            <button class="menu-item" onclick={() => handleAction(onAddToNostrPlaylist)}>
              <ListMusic size={14} />
              <span>Add to playlist</span>
            </button>
          {/if}
          {#if onRemoveFromPlaylist}
            <button class="menu-item danger" onclick={() => handleAction(onRemoveFromPlaylist)}>
              <Trash2 size={14} />
              <span>Remove from playlist</span>
            </button>
          {/if}
        {/if}

        {#if hasLibrary && (hasCopy || hasNav)}
          <div class="separator"></div>
        {/if}

        {#if hasCopy}
          {#if onCopyBlossomUrl}
            <button class="menu-item" onclick={() => handleAction(onCopyBlossomUrl)}>
              <Link size={14} />
              <span>Copy Blossom URL</span>
            </button>
          {/if}
          {#if onCopyNaddr}
            <button class="menu-item" onclick={() => handleAction(onCopyNaddr)}>
              <Link size={14} />
              <span>Copy naddr</span>
            </button>
          {/if}
          {#if onCopyZaptraxLink}
            <button class="menu-item" onclick={() => handleAction(onCopyZaptraxLink)}>
              <Link size={14} />
              <span>Copy Zaptrax link</span>
            </button>
          {/if}
        {/if}

        {#if hasCopy && hasNav}
          <div class="separator"></div>
        {/if}

        {#if hasNav}
          {#if onGoToArtist}
            <button class="menu-item" onclick={() => handleAction(onGoToArtist)}>
              <User size={14} />
              <span>Go to artist</span>
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .track-menu {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .menu-trigger {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 6px;
    transition: background-color 150ms ease, color 150ms ease;
  }

  .menu-trigger:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  .menu {
    position: fixed;
    min-width: 160px;
    background-color: var(--bg-tertiary);
    border-radius: 8px;
    padding: 2px 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 99999;
  }

  .menu-item {
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    color: var(--text-secondary);
    text-align: left;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background-color 150ms ease, color 150ms ease;
  }

  .menu-item span {
    flex: 1;
  }

  .menu-item:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  .menu-item.danger {
    color: #ef4444;
  }

  .menu-item.danger:hover {
    background-color: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .separator {
    height: 1px;
    background-color: var(--bg-hover);
    margin: 4px 0;
  }
</style>
