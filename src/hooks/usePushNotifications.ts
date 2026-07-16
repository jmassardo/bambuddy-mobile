// Push notification registration and management
// Uses @react-native-firebase/messaging for FCM (Android) and APNs (iOS)

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import DeviceInfo from 'react-native-device-info';
import { api } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PushNotificationState {
  token: string | null;
  registered: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    token: null,
    registered: false,
    error: null,
  });
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        setState({ token, registered: true, error: null });
        api.registerPushToken({
          token,
          platform: Platform.OS as 'ios' | 'android',
          device_name: DeviceInfo.getModel(),
        }).catch((err) => {
          console.warn('Failed to register push token with server:', err);
        });
      }
    });

    // Listen for incoming notifications while app is open
    const unsubMessage = messaging().onMessage(async (remoteMessage) => {
      console.log('[Push] Notification received:', remoteMessage.notification?.title);
    });

    // Listen for notification taps (app in background)
    const unsubOpen = messaging().onNotificationOpenedApp((remoteMessage) => {
      const data = remoteMessage.data;
      if (data?.printer_id) {
        // Could navigate to printer detail
      } else if (data?.archive_id) {
        // Could navigate to archive detail
      }
    });

    // Check if app was opened by a notification (app was killed)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage?.data?.printer_id) {
          // Navigate to printer detail
        }
      });

    return () => {
      unsubMessage();
      unsubOpen();
    };
  }, [user]);

  return state;
}

async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Request permission (iOS — Android auto-grants for API < 33)
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('[Push] Permission not granted');
      return null;
    }

    // Get the FCM token
    const token = await messaging().getToken();
    return token;
  } catch (error) {
    console.error('[Push] Error getting push token:', error);
    return null;
  }
}
