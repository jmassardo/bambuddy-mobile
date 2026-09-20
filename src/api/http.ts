import * as Keychain from 'react-native-keychain';
import { apiUrl, registerServerUrlChangeHandler, useServerStore } from './server';

export const AUTH_TOKEN_KEY = 'bambuddy-auth-token';
export const MEDIA_TOKEN_SCOPE = 'camera_stream';

/** Default timeout for standard API requests (30 seconds). */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Extended timeout for file uploads and blob downloads (5 minutes). */
export const UPLOAD_TIMEOUT_MS = 300_000;

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
let mediaTokenReady = false;
let mediaTokenVersion = 0;
const mediaTokenListeners = new Set<() => void>();

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
  tokenLoaded = false;
  loadedTokenService = null;
  updateMediaToken(null, null, false);
}

function updateMediaToken(
  token: string | null,
  serverOrigin: string | null,
  ready: boolean,
): void {
  if (
    mediaToken === token &&
    mediaTokenServerOrigin === serverOrigin &&
    mediaTokenReady === ready
  ) {
    return;
  }

  mediaToken = token;
  mediaTokenServerOrigin = serverOrigin;
  mediaTokenReady = ready;
  mediaTokenVersion += 1;
  mediaTokenListeners.forEach(listener => listener());
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

/**
 * Wraps `fetch` with an AbortController-based timeout.
 * - Timeout fires → ApiError with code 'timeout', status 0.
 * - Caller-supplied signal abort → re-thrown as plain AbortError.
 * - Timer is always cleared in `finally`.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let didTimeout = false;

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const onAbort = () => controller.abort();
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (didTimeout) {
        throw new ApiError(
          `Request timed out after ${timeoutMs}ms`,
          0,
          'timeout',
          null,
        );
      }
      throw error;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the response body as text and parses it as JSON.
 * Returns `undefined` for empty bodies.
 * Throws ApiError (code 'invalid_response') for non-JSON content,
 * with body preview truncated to 120 chars to avoid leaking secrets.
 */
async function safeParseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const contentType = response.headers.get('content-type') ?? 'unknown';
    const preview = text.length > 120 ? text.slice(0, 120) + '…' : text;
    throw new ApiError(
      `Expected JSON response but received ${contentType}: ${preview}`,
      response.status,
      'invalid_response',
      null,
    );
  }
}

async function refreshMediaToken(): Promise<boolean> {
  const serverUrl = getCurrentServerUrl();
  if (!serverUrl) {
    updateMediaToken(null, null, false);
    return false;
  }

  const serverOrigin = getServerOrigin(serverUrl);
  if (!authToken) {
    updateMediaToken(null, serverOrigin, true);
    return true;
  }

  try {
    const response = await request<Record<string, unknown>>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({ scope: MEDIA_TOKEN_SCOPE }),
    });
    updateMediaToken(
      typeof response.token === 'string' ? response.token : null,
      serverOrigin,
      true,
    );
    return true;
  } catch {
    updateMediaToken(null, serverOrigin, true);
    return false;
  }
}

export function getScopedMediaToken(): string | null {
  const serverUrl = getCurrentServerUrl();
  if (!serverUrl) return null;
  const serverOrigin = getServerOrigin(serverUrl);
  return mediaTokenServerOrigin === serverOrigin ? mediaToken : null;
}

export function isScopedMediaTokenReady(): boolean {
  const serverUrl = getCurrentServerUrl();
  if (!serverUrl) return false;
  return (
    mediaTokenReady &&
    mediaTokenServerOrigin === getServerOrigin(serverUrl)
  );
}

export function subscribeToMediaToken(listener: () => void): () => void {
  mediaTokenListeners.add(listener);
  return () => mediaTokenListeners.delete(listener);
}

export function getMediaTokenVersion(): number {
  return mediaTokenVersion;
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

export async function getCameraStreamToken(): Promise<{ token: string | null }> {
  if (!getScopedMediaToken() && getAuthToken()) {
    const refreshed = await refreshMediaToken();
    if (!refreshed) {
      throw new ApiError(
        'Unable to fetch a media access token',
        0,
        'media_token_unavailable',
      );
    }
  }
  return { token: getScopedMediaToken() };
}

export function setStreamToken(token: string | null): void {
  const serverUrl = getCurrentServerUrl();
  updateMediaToken(
    token,
    serverUrl ? getServerOrigin(serverUrl) : null,
    Boolean(serverUrl),
  );
}

export function withStreamToken(url: string): string {
  const scopedToken = getScopedMediaToken();
  if (!scopedToken) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('token', scopedToken);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(scopedToken)}`;
  }
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
  updateMediaToken(null, null, false);
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

  const response = await fetchWithTimeout(apiUrl(serverUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await safeParseJson<Record<string, unknown>>(response).catch(
      () => ({} as Record<string, unknown>),
    );
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
      const detailObj = detail as Record<string, unknown>;
      code = typeof detailObj.code === 'string' ? detailObj.code : null;
      message =
        typeof detailObj.message === 'string'
          ? detailObj.message
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

  return safeParseJson<T>(response);
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

  const response = await fetchWithTimeout(
    apiUrl(serverUrl, endpoint),
    {
      ...options,
      headers,
    },
    UPLOAD_TIMEOUT_MS,
  );

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

  const response = await fetchWithTimeout(apiUrl(serverUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await safeParseJson<Record<string, unknown>>(response).catch(
      () => ({} as Record<string, unknown>),
    );
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

  const response = await fetchWithTimeout(
    apiUrl(serverUrl, endpoint),
    {
      method: 'POST',
      headers,
      body: form,
    },
    UPLOAD_TIMEOUT_MS,
  );

  if (!response.ok) {
    const error = await safeParseJson<Record<string, unknown>>(response).catch(
      () => ({} as Record<string, unknown>),
    );
    const detail = error.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : typeof detail === 'object' && detail && 'message' in detail
          ? String((detail as { message?: string }).message ?? `HTTP ${response.status}`)
          : `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return safeParseJson<T>(response);
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

    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.ontimeout = () => {
      reject(new ApiError('Upload timed out', 0, 'timeout', null));
    };

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
