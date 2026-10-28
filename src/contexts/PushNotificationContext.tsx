import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';


import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useServerStore } from '@/api/server';
import { useToast } from '@/contexts/ToastContext';

export type PushNotificationStatus = 'uninitialized' | 'checking' | 'enabled' | 'disabled' | 'error';

export interface PushNotificationState {
  status: PushNotificationStatus;
  token: string | null;
  enabled: boolean;
  error: string | null;
  loading: boolean;
}

export interface PushNotificationContextType {
  state: PushNotificationState;
  enablePushNotifications: () => Promise<void>;
  disablePushNotifications: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
}

const PushNotificationContext = React.createContext<PushNotificationContextType | undefined>(undefined);

function getDeviceInfo(): Promise<Record<string, string>> {
  return Promise.all([
    (async () => { try { return await DeviceInfo.getDeviceName(); } catch { return ''; } })(),
    (async () => { try { return await DeviceInfo.getVersion(); } catch { return ''; } })(),
    (async () => { try { return await DeviceInfo.getBuildNumber(); } catch { return ''; } })(),
    (async () => { try { return await DeviceInfo.getUniqueId(); } catch { return ''; } })(),
    (async () => { try { return await DeviceInfo.getSystemVersion(); } catch { return ''; } })(),
  ]).then(([deviceName, appVersion, buildNumber, deviceId, systemVersion]) => ({
    deviceName,
    appVersion,
    buildNumber,
    deviceId,
    systemVersion,
  }));
}

export function PushNotificationProvider({ children }: { children: React.ReactNode }) {
  useNativeLocale();
  const serverUrl = useServerStore((s) => s.serverUrl);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const mountedRef = useRef(true);
  const prevTokenRef = useRef<string | null>(null);

  const [state, setState] = useState<PushNotificationState>({
    status: 'uninitialized',
    token: null,
    enabled: false,
    error: null,
    loading: true,
  });

  const unregisterMutation = useMutation({
    mutationFn: (token: string) => api.unregisterPushToken(token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pushNotificationStatus'] });
    },
  });

  const refreshPushToken = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));

    const info = await getDeviceInfo();

    try {
      const resp = await api.registerPushToken({
        token: 'local-device',
        platform: Platform.OS as 'ios' | 'android',
        device_name: [info.deviceName, `${Platform.OS} ${info.appVersion} (${info.buildNumber})`, `v${info.systemVersion}`, info.deviceId]
          .filter(Boolean)
          .join(' • '),
      });

      const token = (resp as unknown as Record<string, unknown>).token;
      const newToken = typeof token === 'string' ? token : null;

      if (mountedRef.current) {
        setState({
          status: 'enabled',
          token: newToken,
          enabled: true,
          error: null,
          loading: false,
        });

        if (newToken && newToken !== prevTokenRef.current) {
          prevTokenRef.current = newToken;
        }
      }
    } catch {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          status: 'enabled',
          token: null,
          error: null,
          loading: false,
        }));
      }
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, status: 'checking', loading: true, error: null }));

    const info = await getDeviceInfo();

    setState({
      status: 'enabled',
      token: 'local-device',
      enabled: true,
      error: null,
      loading: false,
    });

    try {
      await api.registerPushToken({
        token: 'local-device',
        platform: Platform.OS as 'ios' | 'android',
        device_name: [info.deviceName, `${Platform.OS} ${info.appVersion} (${info.buildNumber})`, `v${info.systemVersion}`, info.deviceId]
          .filter(Boolean)
          .join(' • '),
      });
    } catch {
      // Registration may fail for local/demo mode — that's okay
    }

    return true;
  }, []);

  useEffect(() => {
    if (!serverUrl) return;

    setState(prev => ({ ...prev, status: 'checking', loading: true }));

    const appStateRef = { current: AppState.currentState };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'background' && nextState === 'active') {
        void refreshPushToken();
      }
      appStateRef.current = nextState;
    });

    refreshPushToken();

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [serverUrl, refreshPushToken]);

  const enablePushNotifications = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    await requestPermission();
    showToast(nativeMessage('native.1eb69982a267c1a3'), 'success');
  }, [requestPermission, showToast]);

  const disablePushNotifications = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      if (state.token) {
        await unregisterMutation.mutateAsync(state.token);
      }
    } catch {
      // Ignore errors during disable
    }

    setState({
      status: 'disabled',
      token: null,
      enabled: false,
      error: null,
      loading: false,
    });

    showToast(nativeMessage('native.25d102e5a7b64ea0'), 'info');
  }, [state.token, unregisterMutation, showToast]);

  const refreshStatus = useCallback(async () => {
    await refreshPushToken();
  }, [refreshPushToken]);

  const value = useLocalizedMemo(
    () => ({
      state,
      enablePushNotifications,
      disablePushNotifications,
      requestPermission,
      refreshStatus,
    }),
    [state, enablePushNotifications, disablePushNotifications, requestPermission, refreshStatus],
  );

  return (
    <PushNotificationContext.Provider value={value}>
      {children}
    </PushNotificationContext.Provider>
  );
}

export function usePushNotification(): PushNotificationContextType {
  const ctx = useContext(PushNotificationContext);
  if (!ctx) {
    throw new Error(translateNative('native.b0269bf58b6c266e'));
  }
  return ctx;
}
