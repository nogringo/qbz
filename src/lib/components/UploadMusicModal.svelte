<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Upload, Music, Image, Video, Loader2, Plus, Trash2 } from 'lucide-svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import {
    uploadAudioToBlossom,
    uploadImageToBlossom,
    uploadVideoToBlossom,
    getAudioFormat,
    getMimeType,
    isSupportedAudio,
    isSupportedImage,
    isSupportedVideo,
    DEFAULT_BLOSSOM_SERVERS,
    SUPPORTED_AUDIO_FORMATS,
    SUPPORTED_VIDEO_FORMATS
  } from '$lib/nostr/blossom';
  import { readFile } from '@tauri-apps/plugin-fs';
  import { publishMusicTrack, fetchBlossomServers } from '$lib/nostr/client';
  import { showToast } from '$lib/stores/toastStore';
  import { getAuthState } from '$lib/stores/authStore';

  interface Props {
    onClose: () => void;
    onSuccess?: () => void;
  }

  let { onClose, onSuccess }: Props = $props();

  // Form state - files
  let audioFilePath = $state<string | null>(null);
  let audioFileName = $state<string>('');
  let coverFilePath = $state<string | null>(null);
  let coverFileName = $state<string>('');
  let videoFilePath = $state<string | null>(null);
  let videoFileName = $state<string>('');

  // Form fields
  let title = $state('');
  let artist = $state('');
  let album = $state('');
  let trackNumber = $state('');
  let released = $state('');
  let language = $state('');
  let explicit = $state(false);
  let genres = $state('');
  let lyrics = $state('');

  // Zap splits
  interface ZapSplitEntry {
    address: string;
    weight: string;
  }
  let zapSplits = $state<ZapSplitEntry[]>([]);

  // Common languages (ISO 639-1)
  const LANGUAGES = [
    { code: '', label: 'Not specified' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'it', label: 'Italian' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ru', label: 'Russian' },
    { code: 'ar', label: 'Arabic' },
    { code: 'hi', label: 'Hindi' },
    { code: 'nl', label: 'Dutch' },
    { code: 'sv', label: 'Swedish' },
    { code: 'pl', label: 'Polish' },
    { code: 'tr', label: 'Turkish' }
  ];

  // Blossom servers
  let blossomServers = $state<string[]>([]);
  let isLoadingServers = $state(true);

  // Audio metadata (auto-detected)
  let detectedDuration = $state<number | null>(null);
  let isDetectingDuration = $state(false);

  // Loading states
  let isUploading = $state(false);
  let uploadProgress = $state('');
  let error = $state<string | null>(null);

  /**
   * Detect audio duration using HTML Audio element with Blob URL
   */
  async function detectAudioDuration(filePath: string): Promise<number | null> {
    let blobUrl: string | null = null;

    try {
      // Read file and create blob URL
      const fileData = await readFile(filePath);
      const mimeType = getMimeType(filePath);
      const blob = new Blob([fileData], { type: mimeType });
      blobUrl = URL.createObjectURL(blob);

      console.log('[Upload] Detecting duration for:', filePath);

      return new Promise((resolve) => {
        const audio = new Audio();
        let resolved = false;

        const cleanup = () => {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
          }
        };

        const resolveDuration = () => {
          if (resolved) return;
          if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
            resolved = true;
            console.log('[Upload] Duration detected:', audio.duration);
            cleanup();
            resolve(Math.round(audio.duration));
          }
        };

        audio.addEventListener('loadedmetadata', resolveDuration);
        audio.addEventListener('loadeddata', resolveDuration);
        audio.addEventListener('canplaythrough', resolveDuration);

        audio.addEventListener('error', (e) => {
          if (resolved) return;
          resolved = true;
          console.warn('[Upload] Could not detect audio duration:', e);
          cleanup();
          resolve(null);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          console.warn('[Upload] Duration detection timeout');
          cleanup();
          resolve(null);
        }, 5000);

        audio.preload = 'metadata';
        audio.src = blobUrl!;
        audio.load();
      });
    } catch (err) {
      console.warn('[Upload] Error detecting audio duration:', err);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      return null;
    }
  }

  onMount(async () => {
    const authState = getAuthState();

    // Pre-fill artist with user's display name
    if (authState.userInfo?.userName) {
      artist = authState.userInfo.userName;
    }

    // Load user's Blossom servers
    if (authState.userInfo?.pubkey) {
      try {
        const userServers = await fetchBlossomServers(authState.userInfo.pubkey);
        if (userServers.length > 0) {
          blossomServers = userServers;
        } else {
          // Fallback to defaults if user has no servers configured
          blossomServers = DEFAULT_BLOSSOM_SERVERS;
        }
      } catch (err) {
        console.error('Failed to fetch Blossom servers:', err);
        blossomServers = DEFAULT_BLOSSOM_SERVERS;
      }
    } else {
      blossomServers = DEFAULT_BLOSSOM_SERVERS;
    }
    isLoadingServers = false;
  });

  async function selectAudioFile() {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Audio',
        extensions: SUPPORTED_AUDIO_FORMATS
      }]
    });

    if (selected && typeof selected === 'string') {
      if (isSupportedAudio(selected)) {
        audioFilePath = selected;
        audioFileName = selected.split('/').pop() || selected.split('\\').pop() || selected;
        error = null;

        // Auto-fill title from filename if empty
        if (!title) {
          const nameWithoutExt = audioFileName.replace(/\.[^/.]+$/, '');
          title = nameWithoutExt;
        }

        // Auto-detect duration
        isDetectingDuration = true;
        detectedDuration = await detectAudioDuration(selected);
        isDetectingDuration = false;
        if (detectedDuration) {
          console.log(`[Upload] Detected duration: ${detectedDuration}s`);
        } else {
          console.warn('[Upload] Duration detection failed');
        }
      } else {
        error = 'Unsupported audio format';
      }
    }
  }

  async function selectCoverImage() {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Images',
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp']
      }]
    });

    if (selected && typeof selected === 'string') {
      if (isSupportedImage(selected)) {
        coverFilePath = selected;
        coverFileName = selected.split('/').pop() || selected.split('\\').pop() || selected;
        error = null;
      } else {
        error = 'Unsupported image format';
      }
    }
  }

  function clearAudioFile() {
    audioFilePath = null;
    audioFileName = '';
    detectedDuration = null;
    isDetectingDuration = false;
  }

  function clearCoverImage() {
    coverFilePath = null;
    coverFileName = '';
  }

  async function selectVideoFile() {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Video',
        extensions: SUPPORTED_VIDEO_FORMATS
      }]
    });

    if (selected && typeof selected === 'string') {
      if (isSupportedVideo(selected)) {
        videoFilePath = selected;
        videoFileName = selected.split('/').pop() || selected.split('\\').pop() || selected;
        error = null;
      } else {
        error = 'Unsupported video format';
      }
    }
  }

  function clearVideoFile() {
    videoFilePath = null;
    videoFileName = '';
  }

  function addZapSplit() {
    zapSplits = [...zapSplits, { address: '', weight: '1' }];
  }

  function removeZapSplit(index: number) {
    zapSplits = zapSplits.filter((_, i) => i !== index);
  }

  async function handleSubmit() {
    if (!audioFilePath) {
      error = 'Please select an audio file';
      return;
    }

    if (!title.trim()) {
      error = 'Title is required';
      return;
    }

    if (!artist.trim()) {
      error = 'Artist is required';
      return;
    }

    isUploading = true;
    error = null;

    try {
      // Upload audio file to ALL Blossom servers in parallel
      uploadProgress = `Uploading audio to ${blossomServers.length} server(s)...`;

      const audioUploadPromises = blossomServers.map(server =>
        uploadAudioToBlossom(audioFilePath!, server)
          .then(result => ({ server, result, success: true as const }))
          .catch(err => ({ server, error: err, success: false as const }))
      );

      const audioResults = await Promise.all(audioUploadPromises);
      const successfulAudioUploads = audioResults.filter(r => r.success);
      const failedAudioUploads = audioResults.filter(r => !r.success);

      // Log failed uploads for debugging
      for (const failed of failedAudioUploads) {
        console.error(`[Upload] Failed to upload to ${(failed as any).server}:`, (failed as any).error);
      }

      if (successfulAudioUploads.length === 0) {
        const errors = failedAudioUploads.map(f => `${(f as any).server}: ${(f as any).error?.message || 'Unknown error'}`).join('\n');
        throw new Error(`Failed to upload audio to any server:\n${errors}`);
      }

      // Use the URL from the first successful upload
      const audioResult = (successfulAudioUploads[0] as { result: { url: string } }).result;
      console.log(`[Upload] Audio uploaded to ${successfulAudioUploads.length}/${blossomServers.length} servers:`, audioResult.url);

      // Upload cover image to ALL servers if provided
      let imageUrl: string | undefined;
      if (coverFilePath) {
        uploadProgress = `Uploading cover to ${blossomServers.length} server(s)...`;

        const imageUploadPromises = blossomServers.map(server =>
          uploadImageToBlossom(coverFilePath!, server)
            .then(result => ({ server, result, success: true as const }))
            .catch(err => ({ server, error: err, success: false as const }))
        );

        const imageResults = await Promise.all(imageUploadPromises);
        const successfulImageUploads = imageResults.filter(r => r.success);

        if (successfulImageUploads.length > 0) {
          imageUrl = (successfulImageUploads[0] as { result: { url: string } }).result.url;
          console.log(`[Upload] Cover uploaded to ${successfulImageUploads.length}/${blossomServers.length} servers:`, imageUrl);
        }
      }

      // Upload video to ALL servers if provided
      let videoUrl: string | undefined;
      if (videoFilePath) {
        uploadProgress = `Uploading video to ${blossomServers.length} server(s)...`;

        const videoUploadPromises = blossomServers.map(server =>
          uploadVideoToBlossom(videoFilePath!, server)
            .then(result => ({ server, result, success: true as const }))
            .catch(err => ({ server, error: err, success: false as const }))
        );

        const videoResults = await Promise.all(videoUploadPromises);
        const successfulVideoUploads = videoResults.filter(r => r.success);

        if (successfulVideoUploads.length > 0) {
          videoUrl = (successfulVideoUploads[0] as { result: { url: string } }).result.url;
          console.log(`[Upload] Video uploaded to ${successfulVideoUploads.length}/${blossomServers.length} servers:`, videoUrl);
        }
      }

      // Parse genres
      const genreList = genres
        .split(',')
        .map(g => g.trim())
        .filter(g => g.length > 0);

      // Parse zap splits
      const validZapSplits = zapSplits
        .filter(z => z.address.trim())
        .map(z => ({
          address: z.address.trim(),
          weight: parseInt(z.weight) || 1
        }));

      // Publish track
      uploadProgress = 'Publishing to Nostr...';
      const track = await publishMusicTrack({
        title: title.trim(),
        artist: artist.trim(),
        url: audioResult.url,
        image: imageUrl,
        video: videoUrl,
        album: album.trim() || undefined,
        trackNumber: trackNumber ? parseInt(trackNumber) : undefined,
        released: released.trim() || undefined,
        language: language || undefined,
        explicit: explicit,
        duration: detectedDuration || undefined,
        genres: genreList.length > 0 ? genreList : undefined,
        lyrics: lyrics.trim() || undefined,
        format: getAudioFormat(audioFilePath),
        zapSplits: validZapSplits.length > 0 ? validZapSplits : undefined
      });

      console.log('[Upload] Track published:', track.naddr);
      showToast('Track published successfully!', 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('[Upload] Error:', err);
      error = err instanceof Error ? err.message : 'Upload failed';
      showToast(error, 'error');
    } finally {
      isUploading = false;
      uploadProgress = '';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !isUploading) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={() => !isUploading && onClose()}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h2>Upload Music</h2>
      <button class="close-btn" onclick={onClose} disabled={isUploading}>
        <X size={20} />
      </button>
    </div>

    <div class="modal-content">
      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      <!-- Audio File Selection -->
      <div class="form-group">
        <span class="field-label">Audio File *</span>
        {#if audioFilePath}
          <div class="file-selected">
            <Music size={16} />
            <span class="file-name">{audioFileName}</span>
            {#if isDetectingDuration}
              <span class="duration-badge loading"><Loader2 size={12} class="spinning" /></span>
            {:else if detectedDuration}
              <span class="duration-badge">{Math.floor(detectedDuration / 60)}:{String(detectedDuration % 60).padStart(2, '0')}</span>
            {:else}
              <span class="duration-badge error">--:--</span>
            {/if}
            <button class="remove-btn" onclick={clearAudioFile} disabled={isUploading}>
              <X size={14} />
            </button>
          </div>
        {:else}
          <button class="file-select-btn" onclick={selectAudioFile} disabled={isUploading}>
            <Upload size={16} />
            Select Audio File
          </button>
          <p class="hint">Supported: MP3, FLAC, OGG, M4A, WAV, AAC, OPUS</p>
        {/if}
      </div>

      <!-- Cover Image Selection -->
      <div class="form-group">
        <span class="field-label">Cover Image (optional)</span>
        {#if coverFilePath}
          <div class="file-selected">
            <Image size={16} />
            <span class="file-name">{coverFileName}</span>
            <button class="remove-btn" onclick={clearCoverImage} disabled={isUploading}>
              <X size={14} />
            </button>
          </div>
        {:else}
          <button class="file-select-btn secondary" onclick={selectCoverImage} disabled={isUploading}>
            <Image size={16} />
            Select Cover Image
          </button>
        {/if}
      </div>

      <!-- Music Video Selection -->
      <div class="form-group">
        <span class="field-label">Music Video (optional)</span>
        {#if videoFilePath}
          <div class="file-selected">
            <Video size={16} />
            <span class="file-name">{videoFileName}</span>
            <button class="remove-btn" onclick={clearVideoFile} disabled={isUploading}>
              <X size={14} />
            </button>
          </div>
        {:else}
          <button class="file-select-btn secondary" onclick={selectVideoFile} disabled={isUploading}>
            <Video size={16} />
            Select Music Video
          </button>
        {/if}
      </div>

      <!-- Title -->
      <div class="form-group">
        <label for="title">Title *</label>
        <input
          type="text"
          id="title"
          bind:value={title}
          placeholder="Track title"
          disabled={isUploading}
        />
      </div>

      <!-- Artist -->
      <div class="form-group">
        <label for="artist">Artist</label>
        <input
          type="text"
          id="artist"
          bind:value={artist}
          placeholder="Artist name"
          disabled={isUploading}
        />
      </div>

      <!-- Album -->
      <div class="form-group">
        <label for="album">Album</label>
        <input
          type="text"
          id="album"
          bind:value={album}
          placeholder="Album name (optional)"
          disabled={isUploading}
        />
      </div>

      <!-- Track Number -->
      <div class="form-group">
        <label for="trackNumber">Track Number</label>
        <input
          type="number"
          id="trackNumber"
          bind:value={trackNumber}
          placeholder="Position in album"
          min="1"
          disabled={isUploading}
        />
      </div>

      <!-- Release Date -->
      <div class="form-group">
        <label for="released">Release Date</label>
        <input
          type="date"
          id="released"
          bind:value={released}
          disabled={isUploading}
        />
      </div>

      <!-- Language -->
      <div class="form-group">
        <label for="language">Language</label>
        <select id="language" bind:value={language} disabled={isUploading}>
          {#each LANGUAGES as lang}
            <option value={lang.code}>{lang.label}</option>
          {/each}
        </select>
      </div>

      <!-- Genres -->
      <div class="form-group">
        <label for="genres">Genres</label>
        <input
          type="text"
          id="genres"
          bind:value={genres}
          placeholder="rock, electronic, ambient"
          disabled={isUploading}
        />
        <p class="hint">Comma-separated list</p>
      </div>

      <!-- Explicit -->
      <div class="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            bind:checked={explicit}
            disabled={isUploading}
          />
          Explicit content
        </label>
      </div>

      <!-- Lyrics -->
      <div class="form-group">
        <label for="lyrics">Lyrics</label>
        <textarea
          id="lyrics"
          bind:value={lyrics}
          placeholder="Paste lyrics here (optional)"
          rows="4"
          disabled={isUploading}
        ></textarea>
      </div>

      <!-- Zap Splits -->
      <div class="form-group">
        <div class="zap-splits-header">
          <span class="field-label">Zap Splits</span>
          <button type="button" class="add-split-btn" onclick={addZapSplit} disabled={isUploading}>
            <Plus size={14} />
            Add
          </button>
        </div>
        {#if zapSplits.length === 0}
          <p class="hint">Add lightning addresses to split zaps with collaborators</p>
        {:else}
          <div class="zap-splits-list">
            {#each zapSplits as split, index}
              <div class="zap-split-row">
                <input
                  type="text"
                  bind:value={split.address}
                  placeholder="Lightning address (e.g. user@getalby.com)"
                  disabled={isUploading}
                  class="zap-address"
                />
                <input
                  type="number"
                  bind:value={split.weight}
                  placeholder="Weight"
                  min="1"
                  disabled={isUploading}
                  class="zap-weight"
                />
                <button type="button" class="remove-split-btn" onclick={() => removeZapSplit(index)} disabled={isUploading}>
                  <Trash2 size={14} />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      {#if !isLoadingServers && blossomServers.length === 0}
      <div class="form-group">
        <p class="no-servers-warning">No Blossom servers configured. Please add servers to your profile (kind 10063).</p>
      </div>
    {/if}
    </div>

    <div class="modal-footer">
      {#if isUploading}
        <div class="upload-progress">
          <Loader2 size={16} class="spinning" />
          <span>{uploadProgress}</span>
        </div>
      {/if}
      <button class="cancel-btn" onclick={onClose} disabled={isUploading}>
        Cancel
      </button>
      <button class="submit-btn" onclick={handleSubmit} disabled={isUploading || !audioFilePath || isLoadingServers || blossomServers.length === 0}>
        {#if isUploading}
          Publishing...
        {:else}
          Publish Track
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding-bottom: 110px; /* Space for NowPlayingBar */
  }

  .modal {
    background: var(--bg-primary, #0d0d0d);
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    max-height: calc(85vh - 110px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-color, #2a2a2a);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #2a2a2a);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary, #fff);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted, #888);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close-btn:hover:not(:disabled) {
    color: var(--text-primary, #fff);
    background: var(--bg-secondary, #1a1a1a);
  }

  .close-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-content {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .error-message {
    background: rgba(255, 107, 107, 0.1);
    border: 1px solid rgba(255, 107, 107, 0.3);
    color: #ff6b6b;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label,
  .form-group .field-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, #ccc);
    margin-bottom: 6px;
  }

  .form-group input[type="text"],
  .form-group input[type="date"],
  .form-group input[type="number"],
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-secondary, #1a1a1a);
    border: 1px solid var(--border-color, #2a2a2a);
    border-radius: 6px;
    color: var(--text-primary, #fff);
    font-size: 14px;
    color-scheme: dark;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--accent-primary, #6366f1);
  }

  .form-group input:disabled,
  .form-group select:disabled,
  .form-group textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .hint {
    font-size: 11px;
    color: var(--text-muted, #888);
    margin-top: 4px;
  }

  .no-servers-warning {
    padding: 10px 12px;
    background: rgba(255, 107, 107, 0.1);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: 6px;
    color: #ff6b6b;
    font-size: 12px;
    margin: 0;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-group input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent-primary, #6366f1);
  }

  .file-select-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--accent-primary, #6366f1);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    width: 100%;
    justify-content: center;
  }

  .file-select-btn:hover:not(:disabled) {
    background: var(--accent-hover, #5558e8);
  }

  .file-select-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .file-select-btn.secondary {
    background: var(--bg-tertiary, #2a2a2a);
    color: var(--text-primary, #fff);
  }

  .file-select-btn.secondary:hover:not(:disabled) {
    background: var(--bg-secondary, #1a1a1a);
    border: 1px solid var(--border-color, #2a2a2a);
  }

  .file-selected {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--bg-secondary, #1a1a1a);
    border: 1px solid var(--accent-primary, #6366f1);
    border-radius: 6px;
    color: var(--text-primary, #fff);
  }

  .file-selected .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .duration-badge {
    padding: 2px 8px;
    background: var(--accent-primary, #6366f1);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
  }

  .duration-badge.loading {
    background: var(--bg-tertiary, #2a2a2a);
  }

  .duration-badge.error {
    background: var(--bg-tertiary, #2a2a2a);
    color: var(--text-muted, #888);
  }

  .duration-badge :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--text-muted, #888);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-btn:hover:not(:disabled) {
    color: #ff6b6b;
  }

  .remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 20px;
    border-top: 1px solid var(--border-color, #2a2a2a);
  }

  .upload-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent-primary, #6366f1);
    font-size: 13px;
    margin-right: auto;
  }

  .upload-progress :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .cancel-btn {
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--border-color, #2a2a2a);
    border-radius: 6px;
    color: var(--text-primary, #fff);
    font-size: 14px;
    cursor: pointer;
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--bg-secondary, #1a1a1a);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn {
    padding: 10px 20px;
    background: var(--accent-primary, #6366f1);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--accent-hover, #5558e8);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Zap Splits */
  .zap-splits-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .add-split-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--bg-tertiary, #2a2a2a);
    border: none;
    border-radius: 4px;
    color: var(--text-primary, #fff);
    font-size: 12px;
    cursor: pointer;
  }

  .add-split-btn:hover:not(:disabled) {
    background: var(--bg-secondary, #1a1a1a);
  }

  .add-split-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .zap-splits-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .zap-split-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .zap-address {
    flex: 1;
  }

  .zap-weight {
    width: 80px !important;
    flex: none !important;
  }

  .remove-split-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    background: none;
    border: none;
    color: var(--text-muted, #888);
    cursor: pointer;
    border-radius: 4px;
  }

  .remove-split-btn:hover:not(:disabled) {
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
  }

  .remove-split-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
