// Push notification registration hook
// Manages push notification token registration with the Bambuddy server.

import { useState, useCallback } from 'react';
import DeviceInfo from 'react-native-device-info';
import { api } from '@/api/client';

export interface PushNotificationRegistration {
  token: string | null;
  registered: boolean;
  error: string | null;
}

export function usePushNotificationRegistration(): PushNotificationRegistration & {
  register: () => Promise<void>;
  unregister: () => Promise<void>;
  refreshing: boolean;
} {
  const [state, setState] = useState<PushNotificationRegistration>({
    token: null,
    registered: false,
    error: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  const register = useCallback(async () => {
    setRefreshing(true);
    try {
      const deviceName = await (async () => { try { return await DeviceInfo.getDeviceName(); } catch { return ''; } })();
      const appVersion = await (async () => { try { return await DeviceInfo.getVersion(); } catch { return ''; } })();
      const buildNumber = await (async () => { try { return await DeviceInfo.getBuildNumber(); } catch { return ''; } })();
      const deviceId = await (async () => { try { return await DeviceInfo.getUniqueId(); } catch { return ''; } })();

      await api.registerPushToken({
        token: 'local-device',
        platform: 'ios',
        device_name: [deviceName, `${appVersion} (${buildNumber})`, deviceId].filter(Boolean).join(' • '),
      });

      setState({ token: 'local-device', registered: true, error: null });
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Registration failed',
      }));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const unregister = useCallback(async () => {
    setRefreshing(true);
    try {
      if (state.token) {
        await api.unregisterPushToken(state.token);
      }
      setState({ token: null, registered: false, error: null });
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unregistration failed',
      }));
    } finally {
      setRefreshing(false);
    }
  }, [state.token]);

  return { ...state, register, unregister, refreshing };
}
