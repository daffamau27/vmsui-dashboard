import { sortByAlpha } from "$lib/utils/alphaSort.js";
import { getApiBaseUrl } from "$lib/runtimeConfig.js";

export const AUTH_SESSION_EXPIRES_AT_KEY = "authSessionExpiresAt";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createApiError(message, status, data = null) {
  const error = new Error(message);
  error.status = status;
  error.data = data;
  return error;
}

export function getAccessToken() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function getRefreshToken() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem("refreshToken");
}

export function getAuthSessionExpiresAt() {
  if (typeof localStorage === "undefined") return null;

  const raw = Number(localStorage.getItem(AUTH_SESSION_EXPIRES_AT_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function isAuthSessionExpired() {
  const expiresAt = getAuthSessionExpiresAt();
  return Boolean(expiresAt && Date.now() >= expiresAt);
}

export function saveAuthTokens(data) {
  const accessToken =
    data?.accessToken ||
    data?.token ||
    data?.jwt ||
    data?.data?.accessToken ||
    data?.data?.token ||
    null;

  const refreshToken =
    data?.refreshToken ||
    data?.data?.refreshToken ||
    null;

  if (accessToken) {
    localStorage.setItem("accessToken", accessToken);
  }

  if (refreshToken) {
    localStorage.setItem("refreshToken", refreshToken);
  }

  return { accessToken, refreshToken };
}

export function clearAuthStorage() {
  if (typeof localStorage === "undefined") return;

  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("currentUser");
  localStorage.removeItem(AUTH_SESSION_EXPIRES_AT_KEY);
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;

  clearAuthStorage();

  const currentPath = window.location.pathname;

  if (currentPath !== "/") {
    window.location.href = "/";
  }
}

export async function apiRequest(path, options = {}) {
  const token = getAccessToken();
  const apiBaseUrl = await getApiBaseUrl();
  const isAuthEndpoint =
    path.includes("/auth/") ||
    path.includes("/auth/refresh");

  if (token && !isAuthEndpoint && isAuthSessionExpired()) {
    redirectToLogin();
    throw createApiError(
      "The login session has expired. Please log in again.",
      401,
      null
    );
  }

  const headers = {
    ...(options.headers || {})
  };

  const isFormData = options.body instanceof FormData;

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = token.startsWith("Bearer ")
      ? token
      : `Bearer ${token}`;
  }

  const { rawResponse, responseType, ...fetchOptions } = options;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...fetchOptions,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    const data = safeJsonParse(text);

    const message =
      data?.message ||
      data?.error ||
      text ||
      `Request failed with status ${response.status}`;

    if (response.status === 401 && !isAuthEndpoint) {
      redirectToLogin();
      throw createApiError(
        "The login session has expired. Please log in again.",
        response.status,
        data
      );
    }

    if (response.status === 403) {
      throw createApiError(
        message || "You do not have access to this feature.",
        response.status,
        data
      );
    }

    throw createApiError(message, response.status, data);
  }

  if (rawResponse) {
    return response;
  }

  if (responseType === "blob") {
    return await response.blob();
  }

  if (responseType === "arrayBuffer") {
    return await response.arrayBuffer();
  }

  if (responseType === "text") {
    return await response.text();
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  return safeJsonParse(text);
}

export async function loginApi({ username, password }) {
  const response = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  saveAuthTokens(response);

  return response;
}

export async function logoutApi() {
  try {
    await apiRequest("/auth/logout", {
      method: "POST"
    });
  } finally {
    clearAuthStorage();
  }
}

export async function refreshTokenApi() {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error("Refresh token is not available.");
  }

  const response = await apiRequest("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });

  saveAuthTokens(response);

  return response;
}

export async function getCurrentUserApi() {
  return await apiRequest("/users/current-user", {
    method: "GET"
  });
}

export async function getMyVesselsApi() {
  const response = await apiRequest("/users/my-vessels", {
    method: "GET"
  });

  if (Array.isArray(response?.data)) {
    return {
      ...response,
      data: sortByAlpha(response.data, getVesselSortName, getVesselCompanyName)
    };
  }

  return response;
}

export async function getMyAssetsApi() {
  const response = await apiRequest("/users/my-assets", {
    method: "GET"
  });

  if (Array.isArray(response?.data)) {
    return {
      ...response,
      data: sortByAlpha(response.data, getAssetSortName, getAssetSortType)
    };
  }

  return response;
}

export async function updateCurrentUserApi(payload) {
  return await apiRequest("/users/current-user", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function changePasswordApi(payload) {
  return await apiRequest("/users/change-password", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function downloadApiFile(path, fileName = "download.xlsx") {
  const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
  const baseUrl = await getApiBaseUrl();

  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: token
        ? token.startsWith("Bearer ")
          ? token
          : `Bearer ${token}`
        : ""
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const data = safeJsonParse(text);

    const message =
      data?.message ||
      data?.error ||
      text ||
      `Download gagal. Status ${response.status}`;

    if (response.status === 401) {
      redirectToLogin();
      throw createApiError(
        "Sesi login telah berakhir. Silakan login kembali.",
        response.status,
        data
      );
    }

    if (response.status === 403) {
      throw createApiError(
        message || "You do not have access to download this file.",
        response.status,
        data
      );
    }

    throw createApiError(message, response.status, data);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}

function getVesselSortName(item) {
  return item?.vesselName || item?.vessel_name || item?.name || item?.deviceName || item?.deviceId || "";
}

function getVesselCompanyName(item) {
  return item?.companyName || item?.company_name || item?.company?.name || item?.company?.companyName || "";
}

function getAssetSortName(item) {
  return item?.assetName || item?.asset_name || item?.thingsboardName || item?.name || item?.assetId || "";
}

function getAssetSortType(item) {
  return item?.assetType || item?.asset_type || item?.type || "";
}
