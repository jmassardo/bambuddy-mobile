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
  login: (username: string, password: string) => Promise<{
    access_token?: string;
    requires_2fa?: boolean;
    pre_auth_token?: string;
    available_methods?: string[];
    user?: UserResponse;
  }>;
  loginWithToken: (token: string, user: UserResponse) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (...permissions: Permission[]) => boolean;
  setServerConnected: (connected: boolean) => void;
  serverConnected: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const serverUrl = useServerStore((s) => s.serverUrl);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serverConnected, setServerConnected] = useState(false);
  const mountedRef = useRef(true);

  const checkAuthStatus = useCallback(async () => {
    try {
      await loadAuthToken();
      const status = await api.getAuthStatus();
      if (!mountedRef.current) return;

      setAuthEnabled(status.auth_enabled);
      setRequiresSetup(status.requires_setup);
      setServerConnected(true);

      if (status.auth_enabled) {
        const token = getAuthToken();
        if (token) {
          try {
            const currentUser = await api.getCurrentUser();
            if (mountedRef.current) setUser(currentUser);
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
              await setAuthToken(null);
            }
          }
        }
      }
    } catch {
      if (mountedRef.current) {
        setServerConnected(false);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.login({ username, password });

    if (response.requires_2fa) {
      return {
        requires_2fa: true,
        pre_auth_token: response.pre_auth_token,
        available_methods: response.available_methods,
      };
    }

    await setAuthToken(response.access_token);
    if (mountedRef.current) {
      setUser(response.user);
    }
    return { access_token: response.access_token, user: response.user };
  }, []);

  const loginWithToken = useCallback((token: string, newUser: UserResponse) => {
    setUser(newUser);
    setAuthToken(token).catch(err => {
      console.warn('Failed to persist auth token:', err);
    });
  }, []);

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
    try {
      const currentUser = await api.getCurrentUser();
      if (mountedRef.current) setUser(currentUser);
    } catch {
      // Ignore
    }
  }, []);

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (!authEnabled) return true;
      if (!user) return false;
      if (user.is_admin) return true;
      return user.groups.some((g) => g.permissions.includes(permission));
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
      logout,
      refreshUser,
      hasPermission,
      hasAnyPermission,
      setServerConnected,
      serverConnected,
    }),
    [user, authEnabled, requiresSetup, loading, isAdmin, login, loginWithToken, logout, refreshUser, hasPermission, hasAnyPermission, serverConnected],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
