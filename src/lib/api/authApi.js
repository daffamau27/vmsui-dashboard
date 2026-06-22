const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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

  const { rawResponse, ...fetchOptions } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
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

    const isAuthEndpoint =
      path.includes("/auth/") ||
      path.includes("/auth/refresh");

    if (response.status === 401 && !isAuthEndpoint) {
      redirectToLogin();
      throw createApiError(
        "Sesi login telah berakhir. Silakan login kembali.",
        response.status,
        data
      );
    }

    if (response.status === 403) {
      throw createApiError(
        message || "Anda tidak memiliki akses ke fitur ini.",
        response.status,
        data
      );
    }

    throw createApiError(message, response.status, data);
  }

  if (rawResponse) {
    return response;
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
    throw new Error("Refresh token tidak tersedia.");
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
  return await apiRequest("/users/my-vessels", {
    method: "GET"
  });
}

export async function getMyAssetsApi() {
  return await apiRequest("/users/my-assets", {
    method: "GET"
  });
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

  const baseUrl =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_BACKEND_BASE_URL ||
    "";

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
        message || "Anda tidak memiliki akses untuk mengunduh file ini.",
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