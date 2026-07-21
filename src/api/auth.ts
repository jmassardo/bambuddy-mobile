import type {
  AdvancedAuthStatus,
  AuthenticatedLoginResponse,
  AuthenticatedUserResponse,
  BackupCodesResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LDAPStatus,
  LDAPTestResponse,
  LoginResponse,
  OIDCLink,
  OIDCProvider,
  OIDCProviderCreate,
  SMTPSettings,
  TestSMTPRequest,
  TestSMTPResponse,
  TOTPEnableResponse,
  TOTPSetupResponse,
  TwoFAStatus,
} from '@/types/api';
import { buildMediaUrl, checkAuthStatus, MEDIA_TOKEN_SCOPE, request } from './http';

export const authApi = {
  getAuthStatus: async () => checkAuthStatus(),

  login: async (data: { username: string; password: string }) =>
    request<AuthenticatedLoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verify2FA: async (data: {
    pre_auth_token: string;
    code: string;
    method?: string;
  }) =>
    request<AuthenticatedLoginResponse>('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: async () => request<void>('/auth/logout', { method: 'POST' }),

  getCurrentUser: async () =>
    request<AuthenticatedUserResponse>('/auth/me'),

  setupAuth: async (data: { username: string; password: string }) =>
    request<{ access_token: string; token_type: string }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getWebSocketToken: async () =>
    request<{ token: string }>('/auth/ws-token', { method: 'POST' }),

  get2FAStatus: async () => request<TwoFAStatus>('/auth/2fa/status'),

  getAdvancedAuthStatus: async () =>
    request<AdvancedAuthStatus>('/auth/advanced-auth/status'),

  getLDAPStatus: async () => request<LDAPStatus>('/auth/ldap/status'),

  testSMTP: async (data: TestSMTPRequest) =>
    request<TestSMTPResponse>('/auth/smtp/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSMTPSettings: async () => request<SMTPSettings | null>('/auth/smtp'),

  saveSMTPSettings: async (data: SMTPSettings) =>
    request<{ message: string }>('/auth/smtp', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  enableAdvancedAuth: async () =>
    request<{ message: string; advanced_auth_enabled: boolean }>(
      '/auth/advanced-auth/enable',
      { method: 'POST' },
    ),

  disableAdvancedAuth: async () =>
    request<{ message: string; advanced_auth_enabled: boolean }>(
      '/auth/advanced-auth/disable',
      { method: 'POST' },
    ),

  testLDAP: async () =>
    request<LDAPTestResponse>('/auth/ldap/test', {
      method: 'POST',
    }),

  searchLDAPDirectory: async (query: string) =>
    request<Record<string, unknown>[]>(
      `/auth/ldap/search?q=${encodeURIComponent(query)}`,
    ),

  provisionLDAPUser: async (username: string) =>
    request<Record<string, unknown>>('/auth/ldap/provision', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  forgotPassword: async (data: ForgotPasswordRequest) =>
    request<ForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  forgotPasswordConfirm: async (token: string, newPassword: string) =>
    request<ForgotPasswordResponse>('/auth/forgot-password/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  resetUserPassword: async (data: { user_id: number }) =>
    request<Record<string, unknown>>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  setupTOTP: async () =>
    request<TOTPSetupResponse>('/auth/2fa/totp/setup', { method: 'POST' }),

  enableTOTP: async (code: string) =>
    request<TOTPEnableResponse>('/auth/2fa/totp/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  disableTOTP: async (code: string) =>
    request<{ message: string }>('/auth/2fa/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  regenerateBackupCodes: async (code: string) =>
    request<BackupCodesResponse>('/auth/2fa/totp/regenerate-backup-codes', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  enableEmailOTP: async () =>
    request<{ message: string; setup_token: string }>(
      '/auth/2fa/email/enable',
      { method: 'POST' },
    ),

  confirmEnableEmailOTP: async (setupToken: string, code: string) =>
    request<{ message: string }>('/auth/2fa/email/enable/confirm', {
      method: 'POST',
      body: JSON.stringify({ setup_token: setupToken, code }),
    }),

  disableEmailOTP: async (password: string) =>
    request<{ message: string }>('/auth/2fa/email/disable', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  getOIDCProviders: async () => request<OIDCProvider[]>('/auth/oidc/providers'),

  getOIDCProvidersAll: async () =>
    request<OIDCProvider[]>('/auth/oidc/providers/all'),

  createOIDCProvider: async (data: OIDCProviderCreate) =>
    request<OIDCProvider>('/auth/oidc/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateOIDCProvider: async (id: number, data: Partial<OIDCProviderCreate>) =>
    request<OIDCProvider>(`/auth/oidc/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteOIDCProvider: async (id: number) =>
    request<{ message: string }>(`/auth/oidc/providers/${id}`, {
      method: 'DELETE' },
    ),

  getOIDCProviderIconUrl: (id: number): string =>
    buildMediaUrl(`/auth/oidc/providers/${id}/icon`),

  deleteOIDCProviderIcon: async (id: number) =>
    request<void>(`/auth/oidc/providers/${id}/icon`, { method: 'DELETE' }),

  refreshOIDCProviderIcon: async (id: number) =>
    request<OIDCProvider>(`/auth/oidc/providers/${id}/icon/refresh`, {
      method: 'POST',
    }),

  getOIDCAuthorizeUrl: async (providerId: number, state?: string) => {
    const query = state ? `?state=${encodeURIComponent(state)}` : '';
    return request<{ auth_url: string }>(
      `/auth/oidc/authorize/${providerId}${query}`,
    );
  },

  exchangeOIDCToken: async (oidcToken: string) =>
    request<LoginResponse>('/auth/oidc/exchange', {
      method: 'POST',
      body: JSON.stringify({ oidc_token: oidcToken }),
    }),

  getOIDCLinks: async () => request<OIDCLink[]>('/auth/oidc/links'),

  deleteOIDCLink: async (providerId: number) =>
    request<{ message: string }>(`/auth/oidc/links/${providerId}`, {
      method: 'DELETE',
    }),

  getUserEmailPreferences: async () =>
    request<Record<string, unknown>>('/user-notifications/preferences'),

  updateUserEmailPreferences: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/user-notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getUsers: async () =>
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

  getUser: async (id: number) => request<Record<string, unknown>>(`/users/${id}`),

  createUser: async (data: {
    username: string;
    password?: string;
    email?: string;
    group_ids?: number[];
  }) =>
    request<Record<string, unknown>>('/users/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteUser: async (id: number) => request<void>(`/users/${id}`, { method: 'DELETE' }),

  getGroups: async () =>
    request<
      { id: number; name: string; is_default: boolean; description?: string }[]
    >('/groups/'),

  getGroup: async (id: number) =>
    request<{
      id: number;
      name: string;
      is_default: boolean;
      description?: string;
      permissions: string[];
      users: { id: number; username: string }[];
    }>(`/groups/${id}`),

  createGroup: async (data: {
    name: string;
    description?: string;
    permissions: string[];
  }) =>
    request<Record<string, unknown>>('/groups/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateGroup: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteGroup: async (id: number) => request<void>(`/groups/${id}`, { method: 'DELETE' }),

  getPermissions: async () => request<{ permissions: string[] }>('/groups/permissions'),

  getApiKeys: async () => request<Record<string, unknown>[]>('/api-keys/'),

  createApiKey: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api-keys/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteApiKey: async (id: number) => request<void>(`/api-keys/${id}`, { method: 'DELETE' }),

  getCameraTokens: async () => request<Record<string, unknown>[]>('/auth/tokens'),

  createCameraToken: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteCameraToken: async (id: number) =>
    request<void>(`/auth/tokens/${id}`, { method: 'DELETE' }),

  listMyLongLivedCameraTokens: async () =>
    request<Record<string, unknown>[]>('/auth/tokens'),

  listAllLongLivedCameraTokens: async () =>
    request<Record<string, unknown>[]>('/auth/tokens/all'),

  createLongLivedCameraToken: async (payload: {
    name: string;
    expires_in_days: number;
  }) =>
    request<Record<string, unknown>>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({ ...payload, scope: MEDIA_TOKEN_SCOPE }),
    }),

  revokeLongLivedCameraToken: async (tokenId: number) =>
    request<void>(`/auth/tokens/${tokenId}`, { method: 'DELETE' }),
};
