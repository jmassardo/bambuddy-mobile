import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CameraScreen, { CAMERA_STREAM_TIMEOUT_MS } from '@/screens/CameraScreen';

const mockInvalidateQueries = jest.fn(() => Promise.resolve());
const mockDiagnoseMutate = jest.fn();
const mockDiagnoseReset = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useRoute: () => ({
    params: { id: '1' },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
  useQuery: ({ queryKey }: { queryKey: Array<string | number> }) => {
    if (queryKey[0] === 'printer') {
      return {
        data: {
          id: 1,
          name: 'Printer One',
          ip_address: '192.168.1.10',
          ipcam: true,
        },
        isLoading: false,
      };
    }
    if (queryKey[0] === 'printerStatus') {
      return {
        data: {
          connected: true,
          ipcam: true,
          state: 'RUNNING',
          progress: 4,
          layer_num: 1,
          total_layers: 100,
        },
        isLoading: false,
      };
    }
    return {
      data: undefined,
      isLoading: false,
      isError: false,
    };
  },
  useMutation: () => ({
    data: null,
    isPending: false,
    mutate: mockDiagnoseMutate,
    mutateAsync: jest.fn(() => Promise.resolve()),
    reset: mockDiagnoseReset,
  }),
}));

jest.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    getCameraStreamUrl: (printerId: number) => `https://example.com/printers/${printerId}/camera/stream`,
  },
}));

jest.mock('@/hooks/useStreamToken', () => ({
  useMediaToken: () => ({
    token: 'media-token',
    isReady: true,
  }),
}));

jest.mock('@/components/common/AppUI', () => ({
  PrimaryButton: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => {
    const { Pressable: MockPressable, Text: MockText } = require('react-native');
    return (
      <MockPressable accessibilityRole="button" onPress={onPress} disabled={disabled}>
        <MockText>{label}</MockText>
      </MockPressable>
    );
  },
  StatusBadge: ({ label }: { label: string }) => {
    const { Text: MockText } = require('react-native');
    return <MockText>{label}</MockText>;
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => true,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-native-gesture-handler', () => {
  const { View: MockView } = require('react-native');
  const chain = new Proxy(
    {},
    {
      get: () => () => chain,
    },
  );
  return {
    Gesture: new Proxy({}, { get: () => () => chain }),
    GestureDetector: ({ children }: { children: React.ReactNode }) => (
      <MockView>{children}</MockView>
    ),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: MockView,
    },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
  };
});

function getStreamImage() {
  return renderResult.getByTestId('camera-stream-image');
}

let renderResult: Awaited<ReturnType<typeof render>>;
let isUnmounted: boolean;

describe('CameraScreen stream timeout', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T12:00:00Z'));
    jest.clearAllMocks();
    renderResult = await render(<CameraScreen />);
    isUnmounted = false;
  });

  afterEach(async () => {
    if (!isUnmounted) await renderResult.unmount();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows retry and diagnostic actions when the first frame times out', async () => {
    await act(async () => {
      jest.advanceTimersByTime(CAMERA_STREAM_TIMEOUT_MS);
    });

    expect(renderResult.getByText('Unable to load stream')).toBeTruthy();
    expect(renderResult.getByText('Retry')).toBeTruthy();
    expect(renderResult.getAllByText('Diagnose').length).toBeGreaterThan(0);
    expect(renderResult.getByText(/Settings → Privacy → Local Network/)).toBeTruthy();
  });

  it('clears the timeout when the first frame loads', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const image = getStreamImage();
    await fireEvent(image, 'loadStart');
    const timeoutCallIndex = setTimeoutSpy.mock.calls.findIndex(
      (call: unknown[]) => call[1] === CAMERA_STREAM_TIMEOUT_MS,
    );
    expect(timeoutCallIndex).toBeGreaterThanOrEqual(0);
    const timeoutHandle = setTimeoutSpy.mock.results[timeoutCallIndex].value;
    await fireEvent(image, 'load');

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutHandle);

    await act(async () => {
      jest.advanceTimersByTime(CAMERA_STREAM_TIMEOUT_MS);
    });

    expect(renderResult.queryByText('Unable to load stream')).toBeNull();
  });

  it('clears the timeout when unmounted mid-load', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    await fireEvent(getStreamImage(), 'loadStart');
    const timeoutCallIndex = setTimeoutSpy.mock.calls.findIndex(
      (call: unknown[]) => call[1] === CAMERA_STREAM_TIMEOUT_MS,
    );
    expect(timeoutCallIndex).toBeGreaterThanOrEqual(0);
    const timeoutHandle = setTimeoutSpy.mock.results[timeoutCallIndex].value;

    await renderResult.unmount();
    isUnmounted = true;

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutHandle);
  });

  it('reseeds the stream and returns to loading when retried', async () => {
    const initialUri = getStreamImage().props.source.uri;
    await fireEvent(getStreamImage(), 'loadStart');

    await act(async () => {
      jest.advanceTimersByTime(CAMERA_STREAM_TIMEOUT_MS);
    });

    await act(async () => {
      await fireEvent.press(renderResult.getByText('Retry'));
    });

    const retriedImage = getStreamImage();
    expect(retriedImage.props.source.uri).not.toBe(initialUri);

    await fireEvent(retriedImage, 'loadStart');
    expect(renderResult.getByText('Connecting to live stream…')).toBeTruthy();
    expect(renderResult.queryByText('Unable to load stream')).toBeNull();
  });
});
