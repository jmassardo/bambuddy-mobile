import { translateNative, useNativeLocale } from '@/i18n';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, getAuthToken, loadAuthToken, setAuthToken } from '../api/client';
import { useServerStore } from '../api/server';
import type {
  AuthenticatedUserResponse,
  Permission,
} from '@/types/api';

export type UserResponse = AuthenticatedUserResponse;

interface AuthContextType {
  user: UserResponse | null;
  authEnabled: boolean;
  requiresSetup: boolean;
  loading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string, remember?: boolean) => Promise<{
    access_token?: string;
    requires_2fa?: boolean;
    pre_auth_token?: string;
    available_methods?: string[];
    user?: UserResponse;
  }>;
  loginWithToken: (token: string, user: UserResponse, remember?: boolean) => Promise<void>;
  loginWithApiKey: (serverUrl: string, apiKey: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (...permissions: Permission[]) => boolean;
  setServerConnected: (connected: boolean) => void;
  serverConnected: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useNativeLocale();
  const serverUrl = useServerStore((s) => s.serverUrl);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serverConnected, setServerConnected] = useState(false);
  const mountedRef = useRef(true);
  const authVersionRef = useRef(0);
  const enrollingRef = useRef(false);

  const checkAuthStatus = useCallback(async () => {
    if (enrollingRef.current) return;
    const version = ++authVersionRef.current;
    const isCurrent = () => mountedRef.current &&
      version === authVersionRef.current && !enrollingRef.current;
    try {
      await loadAuthToken();
      if (!isCurrent()) return;
      const status = await api.getAuthStatus();
      if (!isCurrent()) return;
      const token = getAuthToken();
      const apiKeySession = token?.startsWith('bb_') ?? false;

      setAuthEnabled(status.auth_enabled || apiKeySession);
      setRequiresSetup(status.requires_setup);
      setServerConnected(true);
      if (!status.auth_enabled && !apiKeySession) {
        setUser(null);
        await setAuthToken(null);
      }

      if (status.auth_enabled || apiKeySession) {
        if (token) {
          try {
            const currentUser = await api.getCurrentUser();
            if (isCurrent()) setUser(apiKeySession
              ? { ...currentUser, role: 'user', is_admin: false, groups: [] }
              : currentUser);
          } catch (err) {
            if (isCurrent() && err instanceof ApiError && err.status === 401) {
              await setAuthToken(null);
              if (isCurrent()) setUser(null);
            }
          }
        }
      }
    } catch {
      if (isCurrent()) {
        setServerConnected(false);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    authVersionRef.current++;
    mountedRef.current = true;
    if (serverUrl) {
      setLoading(true);
      checkAuthStatus();
    } else {
      setLoading(false);
      setUser(null);
      setAuthEnabled(false);
      setRequiresSetup(false);
      setServerConnected(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [checkAuthStatus, serverUrl]);

  const login = useCallback(async (username: string, password: string, remember = true) => {
    const response = await api.login({ username, password });

    if (response.requires_2fa) {
      return {
        requires_2fa: true,
        pre_auth_token: response.pre_auth_token,
        available_methods: response.available_methods ?? response.two_fa_methods,
      };
    }

    await setAuthToken(response.access_token, remember);
    if (mountedRef.current) {
      setUser(response.user);
    }
    return { access_token: response.access_token, user: response.user };
  }, []);

  const loginWithToken = useCallback(async (token: string, newUser: UserResponse, remember = true) => {
    await setAuthToken(token, remember);
    if (mountedRef.current) setUser(newUser);
  }, []);

  const loginWithApiKey = useCallback(async (nextServerUrl: string, apiKey: string) => {
    if (enrollingRef.current) throw new Error(translateNative('scanner.enrollFailed'));
    const previousUrl = useServerStore.getState().serverUrl;
    enrollingRef.current = true;
    authVersionRef.current++;
    let committed = false;
    try {
      const nextUser = await api.validateApiKey(nextServerUrl, apiKey);
      if (!mountedRef.current || useServerStore.getState().serverUrl !== previousUrl) {
        throw new Error(translateNative('scanner.enrollFailed'));
      }
      await useServerStore.getState().setServerUrl(nextServerUrl);
      if (!mountedRef.current || useServerStore.getState().serverUrl !== nextServerUrl) {
        throw new Error(translateNative('scanner.enrollFailed'));
      }
      await setAuthToken(apiKey);
      if (!mountedRef.current || useServerStore.getState().serverUrl !== nextServerUrl) {
        throw new Error(translateNative('scanner.enrollFailed'));
      }
      setUser(nextUser);
      setAuthEnabled(true);
      setRequiresSetup(false);
      setServerConnected(true);
      committed = true;
    } finally {
      enrollingRef.current = false;
      if (mountedRef.current) {
        if (committed) setLoading(false);
        else void checkAuthStatus();
      }
    }
  }, [checkAuthStatus]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore errors during logout
    }
    await setAuthToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (enrollingRef.current) return;
    const version = authVersionRef.current;
    try {
      const currentUser = await api.getCurrentUser();
      if (mountedRef.current && version === authVersionRef.current &&
        !enrollingRef.current) setUser(getAuthToken()?.startsWith('bb_')
        ? { ...currentUser, role: 'user', is_admin: false, groups: [] }
        : currentUser);
    } catch {
      // Ignore
    }
  }, []);

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (!authEnabled) return true;
      if (!user) return false;
      if (user.is_admin) return true;
      if (user.permissions?.includes(permission)) return true;
      return user.groups?.some((g) => g.permissions?.includes(permission)) ?? false;
    },
    [authEnabled, user],
  );

  const hasAnyPermission = useCallback(
    (...permissions: Permission[]): boolean => {
      return permissions.some((p) => hasPermission(p));
    },
    [hasPermission],
  );

  const isAdmin = user?.is_admin ?? false;

  const value = useMemo(
    () => ({
      user,
      authEnabled,
      requiresSetup,
      loading,
      isAdmin,
      login,
      loginWithToken,
      loginWithApiKey,
      logout,
      refreshUser,
      hasPermission,
      hasAnyPermission,
      setServerConnected,
      serverConnected,
      refreshAuth: checkAuthStatus,
    }),
    [user, authEnabled, requiresSetup, loading, isAdmin, login, loginWithToken, loginWithApiKey, logout, refreshUser, hasPermission, hasAnyPermission, serverConnected, checkAuthStatus],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error(translateNative('native.02411d11004370dd'));
  return ctx;
}
