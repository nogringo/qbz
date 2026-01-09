<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  interface UserInfo {
    userName: string;
    subscription: string;
  }

  interface Props {
    onLoginSuccess: (userInfo: UserInfo) => void;
  }

  let { onLoginSuccess }: Props = $props();

  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let isInitializing = $state(true);
  let error = $state<string | null>(null);
  let initError = $state<string | null>(null);

  // Initialize the Qobuz client on mount
  $effect(() => {
    initializeClient();
  });

  async function initializeClient() {
    try {
      isInitializing = true;
      initError = null;
      const result = await invoke<boolean>('init_client');
      console.log('Client initialized:', result);

      // Check if already logged in
      const loggedIn = await invoke<boolean>('is_logged_in');
      if (loggedIn) {
        // Get user info from stored session
        const userInfo = await invoke<{ user_name: string; subscription: string } | null>('get_user_info');
        if (userInfo) {
          onLoginSuccess({ userName: userInfo.user_name, subscription: userInfo.subscription });
        } else {
          onLoginSuccess({ userName: 'Qobuz User', subscription: 'Active' });
        }
      }
    } catch (err) {
      console.error('Failed to initialize client:', err);
      initError = String(err);
    } finally {
      isInitializing = false;
    }
  }

  async function handleLogin(e: Event) {
    e.preventDefault();

    if (!email || !password) {
      error = 'Please enter email and password';
      return;
    }

    isLoading = true;
    error = null;

    try {
      const response = await invoke<{
        success: boolean;
        user_name?: string;
        subscription?: string;
        error?: string;
      }>('login', { email, password });

      console.log('Login response:', response);

      if (response.success) {
        onLoginSuccess({
          userName: response.user_name || 'Qobuz User',
          subscription: response.subscription || 'Active'
        });
      } else {
        error = response.error || 'Login failed';
      }
    } catch (err) {
      console.error('Login error:', err);
      error = String(err);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="login-view">
  <div class="login-card">
    <!-- Logo -->
    <div class="logo">
      <img src="/logo.png" alt="QBZ Logo" class="logo-img" />
      <h1>QBZ</h1>
      <p class="subtitle">Native Qobuz Client for Linux</p>
    </div>

    {#if isInitializing}
      <div class="initializing">
        <div class="spinner"></div>
        <p>Connecting to Qobuz...</p>
      </div>
    {:else if initError}
      <div class="error-box">
        <p>Failed to connect to Qobuz</p>
        <p class="error-detail">{initError}</p>
        <button class="retry-btn" onclick={initializeClient}>Retry</button>
      </div>
    {:else}
      <form onsubmit={handleLogin}>
        <div class="input-group">
          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            placeholder="your@email.com"
            disabled={isLoading}
            autocomplete="email"
          />
        </div>

        <div class="input-group">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            placeholder="Password"
            disabled={isLoading}
            autocomplete="current-password"
          />
        </div>

        {#if error}
          <div class="error-message">{error}</div>
        {/if}

        <button type="submit" class="login-btn" disabled={isLoading}>
          {#if isLoading}
            <div class="spinner small"></div>
            <span>Signing in...</span>
          {:else}
            <span>Sign in with Qobuz</span>
          {/if}
        </button>
      </form>

      <p class="disclaimer">
        QBZ requires an active Qobuz subscription.
        Your credentials are sent directly to Qobuz and never stored on external servers.
      </p>
    {/if}
  </div>
</div>

<style>
  .login-view {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bg-primary);
  }

  .login-card {
    width: 100%;
    max-width: 400px;
    padding: 48px;
    background-color: var(--bg-secondary);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .logo {
    text-align: center;
    margin-bottom: 32px;
    color: var(--accent-primary);
  }

  .logo-img {
    width: 80px;
    height: 80px;
    object-fit: contain;
  }

  .logo h1 {
    font-size: 32px;
    font-weight: 700;
    color: var(--text-primary);
    margin-top: 16px;
    margin-bottom: 4px;
  }

  .subtitle {
    font-size: 14px;
    color: var(--text-muted);
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

  .error-box {
    text-align: center;
    padding: 24px;
    background-color: rgba(255, 107, 107, 0.1);
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .error-box p {
    color: #ff6b6b;
    margin-bottom: 8px;
  }

  .error-detail {
    font-size: 12px;
    color: var(--text-muted) !important;
    word-break: break-word;
  }

  .retry-btn {
    margin-top: 16px;
    padding: 8px 24px;
    background-color: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: background-color 150ms ease;
  }

  .retry-btn:hover {
    background-color: var(--accent-hover);
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
    font-size: 16px;
    color: var(--text-primary);
    outline: none;
    transition: border-color 150ms ease;
  }

  .input-group input:focus {
    border-color: var(--accent-primary);
  }

  .input-group input::placeholder {
    color: var(--text-muted);
  }

  .input-group input:disabled {
    opacity: 0.6;
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
