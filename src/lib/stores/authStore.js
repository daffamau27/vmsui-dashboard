import { writable, get } from "svelte/store";
import { goto } from "$app/navigation";
import {
  loginApi,
  logoutApi,
  getCurrentUserApi,
  clearAuthStorage,
  getAccessToken,
  AUTH_SESSION_EXPIRES_AT_KEY
} from "$lib/api/authApi.js";

export const currentUser = writable(null);
export const isLoggedIn = writable(false);
export const authLoading = writable(false);
export const authReady = writable(false);
export const authError = writable("");

const AUTH_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
const AUTH_ACTIVITY_WRITE_THROTTLE_MS = 1000;
const AUTH_ACTIVITY_EVENTS = ["click", "keydown", "pointerdown", "scroll", "wheel", "touchstart"];

let initPromise = null;
let sessionTimeoutId = null;
let activityListenersAttached = false;
let lastActivityRecordedAt = 0;

function clearSessionTimeout() {
  if (sessionTimeoutId) {
    clearTimeout(sessionTimeoutId);
    sessionTimeoutId = null;
  }
}

function getSessionExpiresAt() {
  if (typeof localStorage === "undefined") return null;

  const raw = Number(localStorage.getItem(AUTH_SESSION_EXPIRES_AT_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function scheduleSessionTimeout(expiresAt = getSessionExpiresAt()) {
  clearSessionTimeout();

  if (!expiresAt || typeof window === "undefined") return;

  const remainingMs = Math.max(0, expiresAt - Date.now());

  sessionTimeoutId = setTimeout(() => {
    authError.set("Session expired. Please log in again.");
    logout({ preserveAuthError: true });
  }, remainingMs);
}

function setSessionExpiresAt(expiresAt = Date.now() + AUTH_INACTIVITY_TIMEOUT_MS) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(AUTH_SESSION_EXPIRES_AT_KEY, String(expiresAt));
  }

  scheduleSessionTimeout(expiresAt);
  return expiresAt;
}

function isSessionExpired(expiresAt = getSessionExpiresAt()) {
  return Boolean(expiresAt && Date.now() >= expiresAt);
}

function recordUserActivity({ force = false } = {}) {
  if (typeof localStorage === "undefined") return;
  if (!getAccessToken()) return;

  const now = Date.now();
  const currentExpiresAt = getSessionExpiresAt();

  if (currentExpiresAt && now >= currentExpiresAt) {
    authError.set("Session expired. Please log in again.");
    logout({ preserveAuthError: true });
    return;
  }

  const shouldThrottle =
    !force &&
    now - lastActivityRecordedAt < AUTH_ACTIVITY_WRITE_THROTTLE_MS &&
    (!currentExpiresAt || currentExpiresAt - now > AUTH_ACTIVITY_WRITE_THROTTLE_MS);

  if (shouldThrottle) return;

  lastActivityRecordedAt = now;
  setSessionExpiresAt(now + AUTH_INACTIVITY_TIMEOUT_MS);
}

function handleUserActivity() {
  recordUserActivity();
}

function startActivityTracking() {
  if (activityListenersAttached || typeof window === "undefined") return;

  AUTH_ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, handleUserActivity, {
      passive: true,
      capture: true
    });
  });

  activityListenersAttached = true;
}

function stopActivityTracking() {
  if (!activityListenersAttached || typeof window === "undefined") return;

  AUTH_ACTIVITY_EVENTS.forEach((eventName) => {
    window.removeEventListener(eventName, handleUserActivity, {
      capture: true
    });
  });

  activityListenersAttached = false;
  lastActivityRecordedAt = 0;
}

function startInactivitySession({ resetExpiry = false } = {}) {
  startActivityTracking();

  if (resetExpiry || !getSessionExpiresAt()) {
    recordUserActivity({ force: true });
    return;
  }

  scheduleSessionTimeout(getSessionExpiresAt());
}

function normalizeUser(response) {
  return response?.data || response?.user || response?.currentUser || response || null;
}

function loadCachedUser() {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem("currentUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function loadCurrentUserInBackground() {
  try {
    const userResponse = await getCurrentUserApi();
    const user = normalizeUser(userResponse);

    if (user) {
      currentUser.set(user);
      localStorage.setItem("currentUser", JSON.stringify(user));
    }

    return user;
  } catch (error) {
    console.warn("[CURRENT_USER_BACKGROUND_ERROR]", error);
    return null;
  }
}

export async function login(username, password) {
  authLoading.set(true);
  authError.set("");

  try {
    const loginResponse = await loginApi({ username, password });

    console.log("[LOGIN_RESPONSE]", loginResponse);
    console.log("[ACCESS_TOKEN_AFTER_LOGIN]", getAccessToken());

    const token = getAccessToken();

    if (!token) {
      throw new Error("Login berhasil, tetapi access token tidak ditemukan pada response API.");
    }

    startInactivitySession({ resetExpiry: true });

    isLoggedIn.set(true);
    authReady.set(true);

    await goto("/app");

    loadCurrentUserInBackground();
  } catch (error) {
    console.error("[LOGIN_ERROR]", error);

    clearAuthStorage();
    clearSessionTimeout();
    stopActivityTracking();
    currentUser.set(null);
    isLoggedIn.set(false);
    authReady.set(true);

    authError.set(error?.message || "Login gagal.");
    throw error;
  } finally {
    authLoading.set(false);
  }
}

export async function logout({ preserveAuthError = false } = {}) {
  clearSessionTimeout();
  stopActivityTracking();
  authLoading.set(true);
  if (!preserveAuthError) {
    authError.set("");
  }

  try {
    await logoutApi();
  } catch (error) {
    console.warn("[LOGOUT_ERROR]", error);
  } finally {
    clearAuthStorage();

    currentUser.set(null);
    isLoggedIn.set(false);
    authReady.set(true);
    authLoading.set(false);

    await goto("/");
  }
}

export async function initAuth() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    authLoading.set(true);
    authError.set("");

    try {
      const token = getAccessToken();

      console.log("[INIT_AUTH_TOKEN]", token);

      if (!token) {
        clearAuthStorage();
        clearSessionTimeout();
        stopActivityTracking();
        currentUser.set(null);
        isLoggedIn.set(false);
        return;
      }

      let sessionExpiresAt = getSessionExpiresAt();

      if (!sessionExpiresAt) {
        sessionExpiresAt = setSessionExpiresAt();
      }

      if (isSessionExpired(sessionExpiresAt)) {
        clearAuthStorage();
        clearSessionTimeout();
        stopActivityTracking();
        currentUser.set(null);
        isLoggedIn.set(false);
        authError.set("Session expired. Please log in again.");
        return;
      }

      const cachedUser = loadCachedUser();

      if (cachedUser) {
        currentUser.set(cachedUser);
      }

      isLoggedIn.set(true);
      startInactivitySession({ resetExpiry: true });

      loadCurrentUserInBackground();
    } catch (error) {
      console.warn("[INIT_AUTH_ERROR]", error);

      clearAuthStorage();
      clearSessionTimeout();
      stopActivityTracking();
      currentUser.set(null);
      isLoggedIn.set(false);
    } finally {
      authLoading.set(false);
      authReady.set(true);
    }
  })();

  return initPromise;
}

export function resetAuthInit() {
  initPromise = null;
}

export function getAuthState() {
  return {
    user: get(currentUser),
    loggedIn: get(isLoggedIn),
    ready: get(authReady)
  };
}
