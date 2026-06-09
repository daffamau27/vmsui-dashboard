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
        <p>Sign in to continue</p>
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

<style>
  .login-page {
    width: 100%;
    height: 100vh;
    display: grid;
    place-items: center;
    padding: 16px;
    background:
      radial-gradient(circle at top left, rgba(37, 99, 235, 0.14), transparent 34%),
      linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    box-sizing: border-box;
  }

  .login-card {
    width: min(380px, 100%);
    padding: 22px;
    border-radius: 18px;
    background: #ffffff;
    border: 1px solid #dbe4ef;
    box-shadow:
      0 18px 45px rgba(15, 23, 42, 0.14),
      0 2px 10px rgba(15, 23, 42, 0.06);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .brand-icon {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: #2563eb;
    color: white;
    font-size: 20px;
    box-shadow: 0 8px 20px rgba(37, 99, 235, 0.25);
  }

  h1 {
    margin: 0;
    color: #0f172a;
    font-size: 22px;
    line-height: 1.1;
    font-weight: 900;
  }

  p {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .error-box {
    margin-bottom: 14px;
    padding: 10px 12px;
    border: 1px solid #fecaca;
    border-radius: 12px;
    background: #fef2f2;
    color: #b91c1c;
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
    color: #334155;
    font-size: 12px;
    font-weight: 900;
  }

  input {
    width: 100%;
    height: 42px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 0 12px;
    color: #0f172a;
    font-size: 13px;
    font-weight: 700;
    outline: none;
    box-sizing: border-box;
  }

  input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .password-wrap {
    display: grid;
    grid-template-columns: 1fr auto;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    overflow: hidden;
    background: #ffffff;
  }

  .password-wrap:focus-within {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .password-wrap input {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .toggle-password {
    width: 58px;
    border: none;
    border-left: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #2563eb;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .login-btn {
    width: 100%;
    height: 42px;
    border: none;
    border-radius: 12px;
    background: #2563eb;
    color: white;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 10px 22px rgba(37, 99, 235, 0.24);
  }

  .login-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .login-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }
</style>