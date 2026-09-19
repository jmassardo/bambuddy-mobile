import { useNetInfo, type NetInfoState } from '@react-native-community/netinfo';

export type NetworkStatus = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: NetInfoState['type'] | null;
};

export function useNetworkStatus(): NetworkStatus {
  const netInfo = useNetInfo();

  return {
    isConnected: Boolean(netInfo.isConnected),
    isInternetReachable: netInfo.isInternetReachable,
    type: netInfo.type,
  };
}
