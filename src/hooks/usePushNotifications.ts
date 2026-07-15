// Push notification registration and management
// Uses expo-notifications for FCM (Android) and APNs (iOS)

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { type EventSubscription } from 'expo-modules-core';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
  const notificationListener = useRef<EventSubscription>(null);
  const responseListener = useRef<EventSubscription>(null);

  useEffect(() => {
    if (!user) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        setState({ token, registered: true, error: null });
        // Register token with Bambuddy server
        api.registerPushToken({
          token,
          platform: Platform.OS as 'ios' | 'android',
          device_name: Device.modelName || undefined,
        }).catch((err) => {
          console.warn('Failed to register push token with server:', err);
        });
      }
    });

    // Listen for incoming notifications while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      // Notification received in foreground — handled by the notification handler above
      console.log('[Push] Notification received:', notification.request.content.title);
    });

    // Listen for notification taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      // Navigate based on notification data
      if (data?.printer_id) {
        // Could navigate to printer detail
      } else if (data?.archive_id) {
        // Could navigate to archive detail
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [user]);

  return state;
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Push] Must use physical device for push notifications');
    return null;
  }

  // Check/request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Bambuddy',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10b981',
    });

    await Notifications.setNotificationChannelAsync('print-status', {
      name: 'Print Status',
      description: 'Print completion, failure, and progress notifications',
      importance: Notifications.AndroidImportance.HIGH,
    });

    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Alerts',
      description: 'HMS errors, plate detection, and system alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
    });
  }

  // Get the push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });
    return tokenData.data;
  } catch (error) {
    console.error('[Push] Error getting push token:', error);
    return null;
  }
}
