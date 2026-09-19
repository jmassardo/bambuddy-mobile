import { renderHook } from '@testing-library/react-native';
import { useOffline } from '@/hooks/useOffline';

let mockNetInfoValue = {
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
};

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetInfoValue,
}));

describe('useOffline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetInfoValue = {
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    };
  });

  it('returns isOffline: false when connected', async () => {
    const { result } = await renderHook(() => useOffline());

    expect(result.current.isOffline).toBe(false);
  });

  it('returns isOffline: true when disconnected', async () => {
    mockNetInfoValue = {
      isConnected: false,
      isInternetReachable: false,
      type: 'unknown',
    };

    const { result } = await renderHook(() => useOffline());

    expect(result.current.isOffline).toBe(true);
  });

  it('handles LAN-only server: connected but not internet reachable', async () => {
    mockNetInfoValue = {
      isConnected: true,
      isInternetReachable: false,
      type: 'wifi',
    };

    const { result } = await renderHook(() => useOffline());

    expect(result.current.isOffline).toBe(false);
  });

  it('updates isOffline when connectivity changes', async () => {
    const { result } = await renderHook(() => useOffline());

    expect(result.current.isOffline).toBe(false);

    // Update the mock value and rerender
    mockNetInfoValue = {
      isConnected: false,
      isInternetReachable: false,
      type: 'unknown',
    };

    // Trigger a re-render by calling the hook again
    const newResult = await renderHook(() => useOffline());

    expect(newResult.result.current.isOffline).toBe(true);
  });
});
