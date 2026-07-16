// Push notification registration and management
// Firebase is not configured yet — this is a no-op stub.
// Replace with @react-native-firebase/messaging when Firebase project is set up.

import { useState } from 'react';

export interface PushNotificationState {
  token: string | null;
  registered: boolean;
  error: string | null;
}

export function usePushNotifications(): PushNotificationState {
  const [state] = useState<PushNotificationState>({
    token: null,
    registered: false,
    error: 'Firebase not configured',
  });

  return state;
}

