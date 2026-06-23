<script>
  import { login, authLoading, authError } from "$lib/stores/authStore.js";

  let username = $state("");
  let password = $state("");
  let showPassword = $state(false);

  async function handleLogin(event) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      return;
    }

    await login(username.trim(), password);
  }
</script>

<section class="login-page">
  <form class="login-card" onsubmit={handleLogin}>
    <div class="brand">
      <div class="brand-icon">⚓</div>
      <div>
        <h1>VMS Dashboard</h1>
        <p>Maritime Monitoring System</p>
      </div>
    </div>

    {#if $authError}
      <div class="error-box">
        {$authError}
      </div>
    {/if}

    <label class="field">
      <span>Username</span>
      <input
        type="text"
        bind:value={username}
        placeholder="Enter username"
        autocomplete="username"
      />
    </label>

    <label class="field">
      <span>Password</span>

      <div class="password-wrap">
        <input
          type={showPassword ? "text" : "password"}
          bind:value={password}
          placeholder="Enter password"
          autocomplete="current-password"
        />

        <button
          type="button"
          class="toggle-password"
          onclick={() => (showPassword = !showPassword)}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    </label>

    <button
      type="submit"
      class="login-btn"
      disabled={$authLoading || !username.trim() || !password.trim()}
    >
      {$authLoading ? "Signing in..." : "Login"}
    </button>
  </form>
</section>

<footer class="login-footer">© 2026 PT Prima Teknik Solusindo</footer>

<style>
  .login-page {
    position: relative;
    width: 100%;
    height: 100vh;
    display: grid;
    place-items: center;
    padding: 16px;
    background:
      linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px),
      radial-gradient(circle at 12% 8%, rgba(59, 130, 246, 0.18), transparent 30%),
      radial-gradient(circle at 88% 88%, rgba(37, 99, 235, 0.11), transparent 24%),
      linear-gradient(135deg, #0a0e1a 0%, #0f1729 50%, #0a0e1a 100%);
    background-size: 42px 42px, 42px 42px, auto, auto, auto;
    box-sizing: border-box;
  }

  .login-card {
    width: min(380px, 100%);
    padding: 28px;
    border-radius: 20px;
    background: rgba(17, 24, 39, 0.85);
    backdrop-filter: blur(24px) saturate(1.5);
    border: 1px solid rgba(59, 130, 246, 0.15);
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.05);
    animation: cardIn 0.45s var(--ease-spring);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .brand-icon {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: white;
    font-size: 24px;
    box-shadow: 0 12px 28px rgba(37, 99, 235, 0.35);
  }

  h1 {
    margin: 0;
    color: var(--text-primary);
    font-size: 24px;
    line-height: 1.1;
    font-weight: 900;
  }

  p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .error-box {
    margin-bottom: 14px;
    padding: 10px 12px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
    background: var(--color-danger-muted);
    color: #fca5a5;
    font-size: 12px;
    font-weight: 800;
  }

  .field {
    display: block;
    margin-bottom: 14px;
  }

  .field span {
    display: block;
    margin-bottom: 7px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 900;
  }

  input {
    width: 100%;
    height: 42px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 0 12px;
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.04);
    font-size: 13px;
    font-weight: 700;
    outline: none;
    box-sizing: border-box;
  }

  input:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .password-wrap {
    display: grid;
    grid-template-columns: 1fr auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
  }

  .password-wrap:focus-within {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .password-wrap input {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .toggle-password {
    width: 58px;
    border: none;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.035);
    color: var(--text-accent);
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .login-btn {
    width: 100%;
    height: 42px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
    color: white;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 10px 28px rgba(59, 130, 246, 0.35);
    transition: transform var(--duration-fast), box-shadow var(--duration-fast);
  }

  .login-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 14px 32px rgba(59, 130, 246, 0.42);
  }

  .login-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }

  input::placeholder {
    color: var(--text-muted);
  }

  .login-footer {
    position: fixed;
    bottom: 22px;
    left: 50%;
    transform: translateX(-50%);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>
