<script>
  import { onMount } from "svelte";
  import { login, authLoading, authError } from "$lib/stores/authStore.js";

  const LOGIN_IMAGE_ASSETS = ["/assets/login1.png", "/assets/SeMAR.png"];

  let username = $state("");
  let password = $state("");
  let showPassword = $state(false);
  let loginAssetsReady = $state(false);

  function preloadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;

      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve({ src, ok });
      };

      img.decoding = "async";
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = src;

      if (img.complete) {
        finish(Boolean(img.naturalWidth));
      }
    });
  }

  onMount(() => {
    let cancelled = false;

    Promise.all(LOGIN_IMAGE_ASSETS.map(preloadImage)).then(() => {
      if (!cancelled) loginAssetsReady = true;
    });

    return () => {
      cancelled = true;
    };
  });

  async function handleLogin(event) {
    event.preventDefault();

    if (!loginAssetsReady || !username.trim() || !password.trim()) {
      return;
    }

    await login(username.trim(), password);
  }
</script>

<section class:assets-ready={loginAssetsReady} class="login-page" aria-busy={!loginAssetsReady}>
  {#if !loginAssetsReady}
    <div class="login-preload-screen" aria-live="polite">
      <div class="login-preload-logo">
        <img src="/assets/SeMAR.png" alt="SeMAR" />
      </div>
      <div class="login-preload-spinner" aria-hidden="true"></div>
      <span>Loading login assets...</span>
    </div>
  {/if}

  <div class="login-shell">
    <aside class="login-panel">
      <div class="login-panel-inner">
        <div class="company-logo" aria-label="SeMAR company logo">
          <img src="/assets/SeMAR.png" alt="SeMAR" />
        </div>
        <div class="brand">
          <div class="brand-icon" aria-hidden="true">
            <span>⚓</span>
          </div>
          <div>
            <p class="eyebrow">Vessel Monitoring System</p>
            <h1>VMS Dashboard</h1>
          </div>
        </div>

        <div class="login-copy">
          <h2>Welcome!</h2>
          <p>Sign in to monitor vessel activity, voyage plans, telemetry, reports, and fleet operations!</p>
        </div>

        <form class="login-card" onsubmit={handleLogin}>
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
            disabled={!loginAssetsReady || $authLoading || !username.trim() || !password.trim()}
          >
            {$authLoading ? "Signing in..." : "Login"}
          </button>
        </form>

        <footer class="login-footer">© 2026 PT Prima Teknik Solusindo</footer>
      </div>
    </aside>

    <aside class="login-visual" aria-label="Vessel wallpaper">
    </aside>
  </div>
</section>

<style>
  .login-page {
    position: relative;
    width: 100%;
    height: 100vh;
    min-height: 680px;
    overflow: hidden;
    background: #07111f;
    box-sizing: border-box;
  }

  .login-preload-screen {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 16px;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background:
      radial-gradient(circle at 42% 30%, rgba(37, 99, 235, 0.18), transparent 28%),
      linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px),
      #07111f;
    background-size: auto, 40px 40px, 40px 40px, auto;
  }

  .login-preload-logo {
    width: min(190px, 56vw);
    display: grid;
    place-items: center;
  }

  .login-preload-logo img {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;
  }

  .login-preload-spinner {
    width: 28px;
    height: 28px;
    border: 2px solid rgba(96, 165, 250, 0.18);
    border-top-color: #60a5fa;
    border-radius: 50%;
    animation: loginPreloadSpin 0.78s linear infinite;
  }

  .login-shell {
    opacity: 0;
    transform: translateY(8px) scale(0.995);
    pointer-events: none;
    transition:
      opacity 0.28s ease,
      transform 0.28s ease;
  }

  .login-page.assets-ready .login-shell {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .login-page::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background: url("/assets/login1.png") right center / auto 100% no-repeat;
    pointer-events: none;
  }

  .login-page::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background:
      linear-gradient(90deg, rgba(7, 17, 31, 0.92) 0%, rgba(7, 17, 31, 0.72) 24%, rgba(7, 17, 31, 0.28) 50%, rgba(7, 17, 31, 0.04) 76%),
      linear-gradient(180deg, rgba(7, 17, 31, 0.02), rgba(7, 17, 31, 0.28));
    pointer-events: none;
  }

  .login-shell {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: minmax(440px, 43vw) minmax(0, 1fr);
    background: transparent;
  }

  .login-panel {
    position: relative;
    z-index: 2;
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 34px;
    background:
      linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px),
      radial-gradient(circle at 12% 12%, rgba(59, 130, 246, 0.2), transparent 32%),
      radial-gradient(circle at 78% 82%, rgba(20, 184, 166, 0.1), transparent 28%),
      linear-gradient(135deg, rgba(7, 17, 31, 0.99) 50%, rgba(13, 23, 40, 0.72) 88%, rgba(17, 27, 44, 0.28) 100%);
    background-size: 40px 40px, 40px 40px, auto, auto, auto;
    box-shadow: none;
    backdrop-filter: blur(2px);
  }

  .login-panel::after {
    content: "";
    position: absolute;
    top: 0;
    right: -340px;
    bottom: 0;
    width: 340px;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      rgba(7, 17, 31, 0.48) 0%,
      rgba(7, 17, 31, 0.28) 44%,
      rgba(7, 17, 31, 0.08) 78%,
      rgba(7, 17, 31, 0) 100%
    );
  }

  .login-panel-inner {
    position: relative;
    z-index: 1;
    width: min(430px, 100%);
    display: grid;
    gap: 24px;
    animation: cardIn 0.5s var(--ease-spring);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-icon {
    width: 54px;
    height: 54px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 32% 20%, rgba(255, 255, 255, 0.25), transparent 32%),
      linear-gradient(135deg, #2563eb, #1d4ed8);
    color: white;
    font-size: 23px;
    box-shadow: 0 12px 28px rgba(37, 99, 235, 0.35);
  }

  .brand-icon span {
    transform: translateY(-1px);
  }

  h1 {
    margin: 0;
    color: #f8fafc;
    font-size: 26px;
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .eyebrow {
    margin: 0 0 5px;
    color: #60a5fa;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.12em;
    line-height: 1;
    text-transform: uppercase;
  }

  .login-copy {
    display: grid;
    gap: 8px;
  }

  .login-copy h2 {
    margin: 0;
    color: #f8fafc;
    font-size: clamp(30px, 4vw, 44px);
    line-height: 0.98;
    font-weight: 900;
    letter-spacing: -0.05em;
  }

  .login-copy p {
    max-width: 360px;
    margin: 0;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 650;
    line-height: 1.55;
  }

  .company-logo {
    width: fit-content;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    justify-self: center;
    justify-content: center;
    margin-inline: auto;
    padding: 0;
    border: 0;
    margin:50px 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  .company-logo img {
    display: block;
    width: min(210px, 52vw);
    height: auto;
    object-fit: contain;
  }

  .login-card {
    display: grid;
    gap: 15px;
    padding: 22px;
    border: 1px solid rgba(148, 163, 184, 0.17);
    border-radius: 22px;
    background: rgba(15, 23, 42, 0.56);
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(22px) saturate(1.25);
  }

  .error-box {
    padding: 10px 12px;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
    background: rgba(127, 29, 29, 0.32);
    color: #fca5a5;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.45;
  }

  .field {
    display: block;
  }

  .field span {
    display: block;
    margin-bottom: 7px;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  input {
    width: 100%;
    height: 46px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 14px;
    padding: 0 14px;
    color: #f8fafc;
    background: rgba(15, 23, 42, 0.74);
    font-size: 13px;
    font-weight: 700;
    outline: none;
    box-sizing: border-box;
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease,
      background 0.16s ease;
  }

  input:focus {
    border-color: #60a5fa;
    background: rgba(15, 23, 42, 0.92);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
  }

  .password-wrap {
    display: grid;
    grid-template-columns: 1fr auto;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 14px;
    overflow: hidden;
    background: rgba(15, 23, 42, 0.74);
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease,
      background 0.16s ease;
  }

  .password-wrap:focus-within {
    border-color: #60a5fa;
    background: rgba(15, 23, 42, 0.92);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
  }

  .password-wrap input {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .toggle-password {
    width: 64px;
    border: none;
    border-left: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(37, 99, 235, 0.1);
    color: #93c5fd;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
    transition:
      background 0.16s ease,
      color 0.16s ease;
  }

  .toggle-password:hover {
    background: rgba(37, 99, 235, 0.2);
    color: #dbeafe;
  }

  .login-btn {
    width: 100%;
    height: 46px;
    border: none;
    border-radius: 14px;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
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
    color: #64748b;
  }

  .login-footer {
    color: #64748b;
    font-size: 11px;
    font-weight: 650;
  }

  .login-visual {
    position: relative;
    min-width: 0;
    overflow: hidden;
    background: transparent;
  }

  .login-visual::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(7, 17, 31, 0.02), rgba(7, 17, 31, 0.22));
    pointer-events: none;
  }

  .login-visual::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 72% 22%, rgba(255, 255, 255, 0.16), transparent 24%);
    mix-blend-mode: screen;
    pointer-events: none;
  }

  .visual-overlay {
    position: absolute;
    right: 28px;
    bottom: 28px;
    max-width: 340px;
    display: grid;
    gap: 8px;
    padding: 18px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 22px;
    background: rgba(7, 17, 31, 0.34);
    color: #f8fafc;
    box-shadow: 0 24px 54px rgba(7, 17, 31, 0.28);
    backdrop-filter: blur(16px) saturate(1.18);
  }

  .visual-overlay span {
    color: #bfdbfe;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.12em;
    line-height: 1;
    text-transform: uppercase;
  }

  .visual-overlay strong {
    font-size: 17px;
    font-weight: 850;
    line-height: 1.25;
  }

  @keyframes cardIn {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes loginPreloadSpin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 980px) {
    .login-page {
      height: auto;
      min-height: 100vh;
    }

    .login-shell {
      min-height: 100vh;
      grid-template-columns: 1fr;
      background: transparent;
    }

    .login-panel {
      min-height: 100vh;
      padding: 24px;
      background:
        linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px),
        linear-gradient(135deg, rgba(7, 17, 31, 0.9), rgba(15, 23, 42, 0.68));
      background-size: 40px 40px, 40px 40px, auto;
    }

    .login-panel::after,
    .login-visual {
      display: none;
    }
  }

  @media (max-width: 520px) {
    .login-panel {
      padding: 18px;
    }

    .login-panel-inner {
      gap: 20px;
    }

    .login-card {
      padding: 18px;
      border-radius: 18px;
    }

    .brand-icon {
      width: 48px;
      height: 48px;
      border-radius: 14px;
    }
  }
</style>
