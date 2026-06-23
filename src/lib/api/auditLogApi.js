import { apiRequest } from "$lib/api/authApi.js";

export async function getMyAuditLogs({ page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });

  const response = await apiRequest(`/audit-logs/my?${params.toString()}`, {
    method: "GET"
  });

  return response?.data || {
    items: [],
    pagination: {
      page,
      pageSize,
      totalItems: 0,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    }
  };
}

export async function getAuditLogDetail(id) {
  if (!id) {
    throw new Error("Invalid audit log ID.");
  }

  const response = await apiRequest(`/audit-logs/${id}`, {
    method: "GET"
  });

  return response?.data || null;
}

export async function exportMyAuditLogsCsv({ startDate, endDate } = {}) {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const params = new URLSearchParams();

  if (startDate) params.set("startDate", String(startDate));
  if (endDate) params.set("endDate", String(endDate));

  const token =
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("_token") ||
    localStorage.getItem("jwt_token") ||
    localStorage.getItem("token");

  const basicAuth =
    localStorage.getItem("basicAuth") ||
    localStorage.getItem("basic_auth") ||
    localStorage.getItem("authorization") ||
    localStorage.getItem("Authorization");

  let authorization = "";

  if (basicAuth) {
    authorization = basicAuth.startsWith("Basic ")
      ? basicAuth
      : `Basic ${basicAuth}`;
  } else if (token) {
    authorization = token.startsWith("Bearer ")
      ? token
      : `Bearer ${token}`;
  }

  if (!authorization) {
    throw new Error("Token not found. Please log in again.");
  }

  const query = params.toString();
  const url = `${API_BASE_URL}/audit-logs/my/export-csv${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/csv",
      Authorization: authorization
    }
  });

  if (!response.ok) {
    let message = "Failed to export audit log to CSV.";

    try {
      const text = await response.text();
      if (text) message = text;
    } catch {
      // ignore
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);

  const fileName =
    response.headers
      .get("content-disposition")
      ?.match(/filename="?([^"]+)"?/)?.[1] || `my_audit_logs_${Date.now()}.csv`;

  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(downloadUrl);
}