// Bambuddy Mobile API Client
// Ported from the web frontend's client.ts — same endpoints, adapted for React Native
// Uses the server URL from ServerStore instead of relative paths

import * as Keychain from 'react-native-keychain';
import type {
  AdvancedAuthStatus,
  BackupCodesResponse,
  CalibrationResult,
  DiscoveredPrinter,
  DiscoveryInfo,
  DiscoveryStatus,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  CameraDiagnoseResult,
  InventorySpool,
  LDAPStatus,
  LDAPTestResponse,
  LinkedSpoolsMap,
  LoginResponse,
  NotificationTestRequest,
  NotificationTestResponse,
  OIDCLink,
  OIDCProvider,
  OIDCProviderCreate,
  PlateDetectionStatus,
  PrintBatch,
  PrintBatchUngroupResponse,
  Printer,
  PrinterDiagnosticResult,
  PrinterStatus,
  PrinterSensorHistoryResponse,
  PrintQueueBulkUpdate,
  PrintQueueBulkUpdateResponse,
  PrintQueueItem,
  PrintQueueItemCreate,
  PrintQueueItemUpdate,
  MaintenanceStatus,
  MaintenanceType,
  MaintenanceTypeCreate,
  PrinterMaintenanceOverview,
  SMTPSettings,
  SmartPlug,
  SmartPlugCreate,
  SmartPlugStatus,
  SmartPlugTestResult,
  SmartPlugUpdate,
  SlotPresetMapping,
  SpoolAssignment,
  SpoolKProfile,
  SpoolUsageRecord,
  SpoolmanStatus,
  SubnetScanStatus,
  TestSMTPRequest,
  TestSMTPResponse,
  TOTPEnableResponse,
  TOTPSetupResponse,
  TwoFAStatus,
  UnifiedPresetsResponse,
  UnlinkedSpool,
} from '@/types/api';
import { apiUrl, useServerStore } from './server';

const AUTH_TOKEN_KEY = 'bambuddy-auth-token';

// --- Auth Token Management ---

let authToken: string | null = null;
let tokenLoaded = false;

export async function loadAuthToken(): Promise<string | null> {
  if (tokenLoaded) return authToken;
  try {
    const creds = await Keychain.getGenericPassword({
      service: AUTH_TOKEN_KEY,
    });
    authToken = creds ? creds.password : null;
  } catch {
    authToken = null;
  }
  tokenLoaded = true;
  return authToken;
}

export async function setAuthToken(token: string | null): Promise<void> {
  authToken = token;
  try {
    if (token) {
      await Keychain.setGenericPassword(AUTH_TOKEN_KEY, token, {
        service: AUTH_TOKEN_KEY,
      });
    } else {
      await Keychain.resetGenericPassword({ service: AUTH_TOKEN_KEY });
    }
  } catch {
    // Keychain unavailable — token stays in memory only
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

// --- Stream Token Management ---
// Thumbnails and camera endpoints use a separate stream token via ?token= query param.
let streamToken: string | null = null;

export function getStreamToken(): string | null {
  return streamToken;
}

export function setStreamToken(token: string | null): void {
  streamToken = token;
}

export function withStreamToken(url: string): string {
  if (!streamToken) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(streamToken)}`;
}

// --- API Error ---

export class ApiError extends Error {
  status: number;
  code: string | null;
  detail: Record<string, unknown> | null;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    detail: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// --- Core Request Function ---

const USER_SAFE_MESSAGES: Record<number, string> = {
  400: 'Invalid request',
  403: 'Permission denied',
  404: 'Not found',
  408: 'Request timed out',
  429: 'Too many requests — please wait',
  500: 'Server error',
  502: 'Server unavailable',
  503: 'Server temporarily unavailable',
  504: 'Server timed out',
};

/** Strip internal details (file paths, stack traces) from server error messages. */
function sanitizeErrorMessage(raw: string, status: number): string {
  if (!raw || raw === `HTTP ${status}`) {
    return USER_SAFE_MESSAGES[status] ?? `Request failed (${status})`;
  }
  // If message looks like it contains file paths or stack traces, replace it
  if (/\/[a-z_/]+\.(py|js|ts|go|rs|java)/i.test(raw) || /Traceback|stacktrace|at\s+\S+\(/i.test(raw)) {
    return USER_SAFE_MESSAGES[status] ?? `Request failed (${status})`;
  }
  // Cap length to avoid giant error blobs in toasts
  if (raw.length > 200) {
    return raw.slice(0, 197) + '…';
  }
  return raw;
}

function getServerUrl(): string {
  const url = useServerStore.getState().serverUrl;
  if (!url) throw new Error('Server URL not configured');
  return url;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const serverUrl = getServerUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(apiUrl(serverUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = error.detail;
    let message: string;
    let code: string | null = null;

    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      const joined = detail
        .map((e: { msg?: string }) =>
          (e.msg ?? '').replace(/^Value error,\s*/i, ''),
        )
        .filter(Boolean)
        .join('; ');
      message = joined || JSON.stringify(detail) || `HTTP ${response.status}`;
    } else if (detail && typeof detail === 'object') {
      code = typeof detail.code === 'string' ? detail.code : null;
      message =
        typeof detail.message === 'string'
          ? detail.message
          : `HTTP ${response.status}`;
    } else {
      message = `HTTP ${response.status}`;
    }

    const structuredDetail =
      detail && typeof detail === 'object' && !Array.isArray(detail)
        ? (detail as Record<string, unknown>)
        : null;

    if (response.status === 401) {
      const invalidMessages = [
        'Could not validate credentials',
        'Token has expired',
        'User not found or inactive',
        'Invalid API key',
        'API key has expired',
      ];
      if (invalidMessages.some(m => message.includes(m))) {
        await setAuthToken(null);
      }
    }

    // Sanitize message for user-facing toasts — strip paths, stack traces, internal details
    const sanitized = sanitizeErrorMessage(message, response.status);

    throw new ApiError(sanitized, response.status, code, structuredDetail);
  }

  const contentLength = response.headers.get('content-length');
  if (response.status === 204 || contentLength === '0') {
    return undefined as unknown as T;
  }

  return await response.json();
}

async function requestBlob(
  endpoint: string,
  options: RequestInit = {},
): Promise<Blob> {
  const serverUrl = getServerUrl();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(apiUrl(serverUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(`HTTP ${response.status}`, response.status);
  }

  return response.blob();
}

async function requestText(
  endpoint: string,
  options: RequestInit = {},
): Promise<string> {
  const serverUrl = getServerUrl();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(apiUrl(serverUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = error?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : detail?.message || `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return response.text();
}

async function uploadFile<T>(
  endpoint: string,
  file: { uri: string; name: string; type: string },
  extraFields?: Record<string, string>,
): Promise<T> {
  const serverUrl = getServerUrl();
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);

  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      form.append(key, value);
    }
  }

  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(apiUrl(serverUrl, endpoint), {
    method: 'POST',
    headers,
    body: form,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = error?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : detail?.message || `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return response.json();
}

async function uploadFileWithProgress<T>(
  endpoint: string,
  file: { uri: string; name: string; type: string },
  onProgress: (progress: number) => void,
  extraFields?: Record<string, string>,
): Promise<T> {
  const serverUrl = getServerUrl();

  return new Promise<T>((resolve, reject) => {
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob);

    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        form.append(key, value);
      }
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(serverUrl, endpoint));

    if (authToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onerror = () => {
      reject(new ApiError('Network error', 0));
    };

    xhr.onload = () => {
      const status = xhr.status;
      const responseText = xhr.responseText;

      if (status >= 200 && status < 300) {
        if (!responseText) {
          resolve({} as T);
          return;
        }
        try {
          resolve(JSON.parse(responseText) as T);
        } catch {
          resolve({} as T);
        }
        return;
      }

      let errorData: Record<string, unknown> = {};
      try {
        errorData = responseText ? JSON.parse(responseText) : {};
      } catch {
        errorData = {};
      }

      const detail = errorData?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : typeof detail === 'object' && detail && 'message' in detail
            ? String((detail as { message?: string }).message ?? `HTTP ${status}`)
            : `HTTP ${status}`;

      reject(new ApiError(message, status));
    };

    xhr.send(form);
  });
}

async function requestWithFallback<T>(
  primary: { endpoint: string; options?: RequestInit },
  fallback: { endpoint: string; options?: RequestInit },
): Promise<T> {
  try {
    return await request<T>(primary.endpoint, primary.options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501)) {
      return request<T>(fallback.endpoint, fallback.options);
    }
    throw error;
  }
}

async function requestTextWithFallback(
  primary: { endpoint: string; options?: RequestInit },
  fallback: { endpoint: string; options?: RequestInit },
): Promise<string> {
  try {
    return await requestText(primary.endpoint, primary.options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501)) {
      return requestText(fallback.endpoint, fallback.options);
    }
    throw error;
  }
}

// --- API Methods ---
// Organized by domain, matching the web frontend's api object

export const api = {
  // ── Auth ──────────────────────────────────────────
  getAuthStatus: () =>
    request<{ auth_enabled: boolean; requires_setup: boolean }>('/auth/status'),

  login: (data: { username: string; password: string }) =>
    request<{
      access_token: string;
      token_type: string;
      user: {
        id: number;
        username: string;
        is_admin: boolean;
        groups: { id: number; name: string; permissions: string[] }[];
      };
      requires_2fa?: boolean;
      pre_auth_token?: string;
      available_methods?: string[];
    }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  verify2FA: (data: {
    pre_auth_token: string;
    code: string;
    method?: string;
  }) =>
    request<{
      access_token: string;
      token_type: string;
      user: {
        id: number;
        username: string;
        is_admin: boolean;
        groups: { id: number; name: string; permissions: string[] }[];
      };
    }>('/auth/2fa/verify', { method: 'POST', body: JSON.stringify(data) }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  getCurrentUser: () =>
    request<{
      id: number;
      username: string;
      is_admin: boolean;
      email?: string | null;
      groups: { id: number; name: string; permissions: string[] }[];
    }>('/auth/me'),

  setupAuth: (data: { username: string; password: string }) =>
    request<{ access_token: string; token_type: string }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getWebSocketToken: () =>
    request<{ token: string }>('/auth/ws-token', { method: 'POST' }),

  get2FAStatus: () => request<TwoFAStatus>('/auth/2fa/status'),

  getAdvancedAuthStatus: () =>
    request<AdvancedAuthStatus>('/auth/advanced-auth/status'),

  getLDAPStatus: () => request<LDAPStatus>('/auth/ldap/status'),

  testSMTP: (data: TestSMTPRequest) =>
    request<TestSMTPResponse>('/auth/smtp/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSMTPSettings: () => request<SMTPSettings | null>('/auth/smtp'),

  saveSMTPSettings: (data: SMTPSettings) =>
    request<{ message: string }>('/auth/smtp', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  enableAdvancedAuth: () =>
    request<{ message: string; advanced_auth_enabled: boolean }>(
      '/auth/advanced-auth/enable',
      { method: 'POST' },
    ),

  disableAdvancedAuth: () =>
    request<{ message: string; advanced_auth_enabled: boolean }>(
      '/auth/advanced-auth/disable',
      { method: 'POST' },
    ),

  testLDAP: () =>
    request<LDAPTestResponse>('/auth/ldap/test', {
      method: 'POST',
    }),

  searchLDAPDirectory: (query: string) =>
    request<Record<string, unknown>[]>(
      `/auth/ldap/search?q=${encodeURIComponent(query)}`,
    ),

  provisionLDAPUser: (username: string) =>
    request<Record<string, unknown>>('/auth/ldap/provision', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  forgotPassword: (data: ForgotPasswordRequest) =>
    request<ForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  forgotPasswordConfirm: (token: string, newPassword: string) =>
    request<ForgotPasswordResponse>('/auth/forgot-password/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  resetUserPassword: (data: { user_id: number }) =>
    request<Record<string, unknown>>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  setupTOTP: () =>
    request<TOTPSetupResponse>('/auth/2fa/totp/setup', { method: 'POST' }),

  enableTOTP: (code: string) =>
    request<TOTPEnableResponse>('/auth/2fa/totp/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  disableTOTP: (code: string) =>
    request<{ message: string }>('/auth/2fa/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  regenerateBackupCodes: (code: string) =>
    request<BackupCodesResponse>('/auth/2fa/totp/regenerate-backup-codes', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  enableEmailOTP: () =>
    request<{ message: string; setup_token: string }>(
      '/auth/2fa/email/enable',
      { method: 'POST' },
    ),

  confirmEnableEmailOTP: (setupToken: string, code: string) =>
    request<{ message: string }>('/auth/2fa/email/enable/confirm', {
      method: 'POST',
      body: JSON.stringify({ setup_token: setupToken, code }),
    }),

  disableEmailOTP: (password: string) =>
    request<{ message: string }>('/auth/2fa/email/disable', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  getOIDCProviders: () => request<OIDCProvider[]>('/auth/oidc/providers'),

  getOIDCProvidersAll: () => request<OIDCProvider[]>('/auth/oidc/providers/all'),

  createOIDCProvider: (data: OIDCProviderCreate) =>
    request<OIDCProvider>('/auth/oidc/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateOIDCProvider: (id: number, data: Partial<OIDCProviderCreate>) =>
    request<OIDCProvider>(`/auth/oidc/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteOIDCProvider: (id: number) =>
    request<{ message: string }>(`/auth/oidc/providers/${id}`, {
      method: 'DELETE',
    }),

  getOIDCProviderIconUrl: (id: number): string => {
    const serverUrl = getServerUrl();
    return `${serverUrl}/api/v1/auth/oidc/providers/${id}/icon`;
  },

  deleteOIDCProviderIcon: (id: number) =>
    request<void>(`/auth/oidc/providers/${id}/icon`, { method: 'DELETE' }),

  refreshOIDCProviderIcon: (id: number) =>
    request<OIDCProvider>(`/auth/oidc/providers/${id}/icon/refresh`, {
      method: 'POST',
    }),

  getOIDCAuthorizeUrl: (providerId: number) =>
    request<{ auth_url: string }>(`/auth/oidc/authorize/${providerId}`),

  exchangeOIDCToken: (oidcToken: string) =>
    request<LoginResponse>('/auth/oidc/exchange', {
      method: 'POST',
      body: JSON.stringify({ oidc_token: oidcToken }),
    }),

  getOIDCLinks: () => request<OIDCLink[]>('/auth/oidc/links'),

  deleteOIDCLink: (providerId: number) =>
    request<{ message: string }>(`/auth/oidc/links/${providerId}`, {
      method: 'DELETE',
    }),

  getUserEmailPreferences: () =>
    request<Record<string, unknown>>('/user-notifications/preferences'),

  updateUserEmailPreferences: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/user-notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── Users & Groups ───────────────────────────────
  getUsers: () =>
    request<
      {
        id: number;
        username: string;
        is_admin: boolean;
        email?: string | null;
        groups: { id: number; name: string }[];
        created_at: string;
        last_login?: string | null;
      }[]
    >('/users/'),

  getUser: (id: number) => request<Record<string, unknown>>(`/users/${id}`),

  createUser: (data: {
    username: string;
    password?: string;
    email?: string;
    group_ids?: number[];
  }) =>
    request<Record<string, unknown>>('/users/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteUser: (id: number) =>
    request<void>(`/users/${id}`, { method: 'DELETE' }),

  getGroups: () =>
    request<
      { id: number; name: string; is_default: boolean; description?: string }[]
    >('/groups/'),

  getGroup: (id: number) =>
    request<{
      id: number;
      name: string;
      is_default: boolean;
      description?: string;
      permissions: string[];
      users: { id: number; username: string }[];
    }>(`/groups/${id}`),

  createGroup: (data: {
    name: string;
    description?: string;
    permissions: string[];
  }) =>
    request<Record<string, unknown>>('/groups/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateGroup: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: number) =>
    request<void>(`/groups/${id}`, { method: 'DELETE' }),

  getPermissions: () =>
    request<{ permissions: string[] }>('/groups/permissions'),

  // ── Printers ─────────────────────────────────────
  getPrinters: () => request<Record<string, unknown>[]>('/printers/'),

  getPrinter: (id: number) =>
    request<Printer>(`/printers/${id}`),

  createPrinter: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/printers/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePrinter: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/printers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deletePrinter: (id: number) =>
    request<void>(`/printers/${id}`, { method: 'DELETE' }),

  getPrinterStatus: (id: number) =>
    request<PrinterStatus>(`/printers/${id}/status`),

  refreshPrinterStatus: (id: number) =>
    request<Record<string, unknown>>(`/printers/${id}/refresh-status`, {
      method: 'POST',
    }),

  connectPrinter: (id: number) =>
    request<void>(`/printers/${id}/connect`, { method: 'POST' }),

  disconnectPrinter: (id: number) =>
    request<void>(`/printers/${id}/disconnect`, { method: 'POST' }),

  stopPrint: (printerId: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/print/stop`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/stop`,
        options: { method: 'POST' },
      },
    ),

  pausePrint: (printerId: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/print/pause`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/pause`,
        options: { method: 'POST' },
      },
    ),

  resumePrint: (printerId: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/print/resume`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/resume`,
        options: { method: 'POST' },
      },
    ),

  clearPlate: (printerId: number) =>
    request<void>(`/printers/${printerId}/clear-plate`, { method: 'POST' }),

  getPlateDetectionStatus: (printerId: number) =>
    request<PlateDetectionStatus>(
      `/printers/${printerId}/plate-detection/status`,
    ),

  calibratePlateDetection: (
    printerId: number,
    data?: Record<string, unknown>,
  ) =>
    request<CalibrationResult>(
      `/printers/${printerId}/plate-detection/calibrate`,
      {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      },
    ),

  setPrintSpeed: (printerId: number, mode: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/print-speed?mode=${mode}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/speed`,
        options: {
          method: 'POST',
          body: JSON.stringify({ mode }),
        },
      },
    ),

  setNozzleTemperature: (
    printerId: number,
    target: number,
    nozzle: number = 0,
  ) =>
    request<void>(`/printers/${printerId}/temperature/nozzle`, {
      method: 'POST',
      body: JSON.stringify({ target, nozzle }),
    }),

  setBedTemperature: (printerId: number, target: number) =>
    request<void>(`/printers/${printerId}/temperature/bed`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),

  setChamberTemperature: (printerId: number, target: number) =>
    request<void>(`/printers/${printerId}/temperature/chamber`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),

  setFanSpeed: (
    printerId: number,
    fan: 'part' | 'aux' | 'chamber',
    speed: number,
  ) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/fan-speed?fan=${fan}&speed=${speed}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/fan`,
        options: {
          method: 'POST',
          body: JSON.stringify({ fan, speed }),
        },
      },
    ),

  setChamberLight: (printerId: number, on: boolean) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/chamber-light?on=${on}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/light`,
        options: {
          method: 'POST',
          body: JSON.stringify({ on }),
        },
      },
    ),

  setAirductMode: (printerId: number, mode: 'cooling' | 'heating') =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/airduct-mode?mode=${mode}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/airduct`,
        options: {
          method: 'POST',
          body: JSON.stringify({ mode }),
        },
      },
    ),

  bedJog: (printerId: number, distance: number, force: boolean = false) =>
    request<void>(
      `/printers/${printerId}/bed-jog?distance=${distance}&force=${force}`,
      { method: 'POST' },
    ),

  xyJog: (printerId: number, x: number, y: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/xy-jog?x=${x}&y=${y}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/jog/xy`,
        options: {
          method: 'POST',
          body: JSON.stringify({ x, y }),
        },
      },
    ),

  extruderJog: (printerId: number, distance: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/extruder-jog?distance=${distance}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/jog/extruder`,
        options: {
          method: 'POST',
          body: JSON.stringify({ distance }),
        },
      },
    ),

  homeAxes: (printerId: number, axes: 'z' | 'xy' | 'all' = 'z') =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/home-axes?axes=${axes}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/home`,
        options: {
          method: 'POST',
          body: JSON.stringify({ axes }),
        },
      },
    ),

  startDrying: (
    printerId: number,
    amsId: number,
    temp: number,
    duration: number,
    filament: string = '',
    rotateTray: boolean = false,
  ) =>
    request<void>(
      `/printers/${printerId}/drying/start?ams_id=${amsId}&temp=${temp}&duration=${duration}&filament=${encodeURIComponent(filament)}&rotate_tray=${rotateTray}`,
      { method: 'POST' },
    ),

  stopDrying: (printerId: number, amsId: number) =>
    request<void>(`/printers/${printerId}/drying/stop?ams_id=${amsId}`, {
      method: 'POST',
    }),

  setAmsFilamentBackup: (printerId: number, enabled: boolean) =>
    request<void>(`/printers/${printerId}/ams-backup?enabled=${enabled}`, {
      method: 'POST',
    }),

  refreshAmsSlot: (printerId: number, amsId: number, slotId: number) =>
    request<void>(
      `/printers/${printerId}/ams/${amsId}/slot/${slotId}/refresh`,
      { method: 'POST' },
    ),

  loadAmsTray: (printerId: number, trayId: number) =>
    request<void>(`/printers/${printerId}/ams/load`, {
      method: 'POST',
      body: JSON.stringify({ tray_id: trayId }),
    }),

  unloadAms: (printerId: number) =>
    request<void>(`/printers/${printerId}/ams/unload`, { method: 'POST' }),

  loadFilament: (printerId: number, amsId: number, trayId: number) => {
    const legacyTrayId = amsId === 255 ? trayId : amsId * 4 + trayId;

    return requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/filament/load`,
        options: {
          method: 'POST',
          body: JSON.stringify({ ams_id: amsId, tray_id: trayId }),
        },
      },
      {
        endpoint: `/printers/${printerId}/ams/load?tray_id=${legacyTrayId}`,
        options: { method: 'POST' },
      },
    );
  },

  unloadFilament: (printerId: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/filament/unload`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/ams/unload`,
        options: { method: 'POST' },
      },
    ),

  getSlotPresets: (printerId: number) =>
    request<Record<number, SlotPresetMapping>>(
      `/printers/${printerId}/slot-presets`,
    ),

  saveSlotPreset: (
    printerId: number,
    amsId: number,
    trayId: number,
    presetId: string,
    presetName: string,
    presetSource = 'cloud',
  ) =>
    request<SlotPresetMapping>(
      `/printers/${printerId}/slot-presets/${amsId}/${trayId}?preset_id=${encodeURIComponent(presetId)}&preset_name=${encodeURIComponent(presetName)}&preset_source=${encodeURIComponent(presetSource)}`,
      { method: 'PUT' },
    ),

  selectExtruder: (printerId: number, extruder: number) =>
    request<void>(
      `/printers/${printerId}/select-extruder?extruder=${extruder}`,
      { method: 'POST' },
    ),

  getPrintableObjects: (printerId: number) =>
    request<{ objects: { id: number; name: string; skipped: boolean }[] }>(
      `/printers/${printerId}/print/objects`,
    ),

  skipObjects: (printerId: number, objectIds: number[]) =>
    request<void>(`/printers/${printerId}/print/skip-objects`, {
      method: 'POST',
      body: JSON.stringify(objectIds),
    }),

  clearHMSErrors: (printerId: number) =>
    request<void>(`/printers/${printerId}/hms/clear`, { method: 'POST' }),

  executeHMSAction: (
    printerId: number,
    data: { action: string; attr?: number },
  ) =>
    request<void>(`/printers/${printerId}/hms/execute-action`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDeveloperModeWarnings: () =>
    request<{ printers: { id: number; name: string; model: string }[] }>(
      '/printers/developer-mode-warnings',
    ),

  getAvailableFilaments: (model: string, location?: string) => {
    const params = new URLSearchParams({ model });
    if (location) params.set('location', location);
    return request<Record<string, unknown>[]>(
      `/printers/available-filaments?${params}`,
    );
  },

  // Camera
  getPrinterImageUrl: (printerId: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/printers/${printerId}/image${token}`;
  },

  getCameraSnapshotUrl: (printerId: number): string => {
    const serverUrl = getServerUrl();
    return withStreamToken(`${serverUrl}/api/v1/printers/${printerId}/camera/snapshot`);
  },

  getCameraStreamUrl: (printerId: number): string => {
    const serverUrl = getServerUrl();
    return withStreamToken(`${serverUrl}/api/v1/printers/${printerId}/camera/stream`);
  },

  diagnosePrinterCamera: (printerId: number) =>
    request<CameraDiagnoseResult>(`/printers/${printerId}/camera/diagnose`, {
      method: 'POST',
    }),

  getCameraStreamToken: () =>
    request<{ token: string }>('/printers/camera/stream-token', { method: 'POST' }),

  // Printer files (SD card)
  getPrinterFiles: (printerId: number, path = '/') =>
    request<Record<string, unknown>[]>(
      `/printers/${printerId}/files?path=${encodeURIComponent(path)}`,
    ),

  getPrinterStorage: (printerId: number) =>
    request<{ total: number; free: number }>(`/printers/${printerId}/storage`),

  // HMS
  getCurrentPrintUser: (printerId: number) =>
    request<{ user_id: number | null; username: string | null }>(
      `/printers/${printerId}/current-print-user`,
    ),

  // Sensor history
  getPrinterSensorHistory: (
    printerId: number,
    hours = 24,
    kinds?: string[],
  ) => {
    const params = new URLSearchParams({ hours: String(hours) });
    if (kinds && kinds.length > 0) {
      params.set('kinds', kinds.join(','));
    }
    return request<PrinterSensorHistoryResponse>(
      `/printer-sensor-history/${printerId}?${params.toString()}`,
    );
  },

  // MQTT debug
  enableMQTTLogging: (printerId: number) =>
    request<void>(`/printers/${printerId}/logging/enable`, {
      method: 'POST',
    }),

  disableMQTTLogging: (printerId: number) =>
    request<void>(`/printers/${printerId}/logging/disable`, {
      method: 'POST',
    }),

  getMQTTLogs: (printerId: number) =>
    request<Record<string, unknown>>(`/printers/${printerId}/logging`),

  clearMQTTLogs: (printerId: number) =>
    request<void>(`/printers/${printerId}/logging`, {
      method: 'DELETE',
    }),

  // Connection diagnostic
  diagnosePrinter: (printerId: number) =>
    request<Record<string, unknown>>(`/printers/${printerId}/diagnostic`),

  diagnosePrinterByDetails: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/printers/diagnostic', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Maintenance mode
  setMaintenanceMode: (printerId: number, enabled: boolean) =>
    request<void>(`/printers/${printerId}/maintenance-mode`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  // ── Archives ─────────────────────────────────────
  getArchives: (params?: {
    printerId?: number;
    projectId?: number;
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
    createdById?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.printerId) p.set('printer_id', String(params.printerId));
    if (params?.projectId) p.set('project_id', String(params.projectId));
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.offset) p.set('offset', String(params.offset));
    if (params?.dateFrom) p.set('date_from', params.dateFrom);
    if (params?.dateTo) p.set('date_to', params.dateTo);
    if (params?.createdById !== undefined) p.set('created_by_id', String(params.createdById));
    return request<Record<string, unknown>[]>(`/archives/?${p}`);
  },

  getArchive: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}`),

  getArchiveRuns: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}/runs`),

  searchArchives: (
    query: string,
    options?: {
      printerId?: number;
      projectId?: number;
      status?: string;
      limit?: number;
      offset?: number;
    },
  ) => {
    const p = new URLSearchParams({ q: query });
    if (options?.printerId) p.set('printer_id', String(options.printerId));
    if (options?.projectId) p.set('project_id', String(options.projectId));
    if (options?.status) p.set('status', options.status);
    if (options?.limit) p.set('limit', String(options.limit));
    if (options?.offset) p.set('offset', String(options.offset));
    return request<Record<string, unknown>[]>(`/archives/search?${p}`);
  },

  updateArchive: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/archives/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteArchive: (id: number, purgeStats: boolean = false) =>
    request<void>(`/archives/${id}${purgeStats ? '?purge_stats=true' : ''}`, {
      method: 'DELETE',
    }),

  toggleFavorite: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}/favorite`, {
      method: 'POST',
    }),

  uploadArchive: (
    file: { uri: string; name: string; type: string },
    printerId?: number,
  ) =>
    uploadFile<Record<string, unknown>>(
      `/archives/upload${printerId !== undefined ? `?printer_id=${printerId}` : ''}`,
      file,
    ),

  getArchiveStats: (params?: {
    dateFrom?: string;
    dateTo?: string;
    createdById?: number;
    printerId?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.dateFrom) p.set('date_from', params.dateFrom);
    if (params?.dateTo) p.set('date_to', params.dateTo);
    if (params?.createdById) p.set('created_by_id', String(params.createdById));
    if (params?.printerId) p.set('printer_id', String(params.printerId));
    return request<Record<string, unknown>>(`/archives/stats?${p}`);
  },

  getTags: () => request<{ name: string; count: number }[]>('/archives/tags'),

  getArchiveDeleteImpact: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}/delete-impact`),

  getArchiveComparison: (ids: number[]) =>
    request<Record<string, unknown>>(
      `/archives/compare?archive_ids=${ids.join(',')}`,
    ),

  getArchiveSimilar: (id: number, limit = 10) =>
    request<Record<string, unknown>[]>(
      `/archives/${id}/similar?limit=${limit}`,
    ),

  exportArchives: (options?: {
    format?: 'csv' | 'xlsx';
    fields?: string[];
    printerId?: number;
    projectId?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }) => {
    const p = new URLSearchParams();
    if (options?.format) p.set('format', options.format);
    if (options?.fields) p.set('fields', options.fields.join(','));
    if (options?.printerId) p.set('printer_id', String(options.printerId));
    if (options?.projectId) p.set('project_id', String(options.projectId));
    if (options?.status) p.set('status', options.status);
    if (options?.dateFrom) p.set('date_from', options.dateFrom);
    if (options?.dateTo) p.set('date_to', options.dateTo);
    if (options?.search) p.set('search', options.search);
    return requestBlob(`/archives/export?${p.toString()}`);
  },

  exportArchiveStats: (options?: {
    format?: 'csv' | 'xlsx';
    days?: number;
    printerId?: number;
    projectId?: number;
    dateFrom?: string;
    dateTo?: string;
    createdById?: number;
  }) => {
    const p = new URLSearchParams();
    if (options?.format) p.set('format', options.format);
    if (options?.days) p.set('days', String(options.days));
    if (options?.printerId) p.set('printer_id', String(options.printerId));
    if (options?.projectId) p.set('project_id', String(options.projectId));
    if (options?.dateFrom) p.set('date_from', options.dateFrom);
    if (options?.dateTo) p.set('date_to', options.dateTo);
    if (options?.createdById !== undefined) {
      p.set('created_by_id', String(options.createdById));
    }
    return requestBlob(`/archives/stats/export?${p.toString()}`);
  },

  getArchivePlates: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}/plates`),

  getArchivePlateThumbnail: (id: number, plateIndex: number): string => {
    const serverUrl = getServerUrl();
    return withStreamToken(`${serverUrl}/api/v1/archives/${id}/plate-thumbnail/${plateIndex}`);
  },

  getArchiveThumbnail: (id: number): string => {
    const serverUrl = getServerUrl();
    return withStreamToken(`${serverUrl}/api/v1/archives/${id}/thumbnail`);
  },

  getArchiveTimelapse: (id: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/archives/${id}/timelapse${token}`;
  },

  getArchivePhotoUrl: (archiveId: number, filename: string): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/archives/${archiveId}/photos/${encodeURIComponent(filename)}${token}`;
  },

  getArchivePhotos: async (archiveId: number) => {
    const archive = (await api.getArchive(archiveId)) as {
      photos?: string[] | null;
    };
    return archive.photos ?? [];
  },

  getArchivePrintLog: async (archiveId: number) => {
    try {
      const response = await request<Record<string, unknown> | Record<string, unknown>[]>(`/archives/${archiveId}/print-log`);
      if (Array.isArray(response)) return response;
      return Array.isArray(response.items) ? (response.items as Record<string, unknown>[]) : [];
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const response = await api.getPrintLog({ limit: 250 });
      const items = Array.isArray((response as { items?: unknown }).items)
        ? (((response as { items?: unknown[] }).items ?? []) as Record<string, unknown>[])
        : [];
      return items.filter(item => Number(item.archive_id ?? 0) === archiveId);
    }
  },

  restoreArchive: (archiveId: number) =>
    request<Record<string, unknown>>(`/archives/${archiveId}/restore`, {
      method: 'POST',
    }),

  previewArchivePurge: (olderThanDays: number, purgeStats = false) =>
    request<Record<string, unknown>>(
      `/archives/purge/preview?older_than_days=${olderThanDays}&purge_stats=${purgeStats}`,
    ),

  purgeArchives: (data: { older_than_days: number; purge_stats?: boolean }) =>
    request<Record<string, unknown>>('/archives/purge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  uploadArchivePhoto: (
    archiveId: number,
    file: { uri: string; name: string; type: string },
  ) => uploadFile<Record<string, unknown>>(`/archives/${archiveId}/photos`, file),

  deleteArchivePhoto: (archiveId: number, filename: string) =>
    request<Record<string, unknown>>(
      `/archives/${archiveId}/photos/${encodeURIComponent(filename)}`,
      { method: 'DELETE' },
    ),

  getArchiveQRCode: (archiveId: number, size = 200): string => {
    const serverUrl = getServerUrl();
    const params = new URLSearchParams({ size: String(size) });
    if (authToken) {
      params.set('token', authToken);
    }
    return `${serverUrl}/api/v1/archives/${archiveId}/qrcode?${params.toString()}`;
  },

  recalculateCosts: () =>
    request<{ message: string }>('/archives/recalculate-costs', {
      method: 'POST',
    }),

  // Print log
  getPrintLog: (params?: {
    limit?: number;
    offset?: number;
    printerId?: number;
    status?: string;
  }) => {
    const p = new URLSearchParams();
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.offset) p.set('offset', String(params.offset));
    if (params?.printerId) p.set('printer_id', String(params.printerId));
    if (params?.status) p.set('status', params.status);
    return request<Record<string, unknown>>(`/print-log/?${p}`);
  },

  clearPrintLog: () => request<void>('/print-log/', { method: 'DELETE' }),

  // ── Print Queue ──────────────────────────────────
  getQueue: (
    printerId?: number,
    status?: string,
    targetModel?: string,
  ) => {
    const p = new URLSearchParams();
    if (printerId !== undefined) p.set('printer_id', String(printerId));
    if (status) p.set('status', status);
    if (targetModel) p.set('target_model', targetModel);
    return request<PrintQueueItem[]>(`/queue/?${p}`);
  },

  getQueueHistory: async (params?: { limit?: number; offset?: number }) => {
    const offset = params?.offset ?? 0;
    const limit = params?.limit;
    const items = await api.getQueue();
    const history = items
      .filter(item =>
        ['completed', 'failed', 'skipped', 'cancelled'].includes(item.status),
      )
      .sort((a, b) => {
        const aTime =
          new Date(
            a.completed_at ?? a.started_at ?? a.created_at ?? 0,
          ).getTime() || 0;
        const bTime =
          new Date(
            b.completed_at ?? b.started_at ?? b.created_at ?? 0,
          ).getTime() || 0;
        return bTime - aTime;
      });
    return typeof limit === 'number'
      ? history.slice(offset, offset + limit)
      : history.slice(offset);
  },

  addToQueue: (data: PrintQueueItemCreate | Record<string, unknown>) =>
    request<PrintQueueItem>('/queue/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateQueueItem: (id: number, data: PrintQueueItemUpdate) =>
    request<PrintQueueItem>(`/queue/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteQueueItem: (id: number) =>
    request<void>(`/queue/${id}`, { method: 'DELETE' }),

  reorderQueue: (itemIds: number[]) =>
    request<{ message: string }>('/queue/reorder', {
      method: 'POST',
      body: JSON.stringify({
        item_ids: itemIds,
        items: itemIds.map((itemId, index) => ({
          id: itemId,
          position: index + 1,
        })),
      }),
    }),

  startQueueItem: (id: number) =>
    request<PrintQueueItem>(`/queue/${id}/start`, { method: 'POST' }),

  cancelQueueItem: (id: number) =>
    request<{ message: string }>(`/queue/${id}/cancel`, { method: 'POST' }),

  retryQueueItem: async (id: number) => {
    const item = await request<PrintQueueItem>(`/queue/${id}`);
    if (item.status === 'pending') {
      return api.startQueueItem(id);
    }

    if (!item.archive_id && !item.library_file_id) {
      throw new Error('Queue item cannot be retried');
    }

    return api.addToQueue({
      printer_id: item.printer_id,
      target_model: item.target_model,
      target_location: item.target_location,
      filament_overrides: item.filament_overrides,
      archive_id: item.archive_id,
      library_file_id: item.library_file_id,
      scheduled_time: item.scheduled_time,
      require_previous_success: item.require_previous_success,
      auto_off_after: item.auto_off_after,
      manual_start: item.manual_start,
      skip_filament_check: item.skip_filament_check,
      ams_mapping: item.ams_mapping,
      plate_id: item.plate_id,
      bed_levelling: item.bed_levelling,
      flow_cali: item.flow_cali,
      vibration_cali: item.vibration_cali,
      layer_inspect: item.layer_inspect,
      timelapse: item.timelapse,
      use_ams: item.use_ams,
      nozzle_offset_cali: item.nozzle_offset_cali,
      preheat_override: item.preheat_override,
      preheat_chamber_target_override: item.preheat_chamber_target_override,
      gcode_injection: item.gcode_injection,
      cleanup_library_after_dispatch: item.cleanup_library_after_dispatch,
    });
  },

  getQueueTimeline: async () => {
    const items = await api.getQueue();
    return [...items].sort((a, b) => {
      const aTime =
        new Date(
          a.completed_at ?? a.started_at ?? a.created_at ?? 0,
        ).getTime() || 0;
      const bTime =
        new Date(
          b.completed_at ?? b.started_at ?? b.created_at ?? 0,
        ).getTime() || 0;
      return bTime - aTime;
    });
  },

  bulkUpdateQueue: (
    data:
      | PrintQueueBulkUpdate
      | {
          item_ids: number[];
          update: Partial<Omit<PrintQueueBulkUpdate, 'item_ids'>> & {
            status?: string;
          };
        },
  ) => {
    const normalized =
      'update' in data
        ? { item_ids: data.item_ids, ...data.update }
        : data;

    return request<PrintQueueBulkUpdateResponse>('/queue/bulk', {
      method: 'PATCH',
      body: JSON.stringify(
        'update' in data
          ? { ...normalized, update: data.update }
          : normalized,
      ),
    });
  },

  getQueueBatches: (status?: string) => {
    const params = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<PrintBatch[]>(`/queue/batches${params}`);
  },

  getQueueBatch: (id: number) => request<PrintBatch>(`/queue/batches/${id}`),

  ungroupBatch: (id: number) =>
    request<PrintBatchUngroupResponse>(`/queue/batches/${id}/ungroup`, {
      method: 'POST',
    }),

  // ── File Manager (Library) ───────────────────────
  getLibraryFolders: () => request<Record<string, unknown>[]>('/library/folders'),

  getLibraryFoldersByProject: (projectId: number) =>
    request<Record<string, unknown>[]>(
      `/library/folders/by-project/${projectId}`,
    ),

  getLibraryFiles: (
    folderId?: number | null,
    includeRoot = true,
    projectId?: number,
  ) => {
    const p = new URLSearchParams();
    if (folderId !== undefined && folderId !== null) {
      p.set('folder_id', String(folderId));
    }
    if (!includeRoot) {
      p.set('include_root', 'false');
    }
    if (projectId !== undefined) {
      p.set('project_id', String(projectId));
    }
    const query = p.toString();
    return request<Record<string, unknown>[]>(`/library/files${query ? `?${query}` : ''}`);
  },

  getLibraryFile: (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/library/files/${id}`,
      },
      {
        endpoint: `/library/${id}`,
      },
    ),

  createFolder: (data: { name: string; parent_id?: number }) =>
    request<Record<string, unknown>>('/library/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  renameLibraryItem: (id: number, name: string) =>
    request<Record<string, unknown>>(`/library/files/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ print_name: name }),
    }),

  moveLibraryItem: (id: number, folderId: number | null) =>
    request<Record<string, unknown>>('/library/files/move', {
      method: 'POST',
      body: JSON.stringify({ file_ids: [id], folder_id: folderId }),
    }),

  deleteLibraryItem: (id: number) =>
    request<void>(`/library/files/${id}`, { method: 'DELETE' }),

  uploadLibraryFile: (
    file: { uri: string; name: string; type: string },
    folderId?: number | null,
    onProgress?: (progress: number) => void,
  ) => {
    const params = new URLSearchParams();
    if (folderId != null) {
      params.set('folder_id', String(folderId));
    }
    params.set('generate_stl_thumbnails', 'true');
    const primaryEndpoint = `/library/files${params.toString() ? `?${params}` : ''}`;
    const fallbackEndpoint = folderId != null
      ? `/library/upload?folder_id=${folderId}`
      : '/library/upload';

    const performUpload = (endpoint: string) =>
      onProgress
        ? uploadFileWithProgress<Record<string, unknown>>(
            endpoint,
            file,
            onProgress,
          )
        : uploadFile<Record<string, unknown>>(endpoint, file);

    return performUpload(primaryEndpoint).catch((error) => {
      if (error instanceof ApiError && error.status === 404) {
        return performUpload(fallbackEndpoint);
      }
      throw error;
    });
  },

  getLibraryFilePlates: (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/library/files/${id}/plates`,
      },
      {
        endpoint: `/library/${id}/plates`,
      },
    ),

  getLibraryFileFilamentRequirements: (
    id: number,
    plateId?: number,
  ) => {
    const params = new URLSearchParams();
    if (plateId !== undefined) {
      params.set('plate_id', String(plateId));
    }
    const query = params.toString();

    return requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/library/files/${id}/filament-requirements${query ? `?${query}` : ''}`,
      },
      {
        endpoint: `/library/${id}/filament-requirements${query ? `?${query}` : ''}`,
      },
    );
  },

  getLibraryFilePlateThumbnail: (id: number, plateIndex: number): string => {
    const serverUrl = getServerUrl();
    return withStreamToken(`${serverUrl}/api/v1/library/files/${id}/plate-thumbnail/${plateIndex}`);
  },

  getLibraryFileThumbnailUrl: (id: number): string => {
    const serverUrl = getServerUrl();
    return withStreamToken(`${serverUrl}/api/v1/library/files/${id}/thumbnail`);
  },

  getLibraryFileDownloadUrl: (id: number): string => {
    const serverUrl = getServerUrl();
    return withStreamToken(`${serverUrl}/api/v1/library/files/${id}/download`);
  },

  getLibraryFileText: (id: number) =>
    requestTextWithFallback(
      {
        endpoint: `/library/files/${id}/download`,
      },
      {
        endpoint: `/library/${id}/download`,
      },
    ),

  getLibraryTags: () =>
    request<{ name: string; count: number }[]>('/library/tags'),

  createLibraryTag: (name: string) =>
    request<Record<string, unknown>>('/library/tags', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateLibraryTag: (id: number, name: string) =>
    request<Record<string, unknown>>(`/library/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteLibraryTag: (id: number) =>
    request<void>(`/library/tags/${id}`, { method: 'DELETE' }),

  bulkAssignLibraryTags: (
    fileIds: number[],
    tagIds: number[],
    action: 'add' | 'remove' | 'replace' = 'replace',
  ) =>
    request<Record<string, unknown>>('/library/tags/bulk-assign', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds, tag_ids: tagIds, action }),
    }),

  getExternalFolders: async () => {
    try {
      const response = await request<Record<string, unknown>[]>('/library/external-folders');
      return response;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const folders = await api.getLibraryFolders();
      const flatten = (nodes: Record<string, unknown>[]): Record<string, unknown>[] =>
        nodes.flatMap(node => [node, ...flatten(Array.isArray(node.children) ? (node.children as Record<string, unknown>[]) : [])]);
      return flatten(Array.isArray(folders) ? (folders as Record<string, unknown>[]) : []).filter(folder => folder.is_external);
    }
  },

  createExternalFolder: (data: {
    name: string;
    external_path: string;
    readonly?: boolean;
    show_hidden?: boolean;
    parent_id?: number | null;
  }) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: '/library/external-folders',
        options: { method: 'POST', body: JSON.stringify(data) },
      },
      {
        endpoint: '/library/folders/external',
        options: { method: 'POST', body: JSON.stringify(data) },
      },
    ),

  deleteExternalFolder: (id: number) =>
    requestWithFallback<void>(
      { endpoint: `/library/external-folders/${id}`, options: { method: 'DELETE' } },
      { endpoint: `/library/folders/${id}`, options: { method: 'DELETE' } },
    ),

  scanExternalFolder: (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      { endpoint: `/library/external-folders/${id}/scan`, options: { method: 'POST' } },
      { endpoint: `/library/folders/${id}/scan`, options: { method: 'POST' } },
    ),

  previewLibraryPurge: (olderThanDays: number, includeNeverPrinted = true) =>
    request<Record<string, unknown>>(
      `/library/purge/preview?older_than_days=${olderThanDays}&include_never_printed=${includeNeverPrinted}`,
    ),

  purgeLibraryOldFiles: (data: { older_than_days: number; include_never_printed?: boolean }) =>
    request<Record<string, unknown>>('/library/purge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getLibraryStats: () => request<Record<string, unknown>>('/library/stats'),

  bulkDeleteLibrary: (fileIds: number[], folderIds: number[]) =>
    request<Record<string, unknown>>('/library/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds, folder_ids: folderIds }),
    }),

  addLibraryFilesToQueue: (fileIds: number[]) =>
    request<Record<string, unknown>>('/library/files/add-to-queue', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds }),
    }),

  // Library trash
  getLibraryTrash: () => request<Record<string, unknown>[]>('/library/trash'),

  restoreLibraryItem: (id: number) =>
    request<void>(`/library/trash/${id}/restore`, { method: 'POST' }),

  permanentDeleteLibraryItem: (id: number) =>
    request<void>(`/library/trash/${id}`, { method: 'DELETE' }),

  emptyLibraryTrash: () =>
    request<void>('/library/trash', { method: 'DELETE' }),

  // ── Projects ─────────────────────────────────────
  getProjects: () => request<Record<string, unknown>[]>('/projects/'),

  getProject: (id: number) =>
    request<Record<string, unknown>>(`/projects/${id}`),

  createProject: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/projects/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProject: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteProject: (id: number) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),

  getProjectArchives: (id: number, limit = 100, offset = 0) =>
    request<Record<string, unknown>[]>(
      `/projects/${id}/archives?limit=${limit}&offset=${offset}`,
    ),

  sliceProject: (id: number, data: Record<string, unknown>) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/projects/${id}/slice`,
        options: {
          method: 'POST',
          body: JSON.stringify(data),
        },
      },
      {
        endpoint: '/slicer/slice',
        options: {
          method: 'POST',
          body: JSON.stringify({ project_id: id, ...data }),
        },
      },
    ),

  getProjectBOM: (projectId: number) =>
    request<Record<string, unknown>[]>(`/projects/${projectId}/bom`),

  createBOMItem: (projectId: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/projects/${projectId}/bom`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBOMItem: (
    projectId: number,
    itemId: number,
    data: Record<string, unknown>,
  ) =>
    request<Record<string, unknown>>(
      `/projects/${projectId}/bom/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    ),

  deleteBOMItem: (projectId: number, itemId: number) =>
    request<void>(`/projects/${projectId}/bom/${itemId}`, {
      method: 'DELETE',
    }),

  getProjectTimeline: (projectId: number, limit = 50) =>
    request<Record<string, unknown>[]>(
      `/projects/${projectId}/timeline?limit=${limit}`,
    ),

  getProjectCoverImageUrl: (projectId: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/projects/${projectId}/cover-image${token}`;
  },

  uploadProjectCoverImage: (
    projectId: number,
    file: { uri: string; name: string; type: string },
  ) =>
    uploadFile<Record<string, unknown>>(
      `/projects/${projectId}/cover-image`,
      file,
    ),

  deleteProjectCoverImage: (projectId: number) =>
    request<void>(`/projects/${projectId}/cover-image`, {
      method: 'DELETE',
    }),

  exportProjectZip: (projectId: number) =>
    requestBlob(`/projects/${projectId}/export`),

  // ── Spool Inventory ──────────────────────────────
  getSpools: (includeArchived = false) =>
    request<InventorySpool[]>(
      `/inventory/spools?include_archived=${includeArchived}`,
    ),

  getSpool: (id: number) =>
    request<Record<string, unknown>>(`/inventory/spools/${id}`),

  createSpool: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/spools', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSpool: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/spools/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSpool: (id: number) =>
    request<void>(`/inventory/spools/${id}`, { method: 'DELETE' }),

  archiveSpool: (id: number) =>
    request<void>(`/inventory/spools/${id}/archive`, { method: 'POST' }),

  restoreSpool: (id: number) =>
    request<void>(`/inventory/spools/${id}/restore`, { method: 'POST' }),

  assignSpool: (
    spoolId: number,
    printerId: number,
    amsId: number,
    trayId: number,
  ) =>
    request<void>('/inventory/assignments', {
      method: 'POST',
      body: JSON.stringify({
        spool_id: spoolId,
        printer_id: printerId,
        ams_id: amsId,
        tray_id: trayId,
      }),
    }),

  unassignSpool: (printerId: number, amsId: number, trayId: number) =>
    request<void>(`/inventory/assignments/${printerId}/${amsId}/${trayId}`, {
      method: 'DELETE',
    }),

  getSpoolAssignments: () =>
    request<SpoolAssignment[]>('/inventory/assignments'),

  getSpoolCatalog: () =>
    request<Record<string, unknown>[]>('/inventory/catalog'),

  createSpoolCatalogEntry: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/catalog', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSpoolCatalogEntry: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/catalog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSpoolCatalogEntry: (id: number) =>
    request<void>(`/inventory/catalog/${id}`, { method: 'DELETE' }),

  getColorCatalog: () =>
    request<Record<string, unknown>[]>('/inventory/colors'),

  createColorCatalogEntry: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/colors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateColorCatalogEntry: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/colors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteColorCatalogEntry: (id: number) =>
    request<void>(`/inventory/colors/${id}`, { method: 'DELETE' }),

  getLocations: () =>
    request<Record<string, unknown>[]>('/inventory/locations'),

  createLocation: (data: { name: string; identifier?: string | null }) =>
    request<Record<string, unknown>>('/inventory/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateLocation: (id: number, data: { name?: string; identifier?: string | null }) =>
    request<Record<string, unknown>>(`/inventory/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteLocation: (id: number) =>
    request<Record<string, unknown>>(`/inventory/locations/${id}`, {
      method: 'DELETE',
    }),

  getInventoryLabelTemplates: async () => {
    try {
      const response = await request<Array<{ value?: string; id?: string; label?: string; name?: string; hint?: string }>>('/inventory/label-templates');
      return response;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      return [
        { value: 'ams_holder_74x33', label: 'AMS holder — small (74 × 33 mm)' },
        { value: 'ams_holder_75x55', label: 'AMS holder — large (75 × 55 mm)' },
        { value: 'box_40x30', label: 'Box label (40 × 30 mm)' },
        { value: 'box_62x29', label: 'Box label (62 × 29 mm)' },
        { value: 'avery_5160', label: 'Avery 5160 — US Letter sheet' },
        { value: 'avery_l7160', label: 'Avery L7160 — A4 sheet' },
      ];
    }
  },

  printSpoolLabels: (data: {
    spool_ids: number[];
    template:
      | 'ams_holder_74x33'
      | 'ams_holder_75x55'
      | 'box_40x30'
      | 'box_62x29'
      | 'avery_5160'
      | 'avery_l7160';
    monochrome?: boolean;
  }) =>
    requestBlob('/inventory/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  printInventoryLabel: (
    spoolId: number,
    data: {
      template:
        | 'ams_holder_74x33'
        | 'ams_holder_75x55'
        | 'box_40x30'
        | 'box_62x29'
        | 'avery_5160'
        | 'avery_l7160';
      monochrome?: boolean;
    },
  ) =>
    requestBlob('/inventory/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spool_ids: [spoolId], ...data }),
    }),

  importSpoolsCsvPreview: (
    file: { uri: string; name: string; type: string },
  ) =>
    uploadFile<Record<string, unknown>>(
      '/inventory/spools/import?dry_run=true',
      file,
    ),

  importSpoolsCsv: (file: { uri: string; name: string; type: string }) =>
    uploadFile<Record<string, unknown>>('/inventory/spools/import', file),

  exportSpoolsCsv: () => requestBlob('/inventory/spools/export'),

  resetSpoolConsumedCounter: (id: number) =>
    request<Record<string, unknown>>(
      `/inventory/spools/${id}/reset-consumed-counter`,
      { method: 'POST' },
    ),

  bulkResetSpoolConsumedCounter: (spoolIds: number[]) =>
    request<Record<string, unknown>>(
      '/inventory/spools/reset-consumed-counter-bulk',
      {
        method: 'POST',
        body: JSON.stringify({ spool_ids: spoolIds }),
      },
    ),

  bulkUpdateSpools: (ids: number[], update: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/spools/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, update }),
    }),

  bulkDeleteSpools: (ids: number[]) =>
    request<Record<string, unknown>>('/inventory/spools/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkArchiveSpools: (ids: number[]) =>
    request<Record<string, unknown>>('/inventory/spools/bulk-archive', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkRestoreSpools: (ids: number[]) =>
    request<Record<string, unknown>>('/inventory/spools/bulk-restore', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  getSpoolKProfiles: (spoolId: number) =>
    request<SpoolKProfile[]>(`/inventory/spools/${spoolId}/k-profiles`),

  getSpoolUsageHistory: (spoolId: number, limit = 50) =>
    request<SpoolUsageRecord[]>(`/inventory/spools/${spoolId}/usage?limit=${limit}`),

  getAllUsageHistory: (limit = 5000, printerId?: number) => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (printerId !== undefined) p.set('printer_id', String(printerId));
    return request<SpoolUsageRecord[]>(`/inventory/usage?${p.toString()}`);
  },

  getAssignments: (printerId?: number) =>
    request<SpoolAssignment[]>(
      `/inventory/assignments${printerId ? `?printer_id=${printerId}` : ''}`,
    ),

  // ── Maintenance ──────────────────────────────────
  getMaintenanceTasks: async () => {
    const overview = await request<
      Array<{ maintenance_items?: Record<string, unknown>[] }>
    >('/maintenance/overview');
    return overview.flatMap(item => item.maintenance_items ?? []);
  },

  getMaintenanceTask: async (id: number) => {
    const items = await api.getMaintenanceTasks();
    const item = items.find(candidate => candidate.id === id);
    if (!item) {
      throw new ApiError('Maintenance item not found', 404);
    }
    return item;
  },

  createMaintenanceTask: (data: Record<string, unknown>) => {
    const printerId = Number(data.printer_id);
    const typeId = Number(data.maintenance_type_id);
    if (!Number.isFinite(printerId) || !Number.isFinite(typeId)) {
      throw new Error('printer_id and maintenance_type_id are required');
    }
    return request<Record<string, unknown>>(
      `/maintenance/printers/${printerId}/assign/${typeId}`,
      { method: 'POST' },
    );
  },

  updateMaintenanceTask: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/maintenance/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteMaintenanceTask: (id: number) =>
    request<void>(`/maintenance/items/${id}`, { method: 'DELETE' }),

  completeMaintenanceTask: (id: number) =>
    request<Record<string, unknown>>(`/maintenance/items/${id}/perform`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getMaintenanceTypes: () => request<MaintenanceType[]>('/maintenance/types'),

  createMaintenanceType: (data: MaintenanceTypeCreate) =>
    request<MaintenanceType>('/maintenance/types', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMaintenanceType: (id: number, data: Partial<MaintenanceTypeCreate>) =>
    request<MaintenanceType>(`/maintenance/types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteMaintenanceType: (id: number) =>
    request<void>(`/maintenance/types/${id}`, { method: 'DELETE' }),

  getMaintenanceOverview: () =>
    request<PrinterMaintenanceOverview[]>('/maintenance/overview'),

  getPrinterMaintenance: (printerId: number) =>
    request<PrinterMaintenanceOverview>(`/maintenance/printers/${printerId}`),

  updateMaintenanceItem: (
    itemId: number,
    data: {
      custom_interval_hours?: number | null;
      custom_interval_type?: 'hours' | 'days' | null;
      enabled?: boolean;
    },
  ) =>
    request<MaintenanceStatus>(`/maintenance/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  performMaintenance: (itemId: number, notes?: string) =>
    request<MaintenanceStatus>(`/maintenance/items/${itemId}/perform`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  assignMaintenanceType: (printerId: number, typeId: number) =>
    requestWithFallback<MaintenanceStatus>(
      {
        endpoint: '/maintenance/assignments',
        options: {
          method: 'POST',
          body: JSON.stringify({ printer_id: printerId, type_id: typeId }),
        },
      },
      {
        endpoint: `/maintenance/printers/${printerId}/assign/${typeId}`,
        options: { method: 'POST' },
      },
    ),

  removeMaintenanceItem: (itemId: number) =>
    request<void>(`/maintenance/items/${itemId}`, { method: 'DELETE' }),

  setPrinterHours: (printerId: number, totalHours: number) =>
    request<Record<string, unknown>>(
      `/maintenance/printers/${printerId}/hours?total_hours=${totalHours}`,
      { method: 'PATCH' },
    ),

  // ── Settings ─────────────────────────────────────
  getSettings: () => request<Record<string, unknown>>('/settings/'),

  updateSettings: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/settings/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── Notifications ────────────────────────────────
  getNotificationProviders: () =>
    request<Record<string, unknown>[]>('/notifications/'),

  createNotificationProvider: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/notifications/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateNotificationProvider: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/notifications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteNotificationProvider: (id: number) =>
    request<void>(`/notifications/${id}`, { method: 'DELETE' }),

  testNotificationProvider: (id: number) =>
    request<NotificationTestResponse>(`/notifications/${id}/test`, { method: 'POST' }),

  testNotificationConfig: (data: NotificationTestRequest) =>
    request<NotificationTestResponse>('/notifications/test-config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getNotificationLog: (params?: {
    limit?: number;
    offset?: number;
    provider_id?: number;
    event_type?: string;
    success?: boolean;
    days?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.offset) p.set('offset', String(params.offset));
    if (params?.provider_id) p.set('provider_id', String(params.provider_id));
    if (params?.event_type) p.set('event_type', params.event_type);
    if (params?.success !== undefined) p.set('success', String(params.success));
    if (params?.days) p.set('days', String(params.days));
    return requestWithFallback<Record<string, unknown>[]>(
      { endpoint: `/notifications/logs?${p}` },
      { endpoint: `/notifications/log?${p}` },
    );
  },

  getNotificationLogStats: (days = 7) =>
    request<Record<string, unknown>>(`/notifications/logs/stats?days=${days}`),

  clearNotificationLogs: (olderThanDays = 30) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/notifications/logs?older_than_days=${olderThanDays}`,
        options: { method: 'DELETE' },
      },
      {
        endpoint: `/notifications/log?older_than_days=${olderThanDays}`,
        options: { method: 'DELETE' },
      },
    ),

  // Push notification registration for mobile
  registerPushToken: (data: {
    token: string;
    platform: 'ios' | 'android';
    device_name?: string;
  }) =>
    request<void>('/notifications/push/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  unregisterPushToken: (token: string) =>
    request<void>('/notifications/push/unregister', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  // ── Profiles ─────────────────────────────────────
  getCloudStatus: () => request<Record<string, unknown>>('/cloud/status'),

  cloudLogin: (email: string, password: string, region = 'global') =>
    request<Record<string, unknown>>('/cloud/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, region }),
    }),

  cloudVerify: (
    email: string,
    code: string,
    tfaKey?: string,
    region = 'global',
  ) =>
    request<Record<string, unknown>>('/cloud/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, tfa_key: tfaKey, region }),
    }),

  cloudSetToken: (accessToken: string, region = 'global') =>
    request<Record<string, unknown>>('/cloud/token', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken, region }),
    }),

  cloudLogout: () => request<Record<string, unknown>>('/cloud/logout', {
    method: 'POST',
  }),

  getCloudProfiles: () => request<Record<string, unknown>[]>('/cloud/settings'),

  orcaCloudStartAuth: (provider: 'google' | 'apple' | 'github' = 'google') =>
    request<Record<string, unknown>>('/orca-cloud/auth/start', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    }),

  orcaCloudFinishAuth: (callbackUrl: string) =>
    request<Record<string, unknown>>('/orca-cloud/auth/finish', {
      method: 'POST',
      body: JSON.stringify({ callback_url: callbackUrl }),
    }),

  orcaCloudPasswordLogin: (email: string, password: string) =>
    request<Record<string, unknown>>('/orca-cloud/auth/password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  orcaCloudStatus: () =>
    request<Record<string, unknown>>('/orca-cloud/status'),

  orcaCloudLogout: () =>
    request<Record<string, unknown>>('/orca-cloud/logout', {
      method: 'POST',
    }),

  getOrcaCloudProfiles: () =>
    request<Record<string, unknown>>('/orca-cloud/profiles'),

  getLocalPresets: () => request<Record<string, unknown>[]>('/local-presets/'),

  getKProfiles: async (printerId?: number, nozzleDiameter = '0.4') => {
    let resolvedPrinterId = printerId;
    if (resolvedPrinterId === undefined) {
      const printers = await api.getPrinters();
      const firstPrinter = printers.find(
        (printer): printer is Record<string, unknown> & { id: number } =>
          typeof printer === 'object' &&
          printer !== null &&
          typeof (printer as { id?: unknown }).id === 'number',
      );
      resolvedPrinterId = firstPrinter?.id;
    }
    if (resolvedPrinterId === undefined) {
      throw new Error('No printer available for K profiles');
    }
    return request<Record<string, unknown>>(
      `/printers/${resolvedPrinterId}/kprofiles/?nozzle_diameter=${nozzleDiameter}`,
    );
  },

  createKProfile: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/kprofiles/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateKProfile: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/kprofiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteKProfile: (id: number) =>
    request<void>(`/kprofiles/${id}`, { method: 'DELETE' }),

  // ── MakerWorld ───────────────────────────────────
  getMakerworldStatus: () =>
    request<Record<string, unknown>>('/makerworld/status'),

  resolveMakerworldUrl: (url: string) =>
    request<Record<string, unknown>>('/makerworld/resolve', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  importMakerworldPlate: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/makerworld/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMakerworldRecentImports: () =>
    request<Record<string, unknown>[]>('/makerworld/recent-imports'),

  // ── Virtual Printers ─────────────────────────────
  getVirtualPrinterList: () =>
    request<Record<string, unknown> | Record<string, unknown>[]>('/virtual-printers').then(response => {
      if (Array.isArray(response)) {
        return { printers: response, models: {} };
      }
      return response;
    }),

  getVirtualPrinters: () =>
    api.getVirtualPrinterList().then(response => {
      const printers = response.printers;
      return Array.isArray(printers) ? (printers as Record<string, unknown>[]) : [];
    }),

  getVirtualPrinter: (id: number) =>
    request<Record<string, unknown>>(`/virtual-printers/${id}`),

  createVirtualPrinter: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/virtual-printers/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateVirtualPrinter: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/virtual-printers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteVirtualPrinter: (id: number) =>
    request<void>(`/virtual-printers/${id}`, { method: 'DELETE' }),

  startVirtualPrinter: (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/virtual-printers/${id}/start`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/virtual-printers/${id}`,
        options: { method: 'PUT', body: JSON.stringify({ enabled: true }) },
      },
    ),

  stopVirtualPrinter: (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/virtual-printers/${id}/stop`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/virtual-printers/${id}`,
        options: { method: 'PUT', body: JSON.stringify({ enabled: false }) },
      },
    ),

  // ── Slicer ───────────────────────────────────────
  getSlicerPresets: (options?: { refresh?: boolean }) =>
    request<UnifiedPresetsResponse>(
      options?.refresh ? '/slicer/presets?refresh=true' : '/slicer/presets',
    ),

  startSliceJob: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/slicer/slice', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSliceJobProgress: (requestId: string) =>
    request<Record<string, unknown> | null>(`/slicer/progress/${requestId}`),

  getSlicerBundles: () => request<Record<string, unknown>[]>('/slicer/bundles'),

  // ── Slicer Pipelines ─────────────────────────────
  getPipelines: () => request<Record<string, unknown>[]>('/slicer-pipelines/'),

  getPipeline: (id: number) =>
    request<Record<string, unknown>>(`/slicer-pipelines/${id}`),

  createPipeline: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/slicer-pipelines/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePipeline: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/slicer-pipelines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePipeline: (id: number) =>
    request<void>(`/slicer-pipelines/${id}`, { method: 'DELETE' }),

  runPipeline: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/slicer-pipelines/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPipelineRuns: (pipelineId?: number) => {
    const p = pipelineId ? `?pipeline_id=${pipelineId}` : '';
    return request<Record<string, unknown> | Record<string, unknown>[]>(
      `/pipeline-runs${p}`,
    ).then(response => {
      if (Array.isArray(response)) return response;
      const items = response.items;
      return Array.isArray(items) ? items : [];
    });
  },

  cancelPipelineRun: (runId: number) =>
    request<void>(`/pipeline-runs/${runId}/cancel`, { method: 'POST' }),

  retryPipelineRun: (runId: number) =>
    request<void>(`/pipeline-runs/${runId}/retry-failed`, {
      method: 'POST',
    }),

  // ── Smart Plugs ──────────────────────────────────
  getSmartPlugs: () => request<SmartPlug[]>('/smart-plugs/'),

  createSmartPlug: (data: SmartPlugCreate) =>
    request<SmartPlug>('/smart-plugs/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSmartPlug: (id: number, data: SmartPlugUpdate) =>
    request<SmartPlug>(`/smart-plugs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSmartPlug: (id: number) =>
    request<void>(`/smart-plugs/${id}`, { method: 'DELETE' }),

  controlSmartPlug: (id: number, action: 'on' | 'off' | 'toggle') =>
    request<{ success: boolean; action: string }>(
      `/smart-plugs/${id}/control`,
      {
        method: 'POST',
        body: JSON.stringify({ action }),
      },
    ),

  toggleSmartPlug: (id: number, state: boolean) =>
    request<{ success: boolean; action: string }>(
      `/smart-plugs/${id}/control`,
      {
        method: 'POST',
        body: JSON.stringify({ action: state ? 'on' : 'off' }),
      },
    ),

  getSmartPlugStatus: (id: number) =>
    request<SmartPlugStatus>(`/smart-plugs/${id}/status`),

  testSmartPlugConnection: (
    ipAddress: string,
    username?: string | null,
    password?: string | null,
  ) =>
    request<SmartPlugTestResult>('/smart-plugs/test-connection', {
      method: 'POST',
      body: JSON.stringify({
        ip_address: ipAddress,
        username,
        password,
      }),
    }),

  // ── API Keys ─────────────────────────────────────
  getApiKeys: () => request<Record<string, unknown>[]>('/api-keys/'),

  createApiKey: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api-keys/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteApiKey: (id: number) =>
    request<void>(`/api-keys/${id}`, { method: 'DELETE' }),

  // ── Camera tokens ────────────────────────────────
  getCameraTokens: () => request<Record<string, unknown>[]>('/auth/tokens'),

  createCameraToken: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteCameraToken: (id: number) =>
    request<void>(`/auth/tokens/${id}`, { method: 'DELETE' }),

  listMyLongLivedCameraTokens: () =>
    request<Record<string, unknown>[]>('/auth/tokens'),

  listAllLongLivedCameraTokens: () =>
    request<Record<string, unknown>[]>('/auth/tokens/all'),

  createLongLivedCameraToken: (payload: { name: string; expires_in_days: number }) =>
    request<Record<string, unknown>>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({ ...payload, scope: 'camera_stream' }),
    }),

  revokeLongLivedCameraToken: (tokenId: number) =>
    request<void>(`/auth/tokens/${tokenId}`, { method: 'DELETE' }),

  // ── Backup & Restore ─────────────────────────────
  exportBackup: () => requestBlob('/settings/backup'),

  getLocalBackups: () =>
    request<Record<string, unknown>[]>('/local-backup/backups'),

  createLocalBackup: () =>
    request<Record<string, unknown>>('/local-backup/run', { method: 'POST' }),

  deleteLocalBackup: (filename: string) =>
    request<void>(`/local-backup/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  getLocalBackupStatus: () =>
    request<Record<string, unknown>>('/local-backup/status'),

  triggerLocalBackup: () =>
    request<Record<string, unknown>>('/local-backup/run', {
      method: 'POST',
    }),

  downloadLocalBackup: (filename: string) =>
    requestBlob(`/local-backup/backups/${encodeURIComponent(filename)}/download`),

  restoreLocalBackup: (filename: string) =>
    request<Record<string, unknown>>(
      `/local-backup/backups/${encodeURIComponent(filename)}/restore`,
      { method: 'POST' },
    ),

  // GitHub backup
  getGitHubBackupConfig: () =>
    request<Record<string, unknown> | null>('/github-backup/config'),

  saveGitHubBackupConfig: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/github-backup/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateGitHubBackupConfig: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/github-backup/config', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  testGitHubBackupConnection: (repoUrl: string, token: string, provider = 'github') =>
    request<Record<string, unknown>>(
      `/github-backup/test?repo_url=${encodeURIComponent(repoUrl)}&token=${encodeURIComponent(token)}&provider=${encodeURIComponent(provider)}`,
      { method: 'POST' },
    ),

  getGitHubBackupStatus: () =>
    request<Record<string, unknown>>('/github-backup/status'),

  triggerGitHubBackup: () =>
    request<Record<string, unknown>>('/github-backup/run', {
      method: 'POST',
    }),

  // ── System ───────────────────────────────────────
  getSystemInfo: () => request<Record<string, unknown>>('/system/info'),

  getSystemHealth: () => request<Record<string, unknown>>('/system/health'),

  getStorageUsage: (options?: { refresh?: boolean }) => {
    const p = new URLSearchParams();
    if (options?.refresh) p.set('refresh', 'true');
    const query = p.toString() ? `?${p}` : '';
    return requestWithFallback<Record<string, unknown>>(
      { endpoint: `/system/storage${query}` },
      { endpoint: `/system/storage-usage${query}` },
    );
  },

  getUpdateInfo: () => request<Record<string, unknown>>('/updates/check'),

  // Firmware
  getFirmwareVersions: (model: string) =>
    request<Record<string, unknown>[]>(
      `/firmware/versions?model=${encodeURIComponent(model)}`,
    ),

  // Logs
  getApplicationLogs: (params?: { level?: string; lines?: number }) => {
    const p = new URLSearchParams();
    if (params?.level) p.set('level', params.level);
    if (params?.lines) p.set('lines', String(params.lines));
    const query = p.toString();
    return requestWithFallback<Record<string, unknown>>(
      { endpoint: `/system/logs?${query}` },
      { endpoint: `/support/logs?${query.replace('lines=', 'limit=')}` },
    );
  },

  getDebugLoggingState: () =>
    requestWithFallback<Record<string, unknown>>(
      { endpoint: '/system/debug-logging' },
      { endpoint: '/support/debug-logging' },
    ),

  setDebugLogging: (enabled: boolean) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: '/system/debug-logging',
        options: {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        },
      },
      {
        endpoint: '/support/debug-logging',
        options: {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        },
      },
    ),

  downloadSupportBundle: () => requestBlob('/support/bundle'),

  getSupportLogs: (params?: { limit?: number; level?: string; search?: string }) => {
    const p = new URLSearchParams();
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.level) p.set('level', params.level);
    if (params?.search) p.set('search', params.search);
    return request<Record<string, unknown>>(
      `/support/logs${p.toString() ? `?${p}` : ''}`,
    );
  },

  clearSupportLogs: () => request<void>('/support/logs', { method: 'DELETE' }),

  submitBugReport: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/bug-report/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  startBugReportLogging: () =>
    request<Record<string, unknown>>('/bug-report/start-logging', {
      method: 'POST',
    }),

  stopBugReportLogging: (wasDebug: boolean) =>
    request<Record<string, unknown>>(`/bug-report/stop-logging?was_debug=${wasDebug}`, {
      method: 'POST',
    }),

  // ── External Links ───────────────────────────────
  getExternalLinks: () =>
    request<Record<string, unknown>[]>('/external-links/'),

  createExternalLink: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/external-links/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateExternalLink: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/external-links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteExternalLink: (id: number) =>
    request<void>(`/external-links/${id}`, { method: 'DELETE' }),

  reorderExternalLinks: (ids: number[]) =>
    request<Record<string, unknown>[]>('/external-links/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),

  // ── Filament Presets ─────────────────────────────
  getFilamentPresets: () =>
    request<Record<string, unknown>[]>('/cloud/filaments'),

  // ── AMS History ──────────────────────────────────
  getAmsHistory: (printerId: number, amsId?: number, hours = 24) =>
    request<Record<string, unknown>[]>(`/ams-history/${printerId}${amsId != null ? `/${amsId}` : ''}?hours=${hours}`),

  // ── Spoolman ─────────────────────────────────────
  getSpoolmanStatus: () => request<SpoolmanStatus>('/spoolman/status'),

  connectSpoolman: () =>
    request<Record<string, unknown>>('/spoolman/connect', { method: 'POST' }),

  disconnectSpoolman: () =>
    request<Record<string, unknown>>('/spoolman/disconnect', { method: 'POST' }),

  getSpoolmanSpools: () =>
    request<Record<string, unknown>[]>('/spoolman/spools'),

  getUnlinkedSpools: () =>
    request<UnlinkedSpool[]>('/spoolman/spools/unlinked'),

  getLinkedSpools: () =>
    request<LinkedSpoolsMap>('/spoolman/spools/linked'),

  assignSpoolmanSlot: (data: {
    spoolman_spool_id: number;
    printer_id: number;
    ams_id: number;
    tray_id: number;
  }) =>
    request<InventorySpool>('/spoolman/inventory/slot-assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  unassignSpoolmanSlot: (spoolmanSpoolId: number) =>
    request<InventorySpool>(
      `/spoolman/inventory/slot-assignments/${spoolmanSpoolId}`,
      { method: 'DELETE' },
    ),

  getSpoolmanSlotAssignment: (
    printerId: number,
    amsId: number,
    trayId: number,
  ) =>
    request<InventorySpool | null>(
      `/spoolman/inventory/slot-assignments?printer_id=${printerId}&ams_id=${amsId}&tray_id=${trayId}`,
    ),

  getSpoolmanSlotAssignments: (printerId?: number) =>
    request<
      Array<{
        printer_id: number;
        printer_name: string | null;
        ams_id: number;
        tray_id: number;
        spoolman_spool_id: number;
        ams_label: string | null;
      }>
    >(
      printerId !== undefined
        ? `/spoolman/inventory/slot-assignments/all?printer_id=${printerId}`
        : '/spoolman/inventory/slot-assignments/all',
    ),

  linkSpool: (
    spoolId: number,
    context: {
      spoolTag: string;
      printerId: number;
      amsId: number;
      trayId: number;
    },
  ) =>
    request<void>(`/spoolman/spools/${spoolId}/link`, {
      method: 'POST',
      body: JSON.stringify({
        spool_tag: context.spoolTag,
        printer_id: context.printerId,
        ams_id: context.amsId,
        tray_id: context.trayId,
      }),
    }),

  unlinkSpool: (spoolId: number) =>
    request<void>(`/spoolman/spools/${spoolId}/unlink`, {
      method: 'POST',
    }),

  // ── SpoolBuddy ───────────────────────────────────
  getSpoolBuddyDevices: () =>
    request<Record<string, unknown>[]>('/spoolbuddy/devices'),

  getSpoolBuddyDevice: (id: string) =>
    request<Record<string, unknown>>(`/spoolbuddy/devices/${id}`),

  writeSpoolBuddyTag: (deviceId: string, data: Record<string, unknown>) =>
    request<void>('/spoolbuddy/nfc/write-tag', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, ...data }),
    }),

  calibrateSpoolBuddy: (deviceId: string) =>
    request<void>(`/spoolbuddy/devices/${deviceId}/calibration/tare`, {
      method: 'POST',
    }),

  // ── Obico (AI failure detection) ─────────────────
  getObicoStatus: () => request<Record<string, unknown>>('/obico/status'),

  testObicoConnection: (url: string) =>
    request<Record<string, unknown>>('/obico/test-connection', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  updateObicoSettings: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/obico/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── Stats ────────────────────────────────────────
  getStats: (params?: {
    dateFrom?: string;
    dateTo?: string;
    createdById?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.dateFrom) p.set('date_from', params.dateFrom);
    if (params?.dateTo) p.set('date_to', params.dateTo);
    if (params?.createdById) p.set('created_by_id', String(params.createdById));
    return request<Record<string, unknown>>(`/archives/stats?${p}`);
  },

  // ── Printing (from archive/library/file) ────────
  printArchive: (archiveId: number, data: Record<string, unknown>) =>
    api.addToQueue({
      archive_id: archiveId,
      ...data,
    }),

  printLibraryFile: (fileId: number, data: Record<string, unknown>) =>
    api.addToQueue({
      library_file_id: fileId,
      ...data,
    }),

  printPrinterFile: (printerId: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/printers/${printerId}/print`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  startPrint: (
    printerId: number,
    fileId: number,
    options: Record<string, unknown> = {},
  ) =>
    api.printLibraryFile(fileId, {
      printer_id: printerId,
      ...options,
    }),

  // ── Discovery ────────────────────────────────────
  discoverPrinters: (duration: number = 10) =>
    api.startDiscovery(duration),

  getDiscoveryInfo: () =>
    request<DiscoveryInfo>('/discovery/info'),

  getDiscoveryStatus: () =>
    request<DiscoveryStatus>('/discovery/status'),

  startDiscovery: (duration: number = 10) =>
    request<DiscoveryStatus>(`/discovery/start?duration=${duration}`, {
      method: 'POST',
    }),

  stopDiscovery: () =>
    request<DiscoveryStatus>('/discovery/stop', { method: 'POST' }),

  getDiscoveredPrinters: () =>
    request<DiscoveredPrinter[]>('/discovery/printers'),

  startSubnetScan: (subnet: string, timeout: number = 1.0) =>
    request<SubnetScanStatus>('/discovery/scan', {
      method: 'POST',
      body: JSON.stringify({ subnet, timeout }),
    }),

  stopSubnetScan: () =>
    request<SubnetScanStatus>('/discovery/scan/stop', { method: 'POST' }),

  getSubnetScanStatus: () =>
    request<SubnetScanStatus>('/discovery/scan/status'),

  // ── Connection Diagnostics ─────────────────────────
  diagnoseConnection: (data: { ip_address: string; serial_number?: string; access_code?: string }) =>
    request<PrinterDiagnosticResult>('/printers/diagnostic', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Shopping List ──────────────────────────────────
  getShoppingList: () =>
    request<Record<string, unknown>[]>('/inventory/shopping-list'),

  addShoppingListItem: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/shopping-list', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateShoppingListItem: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/shopping-list/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteShoppingListItem: (id: number) =>
    request<void>(`/inventory/shopping-list/${id}`, { method: 'DELETE' }),

  // ── Inventory Extras ───────────────────────────────
  createSpoolFromSlot: (printerId: number, amsId: number, trayId: number) =>
    request<Record<string, unknown>>('/inventory/from-slot', {
      method: 'POST',
      body: JSON.stringify({ printer_id: printerId, ams_id: amsId, tray_id: trayId }),
    }),

  syncAmsWeights: (printerId: number) =>
    request<void>(`/inventory/sync-ams/${printerId}`, { method: 'POST' }),

  // ── Notification Templates ─────────────────────────
  getNotificationTemplates: () =>
    requestWithFallback<Record<string, unknown>[]>(
      { endpoint: '/notification-templates' },
      { endpoint: '/notifications/templates' },
    ),

  updateNotificationTemplate: (id: string, data: Record<string, unknown>) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/notification-templates/${id}`,
        options: {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      },
      {
        endpoint: `/notifications/templates/${id}`,
        options: {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      },
    ),

  resetNotificationTemplate: (id: string) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/notification-templates/${id}/reset`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/notifications/templates/${id}/reset`,
        options: { method: 'POST' },
      },
    ),

  getMaintenanceHistory: (itemId: number) =>
    request<Record<string, unknown>[]>(`/maintenance/items/${itemId}/history`),

  // ── Labels ─────────────────────────────────────────
  getLabelTemplates: () =>
    request<Record<string, unknown>[]>('/labels/templates'),

  renderLabel: (templateId: string, data: Record<string, unknown>) =>
    request<{ image_url: string }>('/labels/render', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, ...data }),
    }),

  // ── Library Extras ─────────────────────────────────
  extractZip: (fileId: number, folderId?: number | null) =>
    request<void>('/library/files/extract', {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, folder_id: folderId }),
    }),

  getLibraryTrashSettings: () =>
    request<Record<string, unknown>>('/library/trash/settings'),

  updateLibraryTrashSettings: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/library/trash/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // ── Pending Uploads ──────────────────────────────
  getPendingUploads: () =>
    request<Record<string, unknown>[]>('/pending-uploads/'),
};
