import { request } from './http';
import type {
  ConnectedApp, ConnectedAppSecret, ConnectAuthorizeInfo, ConnectAuthorizeParams,
  EncryptionStatus, ScopedApiKey, ScopedApiKeyCreate,
} from '@/types/api';

export const authManagementApi = {
  encryptionStatus: () => request<EncryptionStatus>('/auth/encryption-status'),
  listKeys: () => request<ScopedApiKey[]>('/api-keys/'),
  createKey: (data: ScopedApiKeyCreate) =>
    request<ScopedApiKey & { key: string }>('/api-keys/', { method: 'POST', body: JSON.stringify(data) }),
  revokeKey: (id: number) => request<void>(`/api-keys/${id}`, { method: 'DELETE' }),
  listApps: () => request<ConnectedApp[]>('/connect/apps'),
  createApp: (name: string, redirect_uri: string) =>
    request<ConnectedAppSecret>('/connect/apps', { method: 'POST', body: JSON.stringify({ name, redirect_uri }) }),
  updateApp: (id: number, enabled: boolean) =>
    request<ConnectedApp>(`/connect/apps/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  rotateApp: (id: number) => request<ConnectedAppSecret>(`/connect/apps/${id}/rotate-secret`, { method: 'POST' }),
  deleteApp: (id: number) => request<void>(`/connect/apps/${id}`, { method: 'DELETE' }),
  authorizeInfo: (clientId: string, redirectUri: string) =>
    request<ConnectAuthorizeInfo>(`/connect/authorize/info?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`),
  authorize: ({ state: _state, ...data }: ConnectAuthorizeParams) =>
    request<{ code: string; redirect_uri: string }>('/connect/authorize', { method: 'POST', body: JSON.stringify(data) }),
};
