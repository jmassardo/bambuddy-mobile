import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function useOffline(): { isOffline: boolean } {
  const { isConnected } = useNetworkStatus();

  return { isOffline: !isConnected };
}
