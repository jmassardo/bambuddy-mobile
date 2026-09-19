import { renderHook } from '@testing-library/react-native';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const mockAddEventListener = jest.fn();
const mockNetInfoState = { isConnected: true, isInternetReachable: true, type: 'wifi' };

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: jest.fn(() => mockNetInfoState),
  addEventListener: jest.fn((cb) => {
    mockAddEventListener(cb);
    return jest.fn();
  }),
}));

describe('useNetworkStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetInfoState.isConnected = true;
    mockNetInfoState.isInternetReachable = true;
    mockNetInfoState.type = 'wifi';
  });

  it('returns network status from useNetInfo hook', async () => {
    const { result } = await renderHook(() => useNetworkStatus());

    expect(result.current).toEqual({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
  });

  it('returns isConnected as false when disconnected', async () => {
    mockNetInfoState.isConnected = false;
    mockNetInfoState.isInternetReachable = false;
    mockNetInfoState.type = 'unknown';

    const { result } = await renderHook(() => useNetworkStatus());

    expect(result.current).toEqual({
      isConnected: false,
      isInternetReachable: false,
      type: 'unknown',
    });
  });

  it('handles LAN-only server: connected but not internet reachable', async () => {
    mockNetInfoState.isConnected = true;
    mockNetInfoState.isInternetReachable = false;
    mockNetInfoState.type = 'wifi';

    const { result } = await renderHook(() => useNetworkStatus());

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isInternetReachable).toBe(false);
  });
});
