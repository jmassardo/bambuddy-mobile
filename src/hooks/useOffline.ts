import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return Boolean(navigator.onLine);
  }
  return true;
}

export function useOffline(): { isOffline: boolean } {
  const [isOffline, setIsOffline] = useState(!isOnline());

  useEffect(() => {
    setIsOffline(!isOnline());

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        setIsOffline(!isOnline());
      }
    };

    try {
      appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    } catch {
      // AppState.addEventListener may not be available in all test environments
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      appStateSubscription?.remove();
    };
  }, []);

  return { isOffline };
}
