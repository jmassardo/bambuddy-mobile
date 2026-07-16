// Bambuddy Mobile API Client
// Ported from the web frontend's client.ts — same endpoints, adapted for React Native
// Uses the server URL from ServerStore instead of relative paths

import * as Keychain from 'react-native-keychain';
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

    throw new ApiError(message, response.status, code, structuredDetail);
  }

  const contentLength = response.headers.get('content-length');
  if (response.status === 204 || contentLength === '0') {
    return undefined as T;
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

  get2FAStatus: () =>
    request<{
      totp_enabled: boolean;
      email_otp_enabled: boolean;
      backup_codes_remaining: number;
    }>('/auth/2fa/status'),

  getAdvancedAuthStatus: () =>
    request<Record<string, unknown>>('/auth/advanced-auth/status'),

  getLDAPStatus: () => request<Record<string, unknown>>('/auth/ldap/status'),

  searchLDAPDirectory: (query: string) =>
    request<Record<string, unknown>[]>(
      `/auth/ldap/search?q=${encodeURIComponent(query)}`,
    ),

  provisionLDAPUser: (username: string) =>
    request<Record<string, unknown>>('/auth/ldap/provision', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  resetUserPassword: (data: { user_id: number }) =>
    request<Record<string, unknown>>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
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
      method: 'PUT',
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
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: number) =>
    request<void>(`/groups/${id}`, { method: 'DELETE' }),

  getPermissions: () =>
    request<{ permissions: string[] }>('/groups/permissions'),

  // ── Printers ─────────────────────────────────────
  getPrinters: () => request<Record<string, unknown>[]>('/printers/'),

  getPrinter: (id: number) =>
    request<Record<string, unknown>>(`/printers/${id}`),

  createPrinter: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/printers/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePrinter: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/printers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePrinter: (id: number) =>
    request<void>(`/printers/${id}`, { method: 'DELETE' }),

  getPrinterStatus: (id: number) =>
    request<Record<string, unknown>>(`/printers/${id}/status`),

  refreshPrinterStatus: (id: number) =>
    request<Record<string, unknown>>(`/printers/${id}/status/refresh`, {
      method: 'POST',
    }),

  connectPrinter: (id: number) =>
    request<void>(`/printers/${id}/connect`, { method: 'POST' }),

  disconnectPrinter: (id: number) =>
    request<void>(`/printers/${id}/disconnect`, { method: 'POST' }),

  stopPrint: (printerId: number) =>
    request<void>(`/printers/${printerId}/stop`, { method: 'POST' }),

  pausePrint: (printerId: number) =>
    request<void>(`/printers/${printerId}/pause`, { method: 'POST' }),

  resumePrint: (printerId: number) =>
    request<void>(`/printers/${printerId}/resume`, { method: 'POST' }),

  clearPlate: (printerId: number) =>
    request<void>(`/printers/${printerId}/clear-plate`, { method: 'POST' }),

  setPrintSpeed: (printerId: number, mode: number) =>
    request<void>(`/printers/${printerId}/speed`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

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
    request<void>(`/printers/${printerId}/fan`, {
      method: 'POST',
      body: JSON.stringify({ fan, speed }),
    }),

  setChamberLight: (printerId: number, on: boolean) =>
    request<void>(`/printers/${printerId}/light`, {
      method: 'POST',
      body: JSON.stringify({ on }),
    }),

  setAirductMode: (printerId: number, mode: 'cooling' | 'heating') =>
    request<void>(`/printers/${printerId}/airduct`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  xyJog: (printerId: number, x: number, y: number) =>
    request<void>(`/printers/${printerId}/jog/xy`, {
      method: 'POST',
      body: JSON.stringify({ x, y }),
    }),

  extruderJog: (printerId: number, distance: number) =>
    request<void>(`/printers/${printerId}/jog/extruder`, {
      method: 'POST',
      body: JSON.stringify({ distance }),
    }),

  homeAxes: (printerId: number, axes: 'z' | 'xy' | 'all' = 'z') =>
    request<void>(`/printers/${printerId}/home`, {
      method: 'POST',
      body: JSON.stringify({ axes }),
    }),

  startDrying: (
    printerId: number,
    amsId: number,
    temp: number,
    duration: number,
    filament: string = '',
    rotateTray: boolean = false,
  ) =>
    request<void>(`/printers/${printerId}/ams/${amsId}/dry`, {
      method: 'POST',
      body: JSON.stringify({
        temp,
        duration,
        filament,
        rotate_tray: rotateTray,
      }),
    }),

  stopDrying: (printerId: number, amsId: number) =>
    request<void>(`/printers/${printerId}/ams/${amsId}/dry`, {
      method: 'DELETE',
    }),

  setAmsFilamentBackup: (printerId: number, enabled: boolean) =>
    request<void>(`/printers/${printerId}/ams/filament-backup`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
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

  selectExtruder: (printerId: number, extruder: number) =>
    request<void>(`/printers/${printerId}/extruder`, {
      method: 'POST',
      body: JSON.stringify({ extruder }),
    }),

  getPrintableObjects: (printerId: number) =>
    request<{ objects: { id: number; name: string; skipped: boolean }[] }>(
      `/printers/${printerId}/printable-objects`,
    ),

  skipObjects: (printerId: number, objectIds: number[]) =>
    request<void>(`/printers/${printerId}/skip-objects`, {
      method: 'POST',
      body: JSON.stringify({ object_ids: objectIds }),
    }),

  clearHMSErrors: (printerId: number) =>
    request<void>(`/printers/${printerId}/hms/clear`, { method: 'POST' }),

  executeHMSAction: (
    printerId: number,
    data: { action: string; attr?: number },
  ) =>
    request<void>(`/printers/${printerId}/hms/action`, {
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
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/printers/${printerId}/camera/snapshot${token}`;
  },

  getCameraStreamUrl: (printerId: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/printers/${printerId}/camera/stream${token}`;
  },

  diagnosePrinterCamera: (printerId: number) =>
    request<Record<string, unknown>>(`/printers/${printerId}/camera/diagnose`, {
      method: 'POST',
    }),

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
    sensorType: string,
    range: string = '6h',
    amsId?: number,
    trayId?: number,
  ) => {
    const params = new URLSearchParams({ type: sensorType, range });
    if (amsId !== undefined) params.set('ams_id', String(amsId));
    if (trayId !== undefined) params.set('tray_id', String(trayId));
    return request<Record<string, unknown>>(
      `/printers/${printerId}/sensor-history?${params}`,
    );
  },

  // MQTT debug
  enableMQTTLogging: (printerId: number) =>
    request<void>(`/printers/${printerId}/mqtt-debug/enable`, {
      method: 'POST',
    }),

  disableMQTTLogging: (printerId: number) =>
    request<void>(`/printers/${printerId}/mqtt-debug/disable`, {
      method: 'POST',
    }),

  getMQTTLogs: (printerId: number) =>
    request<Record<string, unknown>[]>(
      `/printers/${printerId}/mqtt-debug/logs`,
    ),

  clearMQTTLogs: (printerId: number) =>
    request<void>(`/printers/${printerId}/mqtt-debug/logs`, {
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
  }) => {
    const p = new URLSearchParams();
    if (params?.printerId) p.set('printer_id', String(params.printerId));
    if (params?.projectId) p.set('project_id', String(params.projectId));
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.offset) p.set('offset', String(params.offset));
    if (params?.dateFrom) p.set('date_from', params.dateFrom);
    if (params?.dateTo) p.set('date_to', params.dateTo);
    return request<Record<string, unknown>[]>(`/archives/?${p}`);
  },

  getArchive: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}`),

  getArchiveRuns: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}/runs`),

  searchArchives: (
    query: string,
    params?: {
      limit?: number;
      offset?: number;
      dateFrom?: string;
      dateTo?: string;
    },
  ) => {
    const p = new URLSearchParams({ q: query });
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.offset) p.set('offset', String(params.offset));
    if (params?.dateFrom) p.set('date_from', params.dateFrom);
    if (params?.dateTo) p.set('date_to', params.dateTo);
    return request<Record<string, unknown>[]>(`/archives/search?${p}`);
  },

  updateArchive: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/archives/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteArchive: (id: number) =>
    request<void>(`/archives/${id}`, { method: 'DELETE' }),

  toggleFavorite: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}/favorite`, {
      method: 'POST',
    }),

  getArchiveStats: (params?: {
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

  getTags: () => request<{ name: string; count: number }[]>('/archives/tags'),

  getArchiveComparison: (ids: number[]) =>
    request<Record<string, unknown>>(`/archives/compare?ids=${ids.join(',')}`),

  getArchivePlates: (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}/plates`),

  getArchivePlateThumbnail: (id: number, plateIndex: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/archives/${id}/plates/${plateIndex}/thumbnail${token}`;
  },

  getArchiveThumbnail: (id: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/archives/${id}/thumbnail${token}`;
  },

  getArchiveTimelapse: (id: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/archives/${id}/timelapse${token}`;
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
  getQueue: () => request<Record<string, unknown>[]>('/queue/'),

  getQueueHistory: (params?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.offset) p.set('offset', String(params.offset));
    return request<Record<string, unknown>>(`/queue/history?${p}`);
  },

  addToQueue: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/queue/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateQueueItem: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/queue/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteQueueItem: (id: number) =>
    request<void>(`/queue/${id}`, { method: 'DELETE' }),

  reorderQueue: (itemIds: number[]) =>
    request<void>('/queue/reorder', {
      method: 'POST',
      body: JSON.stringify({ item_ids: itemIds }),
    }),

  startQueueItem: (id: number) =>
    request<void>(`/queue/${id}/start`, { method: 'POST' }),

  cancelQueueItem: (id: number) =>
    request<void>(`/queue/${id}/cancel`, { method: 'POST' }),

  retryQueueItem: (id: number) =>
    request<void>(`/queue/${id}/retry`, { method: 'POST' }),

  getQueueTimeline: () => request<Record<string, unknown>[]>('/queue/timeline'),

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
    return request<Record<string, unknown>[]>(`/library/${query ? `?${query}` : ''}`);
  },

  getLibraryFile: (id: number) =>
    request<Record<string, unknown>>(`/library/${id}`),

  createFolder: (data: { name: string; parent_id?: number }) =>
    request<Record<string, unknown>>('/library/folder', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  renameLibraryItem: (id: number, name: string) =>
    request<Record<string, unknown>>(`/library/${id}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  moveLibraryItem: (id: number, folderId: number | null) =>
    request<Record<string, unknown>>(`/library/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ folder_id: folderId }),
    }),

  deleteLibraryItem: (id: number) =>
    request<void>(`/library/${id}`, { method: 'DELETE' }),

  uploadLibraryFile: (
    file: { uri: string; name: string; type: string },
    folderId?: number,
  ) => {
    const endpoint = folderId
      ? `/library/upload?folder_id=${folderId}`
      : '/library/upload';
    return uploadFile<Record<string, unknown>>(endpoint, file);
  },

  getLibraryFilePlates: (id: number) =>
    request<Record<string, unknown>>(`/library/${id}/plates`),

  getLibraryFilePlateThumbnail: (id: number, plateIndex: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/library/${id}/plates/${plateIndex}/thumbnail${token}`;
  },

  getLibraryFileThumbnailUrl: (id: number): string => {
    const serverUrl = getServerUrl();
    const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return `${serverUrl}/api/v1/library/files/${id}/thumbnail${token}`;
  },

  getLibraryTags: () =>
    request<{ name: string; count: number }[]>('/library/tags'),

  getLibraryStats: () => request<Record<string, unknown>>('/library/stats'),

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
    request<Record<string, unknown>[]>(
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
    request<void>('/inventory/spools/assign', {
      method: 'POST',
      body: JSON.stringify({
        spool_id: spoolId,
        printer_id: printerId,
        ams_id: amsId,
        tray_id: trayId,
      }),
    }),

  unassignSpool: (printerId: number, amsId: number, trayId: number) =>
    request<void>('/inventory/spools/unassign', {
      method: 'POST',
      body: JSON.stringify({
        printer_id: printerId,
        ams_id: amsId,
        tray_id: trayId,
      }),
    }),

  getSpoolAssignments: () =>
    request<Record<string, unknown>[]>('/inventory/spools/assignments'),

  getSpoolCatalog: () =>
    request<Record<string, unknown>[]>('/inventory/spool-catalog'),

  createSpoolCatalogEntry: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/spool-catalog', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSpoolCatalogEntry: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/spool-catalog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSpoolCatalogEntry: (id: number) =>
    request<void>(`/inventory/spool-catalog/${id}`, { method: 'DELETE' }),

  getColorCatalog: () =>
    request<Record<string, unknown>[]>('/inventory/color-catalog'),

  createColorCatalogEntry: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/color-catalog', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateColorCatalogEntry: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/color-catalog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteColorCatalogEntry: (id: number) =>
    request<void>(`/inventory/color-catalog/${id}`, { method: 'DELETE' }),

  getLocations: () =>
    request<Record<string, unknown>[]>('/inventory/locations'),

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

  getAssignments: (printerId?: number) =>
    request<Record<string, unknown>[]>(
      `/inventory/assignments${printerId ? `?printer_id=${printerId}` : ''}`,
    ),

  // ── Maintenance ──────────────────────────────────
  getMaintenanceTasks: () =>
    request<Record<string, unknown>[]>('/maintenance/'),

  getMaintenanceTask: (id: number) =>
    request<Record<string, unknown>>(`/maintenance/${id}`),

  createMaintenanceTask: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/maintenance/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMaintenanceTask: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/maintenance/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteMaintenanceTask: (id: number) =>
    request<void>(`/maintenance/${id}`, { method: 'DELETE' }),

  completeMaintenanceTask: (id: number) =>
    request<Record<string, unknown>>(`/maintenance/${id}/complete`, {
      method: 'POST',
    }),

  getMaintenanceOverview: () =>
    request<Record<string, unknown>[]>('/maintenance/overview'),

  updateMaintenanceItem: (
    itemId: number,
    data: {
      custom_interval_hours?: number | null;
      custom_interval_type?: 'hours' | 'days' | null;
      enabled?: boolean;
    },
  ) =>
    request<Record<string, unknown>>(`/maintenance/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  performMaintenance: (itemId: number, notes?: string) =>
    request<Record<string, unknown>>(`/maintenance/items/${itemId}/perform`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

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
    request<Record<string, unknown>[]>('/notifications/providers'),

  createNotificationProvider: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/notifications/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateNotificationProvider: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/notifications/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteNotificationProvider: (id: number) =>
    request<void>(`/notifications/providers/${id}`, { method: 'DELETE' }),

  testNotificationProvider: (id: number) =>
    request<void>(`/notifications/providers/${id}/test`, { method: 'POST' }),

  getNotificationLog: (params?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.offset) p.set('offset', String(params.offset));
    return request<Record<string, unknown>>(`/notifications/log?${p}`);
  },

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

  getCloudProfiles: () => request<Record<string, unknown>[]>('/cloud/profiles'),

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

  getLocalPresets: () => request<Record<string, unknown>[]>('/presets/local'),

  getKProfiles: () => request<Record<string, unknown>[]>('/kprofiles/'),

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
    request<Record<string, unknown>>(
      `/makerworld/resolve?url=${encodeURIComponent(url)}`,
    ),

  importMakerworldPlate: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/makerworld/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMakerworldRecentImports: () =>
    request<Record<string, unknown>[]>('/makerworld/recent'),

  // ── Virtual Printers ─────────────────────────────
  getVirtualPrinters: () =>
    request<Record<string, unknown>[]>('/virtual-printers/'),

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
    request<void>(`/virtual-printers/${id}/start`, { method: 'POST' }),

  stopVirtualPrinter: (id: number) =>
    request<void>(`/virtual-printers/${id}/stop`, { method: 'POST' }),

  // ── Slicer ───────────────────────────────────────
  getSlicerPresets: () => request<Record<string, unknown>[]>('/slicer/presets'),

  startSliceJob: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/slicer/slice', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSliceJobProgress: (requestId: string) =>
    request<Record<string, unknown> | null>(`/slicer/progress/${requestId}`),

  getSlicerBundles: () => request<Record<string, unknown>[]>('/slicer/bundles'),

  // ── Slicer Pipelines ─────────────────────────────
  getPipelines: () => request<Record<string, unknown>[]>('/slicer/pipelines'),

  getPipeline: (id: number) =>
    request<Record<string, unknown>>(`/slicer/pipelines/${id}`),

  createPipeline: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/slicer/pipelines', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePipeline: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/slicer/pipelines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePipeline: (id: number) =>
    request<void>(`/slicer/pipelines/${id}`, { method: 'DELETE' }),

  runPipeline: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/slicer/pipelines/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPipelineRuns: (pipelineId?: number) => {
    const p = pipelineId ? `?pipeline_id=${pipelineId}` : '';
    return request<Record<string, unknown>[]>(`/slicer/pipeline-runs${p}`);
  },

  cancelPipelineRun: (runId: number) =>
    request<void>(`/slicer/pipeline-runs/${runId}/cancel`, { method: 'POST' }),

  retryPipelineRun: (runId: number) =>
    request<void>(`/slicer/pipeline-runs/${runId}/retry`, { method: 'POST' }),

  // ── Smart Plugs ──────────────────────────────────
  getSmartPlugs: () => request<Record<string, unknown>[]>('/smart-plugs/'),

  createSmartPlug: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/smart-plugs/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSmartPlug: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/smart-plugs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSmartPlug: (id: number) =>
    request<void>(`/smart-plugs/${id}`, { method: 'DELETE' }),

  toggleSmartPlug: (id: number, state: boolean) =>
    request<void>(`/smart-plugs/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ state }),
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
  getCameraTokens: () => request<Record<string, unknown>[]>('/camera-tokens/'),

  createCameraToken: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/camera-tokens/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteCameraToken: (id: number) =>
    request<void>(`/camera-tokens/${id}`, { method: 'DELETE' }),

  // ── Backup & Restore ─────────────────────────────
  exportBackup: () => requestBlob('/backup/export'),

  getLocalBackups: () => request<Record<string, unknown>[]>('/backup/local'),

  createLocalBackup: () =>
    request<Record<string, unknown>>('/backup/local', { method: 'POST' }),

  deleteLocalBackup: (filename: string) =>
    request<void>(`/backup/local/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  getLocalBackupStatus: () =>
    request<Record<string, unknown>>('/local-backup/status'),

  triggerLocalBackup: () =>
    request<Record<string, unknown>>('/local-backup/run', {
      method: 'POST',
    }),

  // GitHub backup
  getGitHubBackupStatus: () =>
    request<Record<string, unknown>>('/github-backup/status'),

  triggerGitHubBackup: () =>
    request<Record<string, unknown>>('/github-backup/trigger', {
      method: 'POST',
    }),

  // ── System ───────────────────────────────────────
  getSystemInfo: () => request<Record<string, unknown>>('/system/info'),

  getSystemHealth: () => request<Record<string, unknown>>('/system/health'),

  getStorageUsage: (options?: { refresh?: boolean }) => {
    const p = new URLSearchParams();
    if (options?.refresh) p.set('refresh', 'true');
    return request<Record<string, unknown>>(
      `/system/storage-usage${p.toString() ? `?${p}` : ''}`,
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
    return request<Record<string, unknown>>(`/system/logs?${p}`);
  },

  getDebugLoggingState: () =>
    request<Record<string, unknown>>('/support/debug-logging'),

  setDebugLogging: (enabled: boolean) =>
    request<Record<string, unknown>>('/support/debug-logging', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

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
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteExternalLink: (id: number) =>
    request<void>(`/external-links/${id}`, { method: 'DELETE' }),

  // ── Filament Presets ─────────────────────────────
  getFilamentPresets: () =>
    request<Record<string, unknown>[]>('/filaments/presets'),

  // ── AMS History ──────────────────────────────────
  getAmsHistory: (printerId: number) =>
    request<Record<string, unknown>[]>(`/ams-history/${printerId}`),

  // ── Spoolman ─────────────────────────────────────
  getSpoolmanStatus: () => request<Record<string, unknown>>('/spoolman/status'),

  getSpoolmanSpools: () =>
    request<Record<string, unknown>[]>('/spoolman/spools'),

  // ── SpoolBuddy ───────────────────────────────────
  getSpoolBuddyDevices: () =>
    request<Record<string, unknown>[]>('/spoolbuddy/devices'),

  getSpoolBuddyDevice: (id: string) =>
    request<Record<string, unknown>>(`/spoolbuddy/devices/${id}`),

  writeSpoolBuddyTag: (deviceId: string, data: Record<string, unknown>) =>
    request<void>(`/spoolbuddy/devices/${deviceId}/write-tag`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  calibrateSpoolBuddy: (deviceId: string) =>
    request<void>(`/spoolbuddy/devices/${deviceId}/calibrate`, {
      method: 'POST',
    }),

  // ── Obico (AI failure detection) ─────────────────
  getObicoStatus: () => request<Record<string, unknown>>('/obico/status'),

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
    request<Record<string, unknown>>(`/archives/${archiveId}/print`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  printLibraryFile: (fileId: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/library/${fileId}/print`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  printPrinterFile: (printerId: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/printers/${printerId}/print`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Discovery ────────────────────────────────────
  discoverPrinters: () =>
    request<Record<string, unknown>[]>('/discovery/scan', { method: 'POST' }),

  // ── Pending Uploads ──────────────────────────────
  getPendingUploads: () =>
    request<Record<string, unknown>[]>('/pending-uploads/'),
};
