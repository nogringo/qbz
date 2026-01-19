<script lang="ts">
  import { onMount } from 'svelte';
  import TitleBar from '../TitleBar.svelte';
  import { loginWithNsec, loginWithBunker, restoreSession, type NostrUser } from '$lib/nostr/auth';

  interface Props {
    onLoginSuccess: (user: NostrUser) => void;
  }

  let { onLoginSuccess }: Props = $props();

  type LoginMethod = 'bunker' | 'nsec';

  let selectedMethod = $state<LoginMethod>('bunker');
  let bunkerUri = $state('');
  let nsecInput = $state('');
  let isLoading = $state(false);
  let isRestoring = $state(true);
  let error = $state<string | null>(null);

  // Try to restore session on mount
  onMount(() => {
    tryRestoreSession();
  });

  async function tryRestoreSession() {
    isRestoring = true;
    try {
      const user = await restoreSession();
      if (user) {
        onLoginSuccess(user);
        return;
      }
    } catch (err) {
      console.error('Session restore failed:', err);
    } finally {
      isRestoring = false;
    }
  }

  async function handleLogin(e: Event) {
    e.preventDefault();
    error = null;
    isLoading = true;

    try {
      let user: NostrUser;

      if (selectedMethod === 'bunker') {
        if (!bunkerUri.trim()) {
          throw new Error('Please enter your bunker URI');
        }
        user = await loginWithBunker(bunkerUri.trim());
      } else {
        if (!nsecInput.trim()) {
          throw new Error('Please enter your nsec or private key');
        }
        user = await loginWithNsec(nsecInput.trim());
      }

      onLoginSuccess(user);
    } catch (err) {
      console.error('Login error:', err);
      error = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="login-wrapper">
  <TitleBar />
  <div class="login-view">
    <div class="login-card">
      <!-- Logo -->
      <div class="logo">
        <div class="logo-icon">&#9835;</div>
        <h1>Nostr Music</h1>
        <p class="subtitle">Decentralized Music Player</p>
      </div>

      {#if isRestoring}
        <div class="initializing">
          <div class="spinner"></div>
          <p>Restoring session...</p>
        </div>
      {:else}
        <!-- Method selector -->
        <div class="method-selector">
          <button
            type="button"
            class="method-btn"
            class:active={selectedMethod === 'bunker'}
            onclick={() => selectedMethod = 'bunker'}
          >
            Bunker (NIP-46)
          </button>
          <button
            type="button"
            class="method-btn"
            class:active={selectedMethod === 'nsec'}
            onclick={() => selectedMethod = 'nsec'}
          >
            nsec
          </button>
        </div>

        <form onsubmit={handleLogin}>
          {#if selectedMethod === 'bunker'}
            <div class="input-group">
              <label for="bunker-uri">Bunker URI</label>
              <input
                id="bunker-uri"
                type="text"
                bind:value={bunkerUri}
                placeholder="bunker://pubkey?relay=wss://..."
                disabled={isLoading}
                autocomplete="off"
              />
              <p class="input-hint">
                Paste your bunker connection string from nsec.app, Amber, or another NIP-46 signer.
              </p>
            </div>
          {:else}
            <div class="input-group">
              <label for="nsec">Private Key (nsec)</label>
              <input
                id="nsec"
                type="password"
                bind:value={nsecInput}
                placeholder="nsec1... or hex"
                disabled={isLoading}
                autocomplete="off"
              />
              <p class="input-hint warning">
                Your private key will be stored locally. For better security, use a bunker.
              </p>
            </div>
          {/if}

          {#if error}
            <div class="error-message">{error}</div>
          {/if}

          <button type="submit" class="login-btn" disabled={isLoading}>
            {#if isLoading}
              <div class="spinner small"></div>
              <span>Connecting...</span>
            {:else}
              <span>Connect</span>
            {/if}
          </button>
        </form>

        <p class="disclaimer">
          Your keys stay on your device. We never see or store your private key.
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .login-wrapper {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: var(--bg-primary);
  }

  .login-view {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bg-primary);
  }

  .login-card {
    width: 100%;
    max-width: 420px;
    padding: 48px;
    background-color: var(--bg-secondary);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .logo {
    text-align: center;
    margin-bottom: 32px;
  }

  .logo-icon {
    font-size: 48px;
    color: var(--accent-primary);
    margin-bottom: 8px;
  }

  .logo h1 {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .subtitle {
    font-size: 14px;
    color: var(--text-muted);
  }

  .method-selector {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    padding: 4px;
    background-color: var(--bg-tertiary);
    border-radius: 8px;
  }

  .method-btn {
    flex: 1;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .method-btn:hover {
    color: var(--text-primary);
  }

  .method-btn.active {
    background-color: var(--accent-primary);
    color: white;
  }

  .initializing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 0;
  }

  .initializing p {
    margin-top: 16px;
    color: var(--text-muted);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-group label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .input-group input {
    height: 48px;
    padding: 0 16px;
    background-color: var(--bg-tertiary);
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 14px;
    font-family: monospace;
    color: var(--text-primary);
    outline: none;
    transition: border-color 150ms ease;
  }

  .input-group input:focus {
    border-color: var(--accent-primary);
  }

  .input-group input::placeholder {
    color: var(--text-muted);
    font-family: inherit;
  }

  .input-group input:disabled {
    opacity: 0.6;
  }

  .input-hint {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .input-hint.warning {
    color: #fbbf24;
  }

  .error-message {
    padding: 12px 16px;
    background-color: rgba(255, 107, 107, 0.1);
    border-radius: 8px;
    color: #ff6b6b;
    font-size: 14px;
  }

  .login-btn {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 150ms ease;
  }

  .login-btn:hover:not(:disabled) {
    background-color: var(--accent-hover);
  }

  .login-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .disclaimer {
    margin-top: 24px;
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.5;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--bg-tertiary);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .spinner.small {
    width: 18px;
    height: 18px;
    border-width: 2px;
    border-color: rgba(255, 255, 255, 0.3);
    border-top-color: white;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
