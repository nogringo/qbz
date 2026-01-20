<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Loader2, Plus, Check, List, Music } from 'lucide-svelte';
  import Modal from './Modal.svelte';
  import {
    publishPlaylist,
    updatePlaylist,
    fetchPlaylist
  } from '$lib/nostr/client';
  import { fetchPlaylistsByOwnerCached, peekCachedPlaylists } from '$lib/nostr/cache';
  import type { NostrPlaylist, NostrMusicTrack, TrackReference } from '$lib/nostr/types';
  import { MUSIC_TRACK_KIND } from '$lib/nostr/types';
  import { getAuthState } from '$lib/stores/authStore';

  type ModalMode = 'create' | 'edit' | 'addTrack';

  interface Props {
    isOpen: boolean;
    mode: ModalMode;
    onClose: () => void;
    onSuccess?: (playlist: NostrPlaylist) => void;
    // For edit mode
    playlist?: NostrPlaylist;
    tracks?: NostrMusicTrack[];
    // For addTrack mode
    trackToAdd?: NostrMusicTrack;
  }

  let {
    isOpen,
    mode,
    onClose,
    onSuccess,
    playlist,
    tracks = [],
    trackToAdd
  }: Props = $props();

  // Form state
  let title = $state('');
  let description = $state('');
  let image = $state('');
  let isPublic = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);

  // For addTrack mode
  let userPlaylists = $state<NostrPlaylist[]>([]);
  let isLoadingPlaylists = $state(false);
  let selectedPlaylistId = $state<string | null>(null);
  let isAddingTrack = $state(false);

  // Sub-mode: create new playlist while adding a track
  let isCreatingNewPlaylist = $state(false);

  // Reset form when modal opens
  $effect(() => {
    if (isOpen) {
      error = null;
      isCreatingNewPlaylist = false;
      if (mode === 'edit' && playlist) {
        title = playlist.title;
        description = playlist.description || '';
        image = playlist.image || '';
        isPublic = playlist.isPublic;
      } else if (mode === 'create') {
        title = '';
        description = '';
        image = '';
        isPublic = true;
      } else if (mode === 'addTrack') {
        title = '';
        description = '';
        image = '';
        isPublic = true;
        selectedPlaylistId = null;
        loadUserPlaylists();
      }
    }
  });

  async function loadUserPlaylists() {
    const authState = getAuthState();
    if (!authState.userInfo?.pubkey) return;

    // Step 1: Instantly show cached playlists if available
    const cached = await peekCachedPlaylists(authState.userInfo.pubkey);
    if (cached) {
      userPlaylists = cached;
    } else {
      isLoadingPlaylists = true;
    }

    // Step 2: Run full SWR fetch
    try {
      userPlaylists = await fetchPlaylistsByOwnerCached(
        authState.userInfo.pubkey,
        50,
        (freshPlaylists) => {
          userPlaylists = freshPlaylists;
        }
      );
    } catch (err) {
      console.error('Failed to load playlists:', err);
      error = 'Failed to load playlists';
    } finally {
      isLoadingPlaylists = false;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!title.trim()) {
      error = 'Title is required';
      return;
    }

    isSaving = true;
    error = null;

    try {
      let result: NostrPlaylist;

      if (mode === 'edit' && playlist) {
        // Keep existing track refs
        const trackRefs: TrackReference[] = tracks.map(t => ({
          kind: MUSIC_TRACK_KIND,
          pubkey: t.pubkey,
          dTag: t.d
        }));

        result = await updatePlaylist(playlist.d, {
          title: title.trim(),
          description: description.trim() || undefined,
          image: image.trim() || undefined,
          isPublic,
          trackRefs
        });
      } else {
        // Create new playlist
        result = await publishPlaylist({
          title: title.trim(),
          description: description.trim() || undefined,
          image: image.trim() || undefined,
          isPublic,
          trackRefs: []
        });
      }

      onSuccess?.(result);
      onClose();
    } catch (err) {
      console.error('Failed to save playlist:', err);
      error = 'Failed to save playlist. Please try again.';
    } finally {
      isSaving = false;
    }
  }

  async function handleAddTrackToPlaylist() {
    if (!selectedPlaylistId || !trackToAdd) return;

    const authState = getAuthState();
    if (!authState.userInfo?.pubkey) return;

    isAddingTrack = true;
    error = null;

    try {
      // Find the selected playlist
      const selectedPlaylist = userPlaylists.find(p => p.id === selectedPlaylistId);
      if (!selectedPlaylist) {
        error = 'Playlist not found';
        return;
      }

      // Fetch full playlist to get current tracks
      const fullPlaylist = await fetchPlaylist(selectedPlaylist.pubkey, selectedPlaylist.d);
      if (!fullPlaylist) {
        error = 'Failed to fetch playlist';
        return;
      }

      // Check if track already exists
      const trackRef = `${MUSIC_TRACK_KIND}:${trackToAdd.pubkey}:${trackToAdd.d}`;
      const alreadyExists = fullPlaylist.trackRefs.some(
        ref => ref.pubkey === trackToAdd.pubkey && ref.dTag === trackToAdd.d
      );

      if (alreadyExists) {
        error = 'Track is already in this playlist';
        return;
      }

      // Add new track ref
      const newTrackRefs: TrackReference[] = [
        ...fullPlaylist.trackRefs,
        {
          kind: MUSIC_TRACK_KIND,
          pubkey: trackToAdd.pubkey,
          dTag: trackToAdd.d
        }
      ];

      // Update playlist
      const result = await updatePlaylist(fullPlaylist.d, {
        title: fullPlaylist.title,
        description: fullPlaylist.description,
        image: fullPlaylist.image,
        isPublic: fullPlaylist.isPublic,
        trackRefs: newTrackRefs
      });

      onSuccess?.(result);
      onClose();
    } catch (err) {
      console.error('Failed to add track to playlist:', err);
      error = 'Failed to add track. Please try again.';
    } finally {
      isAddingTrack = false;
    }
  }

  async function handleCreatePlaylistAndAddTrack() {
    if (!title.trim() || !trackToAdd) {
      error = 'Title is required';
      return;
    }

    isSaving = true;
    error = null;

    try {
      // Create new playlist with the track already in it
      const trackRef: TrackReference = {
        kind: MUSIC_TRACK_KIND,
        pubkey: trackToAdd.pubkey,
        dTag: trackToAdd.d
      };

      const result = await publishPlaylist({
        title: title.trim(),
        description: description.trim() || undefined,
        image: image.trim() || undefined,
        isPublic,
        trackRefs: [trackRef]
      });

      onSuccess?.(result);
      onClose();
    } catch (err) {
      console.error('Failed to create playlist:', err);
      error = 'Failed to create playlist. Please try again.';
    } finally {
      isSaving = false;
    }
  }

  function getModalTitle(): string {
    if (mode === 'addTrack' && isCreatingNewPlaylist) {
      return 'New Playlist';
    }
    switch (mode) {
      case 'create': return 'Create Playlist';
      case 'edit': return 'Edit Playlist';
      case 'addTrack': return 'Add to Playlist';
    }
  }
</script>

<Modal {isOpen} {onClose} title={getModalTitle()}>
  {#snippet children()}
    {#if mode === 'addTrack' && !isCreatingNewPlaylist}
      <!-- Add Track Mode - Select Playlist -->
      <div class="add-track-content">
        {#if trackToAdd}
          <div class="track-preview">
            {#if trackToAdd.image}
              <img src={trackToAdd.image} alt="" class="track-image" />
            {:else}
              <div class="track-image-placeholder">
                <Music size={24} />
              </div>
            {/if}
            <div class="track-info">
              <span class="track-title">{trackToAdd.title}</span>
              <span class="track-artist">{trackToAdd.artist}</span>
            </div>
          </div>
        {/if}

        {#if isLoadingPlaylists}
          <div class="loading">
            <Loader2 size={24} class="spinner" />
            <span>Loading your playlists...</span>
          </div>
        {:else}
          <!-- Always show create new playlist button -->
          <button
            class="create-new-btn"
            onclick={() => isCreatingNewPlaylist = true}
          >
            <Plus size={18} />
            <span>Create new playlist</span>
          </button>

          {#if userPlaylists.length > 0}
            <div class="playlist-list">
              {#each userPlaylists as pl}
                <button
                  class="playlist-option"
                  class:selected={selectedPlaylistId === pl.id}
                  onclick={() => selectedPlaylistId = pl.id}
                >
                  {#if pl.image}
                    <img src={pl.image} alt="" class="playlist-thumb" />
                  {:else}
                    <div class="playlist-thumb-placeholder">
                      <List size={16} />
                    </div>
                  {/if}
                  <div class="playlist-option-info">
                    <span class="playlist-option-title">{pl.title}</span>
                    <span class="playlist-option-count">{pl.trackRefs.length} tracks</span>
                  </div>
                  {#if selectedPlaylistId === pl.id}
                    <Check size={18} class="check-icon" />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        {/if}

        {#if error}
          <p class="error-message">{error}</p>
        {/if}
      </div>
    {:else if mode === 'addTrack' && isCreatingNewPlaylist}
      <!-- Add Track Mode - Create New Playlist -->
      <div class="add-track-content">
        {#if trackToAdd}
          <div class="track-preview">
            {#if trackToAdd.image}
              <img src={trackToAdd.image} alt="" class="track-image" />
            {:else}
              <div class="track-image-placeholder">
                <Music size={24} />
              </div>
            {/if}
            <div class="track-info">
              <span class="track-title">{trackToAdd.title}</span>
              <span class="track-artist">{trackToAdd.artist}</span>
            </div>
          </div>
        {/if}

        <form onsubmit={(e) => { e.preventDefault(); handleCreatePlaylistAndAddTrack(); }} class="playlist-form">
          <div class="form-group">
            <label for="title">Title *</label>
            <input
              type="text"
              id="title"
              bind:value={title}
              placeholder="My Playlist"
              required
            />
          </div>

          <div class="form-group">
            <label for="description">Description</label>
            <textarea
              id="description"
              bind:value={description}
              placeholder="Optional description..."
              rows="2"
            ></textarea>
          </div>

          <div class="form-group checkbox">
            <label>
              <input type="checkbox" bind:checked={isPublic} />
              <span>Public playlist</span>
            </label>
          </div>
        </form>

        {#if error}
          <p class="error-message">{error}</p>
        {/if}
      </div>
    {:else}
      <!-- Create/Edit Mode -->
      <form onsubmit={handleSubmit} class="playlist-form">
        <div class="form-group">
          <label for="title">Title *</label>
          <input
            type="text"
            id="title"
            bind:value={title}
            placeholder="My Playlist"
            required
          />
        </div>

        <div class="form-group">
          <label for="description">Description</label>
          <textarea
            id="description"
            bind:value={description}
            placeholder="Optional description..."
            rows="3"
          ></textarea>
        </div>

        <div class="form-group">
          <label for="image">Cover Image URL</label>
          <input
            type="url"
            id="image"
            bind:value={image}
            placeholder="https://..."
          />
          {#if image}
            <img src={image} alt="Preview" class="image-preview" />
          {/if}
        </div>

        <div class="form-group checkbox">
          <label>
            <input type="checkbox" bind:checked={isPublic} />
            <span>Public playlist</span>
          </label>
        </div>

        {#if error}
          <p class="error-message">{error}</p>
        {/if}
      </form>
    {/if}
  {/snippet}

  {#snippet footer()}
    <div class="modal-actions">
      {#if mode === 'addTrack' && isCreatingNewPlaylist}
        <!-- Creating new playlist while adding track -->
        <button type="button" class="btn-cancel" onclick={() => isCreatingNewPlaylist = false}>
          Back
        </button>
        <button
          type="button"
          class="btn-save"
          onclick={handleCreatePlaylistAndAddTrack}
          disabled={isSaving || !title.trim()}
        >
          {#if isSaving}
            <Loader2 size={16} class="spinner" />
          {/if}
          Create & Add
        </button>
      {:else if mode === 'addTrack'}
        <!-- Selecting existing playlist -->
        <button type="button" class="btn-cancel" onclick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="btn-save"
          onclick={handleAddTrackToPlaylist}
          disabled={!selectedPlaylistId || isAddingTrack}
        >
          {#if isAddingTrack}
            <Loader2 size={16} class="spinner" />
          {/if}
          Add to Playlist
        </button>
      {:else}
        <!-- Create/Edit mode -->
        <button type="button" class="btn-cancel" onclick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          class="btn-save"
          onclick={handleSubmit}
          disabled={isSaving || !title.trim()}
        >
          {#if isSaving}
            <Loader2 size={16} class="spinner" />
          {/if}
          {mode === 'create' ? 'Create' : 'Save'}
        </button>
      {/if}
    </div>
  {/snippet}
</Modal>

<style>
  .playlist-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, #aaa);
  }

  .form-group input[type="text"],
  .form-group input[type="url"],
  .form-group textarea {
    padding: 10px 12px;
    background: var(--bg-secondary, #1a1a1a);
    border: 1px solid var(--bg-tertiary, #2a2a2a);
    border-radius: 8px;
    color: var(--text-primary, #fff);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    border-color: var(--accent-primary, #6366f1);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 60px;
  }

  .form-group.checkbox label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .form-group.checkbox input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent-primary, #6366f1);
  }

  .image-preview {
    width: 100%;
    max-height: 150px;
    object-fit: cover;
    border-radius: 8px;
    margin-top: 8px;
  }

  .error-message {
    color: #ef4444;
    font-size: 13px;
    margin: 8px 0 0;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    width: 100%;
  }

  .btn-cancel,
  .btn-save {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid var(--text-muted, #888);
    color: var(--text-primary, #fff);
  }

  .btn-cancel:hover {
    border-color: var(--text-primary, #fff);
    background: var(--bg-secondary, #1a1a1a);
  }

  .btn-save {
    background: var(--accent-primary, #6366f1);
    border: none;
    color: #fff;
  }

  .btn-save:hover:not(:disabled) {
    background: var(--accent-hover, #5558e8);
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Add Track Mode Styles */
  .add-track-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .track-preview {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg-secondary, #1a1a1a);
    border-radius: 8px;
  }

  .track-image,
  .track-image-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .track-image-placeholder {
    background: var(--bg-tertiary, #2a2a2a);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #888);
  }

  .track-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .track-title {
    font-weight: 500;
    color: var(--text-primary, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-artist {
    font-size: 13px;
    color: var(--text-muted, #888);
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    color: var(--text-muted, #888);
    gap: 12px;
  }

  .create-new-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    background: var(--bg-secondary, #1a1a1a);
    border: 1px dashed var(--text-muted, #666);
    border-radius: 8px;
    color: var(--text-primary, #fff);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .create-new-btn:hover {
    border-color: var(--accent-primary, #6366f1);
    background: var(--bg-tertiary, #2a2a2a);
  }

  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 300px;
    overflow-y: auto;
  }

  .playlist-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    width: 100%;
    color: var(--text-primary, #fff);
  }

  .playlist-option:hover {
    background: var(--bg-secondary, #1a1a1a);
  }

  .playlist-option.selected {
    background: var(--bg-secondary, #1a1a1a);
    border-color: var(--accent-primary, #6366f1);
  }

  .playlist-thumb,
  .playlist-thumb-placeholder {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .playlist-thumb-placeholder {
    background: var(--bg-tertiary, #2a2a2a);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #888);
  }

  .playlist-option-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .playlist-option-title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .playlist-option-count {
    font-size: 12px;
    color: var(--text-muted, #888);
  }

  :global(.check-icon) {
    color: var(--accent-primary, #6366f1);
    flex-shrink: 0;
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
