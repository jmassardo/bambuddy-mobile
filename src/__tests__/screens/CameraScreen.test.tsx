import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import CameraScreen, { CAMERA_STREAM_TIMEOUT_MS } from '@/screens/CameraScreen';

const mockInvalidateQueries = jest.fn(() => Promise.resolve());
const mockDiagnoseMutate = jest.fn();
const mockDiagnoseReset = jest.fn();
let mockWebViewInstanceId = 0;

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
    getCameraStreamUrl: (printerId: number) =>
      `https://example.com/printers/${printerId}/camera/stream?token=media-token`,
  },
}));

jest.mock('@/hooks/useStreamToken', () => ({
  useMediaToken: () => ({
    token: 'media-token',
    isReady: true,
  }),
}));

jest.mock('react-native-webview', () => ({
  WebView: (props: Record<string, unknown>) => {
    const MockReact = require('react');
    const { View: MockView } = require('react-native');
    const [instanceId] = MockReact.useState(() => ++mockWebViewInstanceId);
    return <MockView {...props} nativeID={`webview-${instanceId}`} />;
  },
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

let renderResult: Awaited<ReturnType<typeof render>>;
let isUnmounted: boolean;

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
}

async function renderCamera(os: 'ios' | 'android') {
  setPlatform(os);
  renderResult = await render(<CameraScreen />);
}

describe('CameraScreen iOS stream renderer', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T12:00:00Z'));
    jest.clearAllMocks();
    await renderCamera('ios');
    isUnmounted = false;
  });

  afterEach(async () => {
    if (!isUnmounted) await renderResult.unmount();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders the complete tokenized stream URL in a local WebView document', () => {
    const webView = renderResult.getByTestId('camera-stream-webview');
    const html = webView.props.source.html as string;

    expect(renderResult.queryByTestId('camera-stream-image')).toBeNull();
    expect(html).toContain(
      'data-src="https://example.com/printers/1/camera/stream?token=media-token&amp;t=media-token-',
    );
    expect(html).not.toContain('token=media-token&t=');
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
    const webView = renderResult.getByTestId('camera-stream-webview');
    await fireEvent(webView, 'loadStart');
    const timeoutCallIndex = setTimeoutSpy.mock.calls.findIndex(
      (call: unknown[]) => call[1] === CAMERA_STREAM_TIMEOUT_MS,
    );
    expect(timeoutCallIndex).toBeGreaterThanOrEqual(0);
    const timeoutHandle = setTimeoutSpy.mock.results[timeoutCallIndex].value;
    await fireEvent(webView, 'message', {
      nativeEvent: { data: JSON.stringify({ type: 'stream-loaded' }) },
    });

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutHandle);

    await act(async () => {
      jest.advanceTimersByTime(CAMERA_STREAM_TIMEOUT_MS);
    });

    expect(renderResult.queryByText('Unable to load stream')).toBeNull();
  });

  it('clears the timeout when unmounted mid-load', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    await fireEvent(renderResult.getByTestId('camera-stream-webview'), 'loadStart');
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
    const initialWebView = renderResult.getByTestId('camera-stream-webview');
    const initialInstanceId = initialWebView.props.nativeID;
    const initialHtml = initialWebView.props.source.html;
    await fireEvent(initialWebView, 'loadStart');

    await act(async () => {
      jest.advanceTimersByTime(CAMERA_STREAM_TIMEOUT_MS);
    });

    await act(async () => {
      await fireEvent.press(renderResult.getByText('Retry'));
    });

    const retriedWebView = renderResult.getByTestId('camera-stream-webview');
    expect(retriedWebView.props.nativeID).not.toBe(initialInstanceId);
    expect(retriedWebView.props.source.html).not.toBe(initialHtml);

    await fireEvent(retriedWebView, 'loadStart');
    expect(renderResult.getByText('Connecting to live stream…')).toBeTruthy();
    expect(renderResult.queryByText('Unable to load stream')).toBeNull();
  });

  it('records a token-safe reason and shows recovery when the image element fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const webView = renderResult.getByTestId('camera-stream-webview');

    await fireEvent(webView, 'message', {
      nativeEvent: {
        data: JSON.stringify({
          type: 'stream-error',
          reason: 'https://example.com/?token=must-not-be-logged',
        }),
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[Camera] Stream renderer failed:',
      'image-error',
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('must-not-be-logged');
    expect(renderResult.getByText('Unable to load stream')).toBeTruthy();
    warnSpy.mockRestore();
  });

  it('handles a native WebView error without exposing the stream URL', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    await fireEvent(renderResult.getByTestId('camera-stream-webview'), 'error', {
      nativeEvent: { description: 'request failed' },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[Camera] Stream renderer failed:',
      'webview-error',
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('media-token');
    expect(renderResult.getByText('Unable to load stream')).toBeTruthy();
    warnSpy.mockRestore();
  });
});

describe('CameraScreen Android stream renderer', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T12:00:00Z'));
    jest.clearAllMocks();
    await renderCamera('android');
    isUnmounted = false;
  });

  afterEach(async () => {
    if (!isUnmounted) await renderResult.unmount();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps the React Native Image stream path', async () => {
    const image = renderResult.getByTestId('camera-stream-image');

    expect(renderResult.queryByTestId('camera-stream-webview')).toBeNull();
    expect(image.props.source.uri).toContain(
      'camera/stream?token=media-token&t=media-token-',
    );

    await fireEvent(image, 'load');
    await act(async () => {
      jest.advanceTimersByTime(CAMERA_STREAM_TIMEOUT_MS);
    });

    expect(renderResult.queryByText('Unable to load stream')).toBeNull();
  });
});
