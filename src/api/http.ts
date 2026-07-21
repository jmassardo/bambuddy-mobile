import * as Keychain from 'react-native-keychain';
import { apiUrl, registerServerUrlChangeHandler, useServerStore } from './server';

export const AUTH_TOKEN_KEY = 'bambuddy-auth-token';
export const MEDIA_TOKEN_SCOPE = 'camera_stream';

export interface UploadableFile {
  uri: string;
  name: string;
  type: string;
}

export interface AuthStatusResponse {
  auth_enabled: boolean;
  requires_setup: boolean;
}

let authToken: string | null = null;
let mediaToken: string | null = null;
let tokenLoaded = false;
let loadedTokenService: string | null = null;
let mediaTokenServerOrigin: string | null = null;

function getServerOrigin(serverUrl: string): string {
  try {
    return new URL(serverUrl).origin;
  } catch {
    return serverUrl.replace(/\/+$/, '');
  }
}

function getCurrentServerUrl(): string | null {
  return useServerStore.getState().serverUrl;
}

function getAuthTokenService(serverUrl: string | null): string | null {
  if (!serverUrl) return null;
  return `${AUTH_TOKEN_KEY}:${getServerOrigin(serverUrl)}`;
}

async function resetStoredAuthToken(serverUrl: string | null): Promise<void> {
  const service = getAuthTokenService(serverUrl);
  if (!service) return;
  await Keychain.resetGenericPassword({ service });
}

function resetLoadedTokens(): void {
  authToken = null;
  mediaToken = null;
  tokenLoaded = false;
  loadedTokenService = null;
  mediaTokenServerOrigin = null;
}

function getServerUrl(): string {
  const url = useServerStore.getState().serverUrl;
  if (!url) throw new Error('Server URL not configured');
  return url;
}

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

async function refreshMediaToken(): Promise<void> {
  const serverUrl = getCurrentServerUrl();
  if (!authToken || !serverUrl) {
    mediaToken = null;
    mediaTokenServerOrigin = null;
    return;
  }

  try {
    const response = await request<Record<string, unknown>>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({ scope: MEDIA_TOKEN_SCOPE }),
    });
    mediaToken = typeof response.token === 'string' ? response.token : null;
    mediaTokenServerOrigin = getServerOrigin(serverUrl);
  } catch {
    mediaToken = null;
    mediaTokenServerOrigin = null;
  }
}

function getScopedMediaToken(): string | null {
  const serverUrl = getCurrentServerUrl();
  if (!serverUrl) return null;
  const serverOrigin = getServerOrigin(serverUrl);
  if (mediaTokenServerOrigin !== serverOrigin) {
    mediaToken = null;
    mediaTokenServerOrigin = null;
    return null;
  }
  return mediaToken;
}

export function buildMediaUrl(path: string, params?: URLSearchParams): string {
  const serverUrl = getServerUrl();
  const query = new URLSearchParams(params);
  const scopedToken = getScopedMediaToken();
  if (scopedToken) {
    query.set('token', scopedToken);
  }
  const queryString = query.toString();
  return `${serverUrl}/api/v1${path}${queryString ? `?${queryString}` : ''}`;
}

export async function clearAuthTokenForServer(
  serverUrl: string | null,
): Promise<void> {
  resetLoadedTokens();
  try {
    await resetStoredAuthToken(serverUrl);
  } catch {}
}

export async function loadAuthToken(): Promise<string | null> {
  const serverUrl = getCurrentServerUrl();
  const service = getAuthTokenService(serverUrl);
  if (!service) {
    resetLoadedTokens();
    return null;
  }
  if (tokenLoaded && loadedTokenService === service) return authToken;
  try {
    const creds = await Keychain.getGenericPassword({ service });
    authToken = creds ? creds.password : null;
  } catch {
    authToken = null;
  }
  loadedTokenService = service;
  tokenLoaded = true;
  await refreshMediaToken();
  return authToken;
}

export async function setAuthToken(token: string | null): Promise<void> {
  const serverUrl = getCurrentServerUrl();
  const service = getAuthTokenService(serverUrl);
  authToken = token;
  mediaToken = null;
  mediaTokenServerOrigin = null;
  loadedTokenService = service;
  tokenLoaded = true;
  try {
    if (service) {
      if (token) {
        await Keychain.setGenericPassword(service, token, { service });
      } else {
        await Keychain.resetGenericPassword({ service });
      }
    }
  } catch {
    if (token) {
      console.warn('Keychain persistence failed; token is memory-only this session');
    }
  }

  if (token) {
    await refreshMediaToken();
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

registerServerUrlChangeHandler(async (previousUrl, nextUrl) => {
  if (previousUrl === nextUrl) return;
  await clearAuthTokenForServer(previousUrl);
});

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const serverUrl = getServerUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers.Authorization = 'Bearer ' + authToken;
  }

  const response = await fetch(apiUrl(serverUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch((): Record<string, unknown> => ({}));
    const detail = error.detail;
    let message: string;
    let code: string | null = null;

    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      const joined = detail
        .map((entry: { msg?: string }) =>
          (entry.msg ?? '').replace(/^Value error,\s*/i, ''),
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
      if (invalidMessages.some(candidate => message.includes(candidate))) {
        await setAuthToken(null);
      }
    }

    throw new ApiError(message, response.status, code, structuredDetail);
  }

  const contentLength = response.headers.get('content-length');
  if (response.status === 204 || contentLength === '0') {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function checkAuthStatus(): Promise<AuthStatusResponse> {
  return request<AuthStatusResponse>('/auth/status');
}

export async function requestBlob(
  endpoint: string,
  options: RequestInit = {},
): Promise<Blob> {
  const serverUrl = getServerUrl();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (authToken) {
    headers.Authorization = 'Bearer ' + authToken;
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

export async function requestText(
  endpoint: string,
  options: RequestInit = {},
): Promise<string> {
  const serverUrl = getServerUrl();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (authToken) {
    headers.Authorization = 'Bearer ' + authToken;
  }

  const response = await fetch(apiUrl(serverUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch((): Record<string, unknown> => ({}));
    const detail = error.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : typeof detail === 'object' && detail && 'message' in detail
          ? String((detail as { message?: string }).message ?? `HTTP ${response.status}`)
          : `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return response.text();
}

export async function uploadFile<T>(
  endpoint: string,
  file: UploadableFile,
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
    headers.Authorization = 'Bearer ' + authToken;
  }

  const response = await fetch(apiUrl(serverUrl, endpoint), {
    method: 'POST',
    headers,
    body: form,
  });

  if (!response.ok) {
    const error = await response.json().catch((): Record<string, unknown> => ({}));
    const detail = error.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : typeof detail === 'object' && detail && 'message' in detail
          ? String((detail as { message?: string }).message ?? `HTTP ${response.status}`)
          : `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export async function uploadFileWithProgress<T>(
  endpoint: string,
  file: UploadableFile,
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
      xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
    }

    xhr.upload.onprogress = event => {
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
        errorData = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
      } catch {
        errorData = {};
      }

      const detail = errorData.detail;
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

export async function requestWithFallback<T>(
  primary: { endpoint: string; options?: RequestInit },
  fallback: { endpoint: string; options?: RequestInit },
): Promise<T> {
  try {
    return await request<T>(primary.endpoint, primary.options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return request<T>(fallback.endpoint, fallback.options);
    }
    throw error;
  }
}

export async function requestTextWithFallback(
  primary: { endpoint: string; options?: RequestInit },
  fallback: { endpoint: string; options?: RequestInit },
): Promise<string> {
  try {
    return await requestText(primary.endpoint, primary.options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return requestText(fallback.endpoint, fallback.options);
    }
    throw error;
  }
}
