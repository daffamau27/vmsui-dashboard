import { writable, get } from "svelte/store";
import { goto } from "$app/navigation";
import {
  loginApi,
  logoutApi,
  getCurrentUserApi,
  clearAuthStorage,
  getAccessToken
} from "$lib/api/authApi.js";

export const currentUser = writable(null);
export const isLoggedIn = writable(false);
export const authLoading = writable(false);
export const authReady = writable(false);
export const authError = writable("");

let initPromise = null;

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

    isLoggedIn.set(true);
    authReady.set(true);

    await goto("/app");

    loadCurrentUserInBackground();
  } catch (error) {
    console.error("[LOGIN_ERROR]", error);

    clearAuthStorage();
    currentUser.set(null);
    isLoggedIn.set(false);
    authReady.set(true);

    authError.set(error?.message || "Login gagal.");
    throw error;
  } finally {
    authLoading.set(false);
  }
}

export async function logout() {
  authLoading.set(true);
  authError.set("");

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
        currentUser.set(null);
        isLoggedIn.set(false);
        return;
      }

      const cachedUser = loadCachedUser();

      if (cachedUser) {
        currentUser.set(cachedUser);
      }

      isLoggedIn.set(true);

      loadCurrentUserInBackground();
    } catch (error) {
      console.warn("[INIT_AUTH_ERROR]", error);

      clearAuthStorage();
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