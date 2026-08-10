import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CameraScreen, { CAMERA_STREAM_TIMEOUT_MS } from '@/screens/CameraScreen';

const STREAM_TOKEN = 'sentinel-camera-token';
const SERVER_HOST = 'camera.internal.example';
const STREAM_BASE_URL =
  'https://camera.internal.example/api/v1/printers/1/camera/stream' +
  '?camera_token=sentinel-camera-token&scope=camera_stream';
const SNAPSHOT_BASE_URL =
  'https://camera.internal.example/api/v1/printers/1/camera/snapshot' +
  '?camera_token=sentinel-camera-token&scope=camera_stream';
const NOW = new Date('2026-08-10T12:00:00Z').getTime();

const mockInvalidateQueries = jest.fn(() => Promise.resolve());
const mockDiagnoseMutate = jest.fn();
const mockDiagnoseReset = jest.fn();
const mockFetch = jest.fn();
const mockWebViewProps = jest.fn();
const mockGestureInstances: Array<Record<string, (...args: unknown[]) => unknown>> = [];
let mockStreamBaseUrl = STREAM_BASE_URL;
let mockSnapshotBaseUrl = SNAPSHOT_BASE_URL;

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
    getCameraSnapshotUrl: () => mockSnapshotBaseUrl,
    getCameraStreamUrl: () => mockStreamBaseUrl,
  },
}));

jest.mock('@/hooks/useStreamToken', () => ({
  useMediaToken: () => ({
    token: STREAM_TOKEN,
    isReady: true,
  }),
}));

jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      mockWebViewProps(props);
      return ReactModule.createElement(MockView, props);
    },
  };
});

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
  const makeGesture = () => {
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const chain = new Proxy(handlers, {
      get: (target, property: string) => (callback?: (...args: unknown[]) => unknown) => {
        if (property.startsWith('on') && callback) target[property] = callback;
        return chain;
      },
    });
    mockGestureInstances.push(handlers);
    return chain;
  };
  return {
    Gesture: {
      Pinch: makeGesture,
      Pan: makeGesture,
      Tap: makeGesture,
      Exclusive: makeGesture,
      Simultaneous: makeGesture,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => (
      <MockView>{children}</MockView>
    ),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = require('react-native');
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: {
      View: MockView,
    },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    useSharedValue: (value: unknown) => ReactModule.useRef({ value }).current,
    withTiming: (value: unknown) => value,
  };
});

function snapshotResponse({
  ok = true,
  status = 200,
  contentType = 'image/jpeg',
  bytes = 4,
}: {
  ok?: boolean;
  status?: number;
  contentType?: string | null;
  bytes?: number;
} = {}) {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null),
    },
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(bytes))),
  };
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function renderCamera() {
  return render(<CameraScreen />);
}

async function renderReadyCamera() {
  mockFetch.mockResolvedValueOnce(snapshotResponse());
  const result = await renderCamera();
  await waitFor(() => expect(result.getByTestId('camera-stream-webview')).toBeTruthy());
  return result;
}

describe('CameraScreen direct MJPEG WebView', () => {
  beforeAll(() => {
    globalThis.fetch = mockFetch as typeof fetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGestureInstances.length = 0;
    mockStreamBaseUrl = STREAM_BASE_URL;
    mockSnapshotBaseUrl = SNAPSHOT_BASE_URL;
    const realDateNow = Date.now.bind(Date);
    jest
      .spyOn(Date, 'now')
      .mockImplementationOnce(() => NOW)
      .mockImplementation(realDateNow);
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preflights the finite snapshot before mounting the direct stream URI', async () => {
    const pendingSnapshot = deferred<ReturnType<typeof snapshotResponse>>();
    mockFetch.mockReturnValueOnce(pendingSnapshot.promise);
    const result = await renderCamera();

    expect(result.getByText('Connecting to live stream…')).toBeTruthy();
    expect(result.queryByTestId('camera-stream-webview')).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      `${SNAPSHOT_BASE_URL}&t=${encodeURIComponent(`${STREAM_TOKEN}-${NOW}`)}`,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => {
      pendingSnapshot.resolve(snapshotResponse({ contentType: 'image/jpeg; charset=binary' }));
      await pendingSnapshot.promise;
    });

    const webView = result.getByTestId('camera-stream-webview');
    expect(webView.props.source).toEqual({
      uri: `${STREAM_BASE_URL}&t=${encodeURIComponent(`${STREAM_TOKEN}-${NOW}`)}`,
    });
    expect(webView.props.source.html).toBeUndefined();
    expect(webView.props.injectedJavaScript).toBeUndefined();
    expect(result.queryByText('Connecting to live stream…')).toBeNull();
  });

  it('uses only the direct top-level WebView path on iOS', async () => {
    const result = await renderReadyCamera();

    expect(result.getByTestId('camera-stream-webview').props.source.uri).toBe(
      `${STREAM_BASE_URL}&t=${encodeURIComponent(`${STREAM_TOKEN}-${NOW}`)}`,
    );
    expect(result.queryByTestId('camera-stream-image')).toBeNull();
  });

  it('preserves the React Native Image stream path on Android without WebView or preflight', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    const result = await renderCamera();
    const image = result.getByTestId('camera-stream-image');

    expect(image.props.source.uri).toBe(
      `${STREAM_BASE_URL}&t=${encodeURIComponent(`${STREAM_TOKEN}-${NOW}`)}`,
    );
    expect(result.queryByTestId('camera-stream-webview')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();

    await fireEvent(image, 'load');
    expect(result.queryByText('Connecting to live stream…')).toBeNull();
    await fireEvent(image, 'loadStart');
    await act(async () => {
      jest.advanceTimersByTime(CAMERA_STREAM_TIMEOUT_MS);
    });
    expect(result.getByText('Unable to load stream')).toBeTruthy();
    result.unmount();
    jest.useRealTimers();
  });

  it('does not depend on a terminal event from the endless MJPEG response', async () => {
    const result = await renderReadyCamera();
    const webView = result.getByTestId('camera-stream-webview');

    expect(webView.props.onLoad).toBeUndefined();
    expect(webView.props.onLoadEnd).toBeUndefined();
    expect(webView.props.onLoadProgress).toBeUndefined();
    expect(result.queryByText('Unable to load stream')).toBeNull();
    expect(result.getByTestId('camera-stream-webview')).toBeTruthy();
  });

  it('sets restrictive browser-surface props', async () => {
    await renderReadyCamera();
    const props = mockWebViewProps.mock.calls.at(-1)?.[0];

    expect(props.originWhitelist).toEqual(['*']);
    expect(props.javaScriptEnabled).toBe(false);
    expect(props.domStorageEnabled).toBe(false);
    expect(props.allowFileAccess).toBe(false);
    expect(props.allowFileAccessFromFileURLs).toBe(false);
    expect(props.allowUniversalAccessFromFileURLs).toBe(false);
    expect(props.sharedCookiesEnabled).toBe(false);
    expect(props.thirdPartyCookiesEnabled).toBe(false);
    expect(props.setSupportMultipleWindows).toBe(false);
    expect(props.mixedContentMode).toBe('never');
    expect(props.cacheEnabled).toBe(false);
    expect(props.cacheMode).toBe('LOAD_NO_CACHE');
    expect(props.incognito).toBe(true);
    expect(props.onOpenWindow).toEqual(expect.any(Function));
    expect(props.onFileDownload).toEqual(expect.any(Function));
  });

  it('allows only the exact top-frame stream URL including its complete query', async () => {
    const result = await renderReadyCamera();
    const shouldStart =
      result.getByTestId('camera-stream-webview').props.onShouldStartLoadWithRequest;
    const exactUrl =
      `${STREAM_BASE_URL}&t=${encodeURIComponent(`${STREAM_TOKEN}-${NOW}`)}`;

    expect(shouldStart({ url: exactUrl, isTopFrame: true })).toBe(true);
    expect(shouldStart({ url: exactUrl, isTopFrame: false })).toBe(false);
    expect(
      shouldStart({
        url: `https://${SERVER_HOST}/api/v1/printers/1/camera/stream`,
        isTopFrame: true,
      }),
    ).toBe(false);
    expect(
      shouldStart({
        url: `${exactUrl}&extra=true`,
        isTopFrame: true,
      }),
    ).toBe(false);
  });

  it.each([
    `https://${SERVER_HOST}/login`,
    `https://${SERVER_HOST}/api/v1/printers/2/camera/stream?camera_token=${STREAM_TOKEN}&scope=camera_stream`,
    `https://external.example/api/v1/printers/1/camera/stream?camera_token=${STREAM_TOKEN}&scope=camera_stream`,
    `http://${SERVER_HOST}/api/v1/printers/1/camera/stream?camera_token=${STREAM_TOKEN}&scope=camera_stream`,
    'file:///camera',
    'mailto:camera@example.com',
    'not a valid URL',
  ])('denies alternate navigation without exposing its target: %s', async blockedUrl => {
    const result = await renderReadyCamera();
    const shouldStart =
      result.getByTestId('camera-stream-webview').props.onShouldStartLoadWithRequest;

    expect(shouldStart({ url: blockedUrl, isTopFrame: true })).toBe(false);
  });

  it('allows an exact local HTTP stream URL without permitting alternate navigation', async () => {
    mockStreamBaseUrl =
      'http://192.168.1.20/api/v1/printers/1/camera/stream' +
      '?camera_token=sentinel-camera-token&scope=camera_stream';
    mockSnapshotBaseUrl =
      'http://192.168.1.20/api/v1/printers/1/camera/snapshot' +
      '?camera_token=sentinel-camera-token&scope=camera_stream';
    const result = await renderReadyCamera();
    const webView = result.getByTestId('camera-stream-webview');
    const shouldStart = webView.props.onShouldStartLoadWithRequest;

    expect(shouldStart({ url: webView.props.source.uri, isTopFrame: true })).toBe(true);
    expect(
      shouldStart({
        url: webView.props.source.uri.replace('http://', 'https://'),
        isTopFrame: true,
      }),
    ).toBe(false);
  });

  it.each([
    {
      name: '401 response',
      response: snapshotResponse({ ok: false, status: 401 }),
      reason: 'snapshot_http',
      status: 401,
    },
    {
      name: '403 response',
      response: snapshotResponse({ ok: false, status: 403 }),
      reason: 'snapshot_http',
      status: 403,
    },
    {
      name: 'other HTTP response',
      response: snapshotResponse({ ok: false, status: 503 }),
      reason: 'snapshot_http',
      status: 503,
    },
    {
      name: 'non-JPEG response',
      response: snapshotResponse({ contentType: 'text/html' }),
      reason: 'snapshot_mime',
    },
    {
      name: 'missing content type',
      response: snapshotResponse({ contentType: null }),
      reason: 'snapshot_mime',
    },
    {
      name: 'empty JPEG',
      response: snapshotResponse({ bytes: 0 }),
      reason: 'snapshot_empty',
    },
  ])('shows recoverable redacted UI for snapshot $name', async testCase => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(testCase.response);
    const result = await renderCamera();

    await waitFor(() => expect(result.getByText('Unable to load stream')).toBeTruthy());
    expect(result.getByText('Retry')).toBeTruthy();
    expect(result.getAllByText('Diagnose').length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledWith(
      'Camera stream failure.',
      testCase.status == null
        ? { reason: testCase.reason }
        : { reason: testCase.reason, status: testCase.status },
    );
  });

  it('maps a snapshot network rejection to a fixed redacted reason', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetch.mockRejectedValueOnce(
      new Error(
        `${SNAPSHOT_BASE_URL} returned body=private-response redirect=https://redirect.example`,
      ),
    );
    const result = await renderCamera();

    await waitFor(() => expect(result.getByText('Unable to load stream')).toBeTruthy());
    expect(warn).toHaveBeenCalledWith('Camera stream failure.', {
      reason: 'snapshot_network',
    });
    const visibleAndLogged = JSON.stringify({
      screen: result.toJSON(),
      warnings: warn.mock.calls,
    });
    expect(visibleAndLogged).not.toContain(STREAM_TOKEN);
    expect(visibleAndLogged).not.toContain(SERVER_HOST);
    expect(visibleAndLogged).not.toContain('private-response');
    expect(visibleAndLogged).not.toContain('redirect.example');
  });

  it.each([
    {
      eventName: 'error',
      expected: { reason: 'webview_native' },
      event: {
        nativeEvent: {
          url: `${STREAM_BASE_URL}&t=${NOW}`,
          description: 'private-response',
        },
      },
    },
    {
      eventName: 'httpError',
      expected: { reason: 'webview_http', status: 502 },
      event: {
        nativeEvent: {
          statusCode: 502,
          url: `${STREAM_BASE_URL}&t=${NOW}`,
          description: 'private-response',
        },
      },
    },
    {
      eventName: 'contentProcessDidTerminate',
      expected: { reason: 'webview_process' },
      event: {
        nativeEvent: {
          url: `${STREAM_BASE_URL}&t=${NOW}`,
        },
      },
    },
    {
      eventName: 'renderProcessGone',
      expected: { reason: 'webview_process' },
      event: {
        nativeEvent: {
          didCrash: true,
          url: `${STREAM_BASE_URL}&t=${NOW}`,
        },
      },
    },
  ])('handles explicit WebView $eventName without serializing its event', async testCase => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await renderReadyCamera();
    const webView = result.getByTestId('camera-stream-webview');

    await act(async () => {
      fireEvent(webView, testCase.eventName, testCase.event);
    });

    expect(result.getByText('Unable to load stream')).toBeTruthy();
    expect(warn).toHaveBeenCalledWith('Camera stream failure.', testCase.expected);
    const visibleAndLogged = JSON.stringify({
      screen: result.toJSON(),
      warnings: warn.mock.calls,
    });
    expect(visibleAndLogged).not.toContain(STREAM_TOKEN);
    expect(visibleAndLogged).not.toContain(SERVER_HOST);
    expect(visibleAndLogged).not.toContain('private-response');
  });

  it.each(['openWindow', 'fileDownload'])(
    'fails closed with redacted telemetry for iOS WebView %s requests',
    async eventName => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const result = await renderReadyCamera();
      const webView = result.getByTestId('camera-stream-webview');

      await act(async () => {
        fireEvent(webView, eventName, {
          nativeEvent: {
            targetUrl: `https://${SERVER_HOST}/private?token=${STREAM_TOKEN}`,
            downloadUrl: `${STREAM_BASE_URL}&private=true`,
          },
        });
      });

      expect(result.getByText('Unable to load stream')).toBeTruthy();
      expect(warn).toHaveBeenCalledWith('Camera stream failure.', {
        reason: 'webview_native',
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(STREAM_TOKEN);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(SERVER_HOST);
    },
  );

  it('unmounts the old WebView, ignores stale preflight work, and remounts on Retry', async () => {
    const result = await renderReadyCamera();
    const initialWebView = result.getByTestId('camera-stream-webview');
    const initialUri = initialWebView.props.source.uri;
    await act(async () => {
      mockGestureInstances[0].onUpdate({ scale: 2 });
      mockGestureInstances[0].onEnd();
    });
    expect(result.getByText('2.0×')).toBeTruthy();

    await act(async () => {
      fireEvent(initialWebView, 'error', {
        nativeEvent: { description: 'failed' },
      });
    });
    expect(result.getByText('1.0×')).toBeTruthy();

    const retryPreflight = deferred<ReturnType<typeof snapshotResponse>>();
    mockFetch.mockReturnValueOnce(retryPreflight.promise);
    await act(async () => {
      fireEvent.press(result.getByText('Retry'));
    });

    expect(result.queryByTestId('camera-stream-webview')).toBeNull();
    expect(result.getByText('Connecting to live stream…')).toBeTruthy();

    await act(async () => {
      retryPreflight.resolve(snapshotResponse());
      await retryPreflight.promise;
    });

    const retriedWebView = result.getByTestId('camera-stream-webview');
    expect(retriedWebView.props.source.uri).not.toBe(initialUri);
    expect(retriedWebView).not.toBe(initialWebView);
    expect(result.getByText('1.0×')).toBeTruthy();
  });

  it('ignores a stale snapshot rejection after Retry starts a new generation', async () => {
    const stalePreflight = deferred<ReturnType<typeof snapshotResponse>>();
    const currentPreflight = deferred<ReturnType<typeof snapshotResponse>>();
    mockFetch
      .mockReturnValueOnce(stalePreflight.promise)
      .mockReturnValueOnce(currentPreflight.promise);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await renderCamera();

    await act(async () => {
      fireEvent.press(result.getByText('Refresh'));
    });
    await act(async () => {
      currentPreflight.resolve(snapshotResponse());
      await currentPreflight.promise;
    });
    await waitFor(() => expect(result.getByTestId('camera-stream-webview')).toBeTruthy());

    await act(async () => {
      stalePreflight.reject(new Error(`${STREAM_TOKEN} stale failure`));
      await stalePreflight.promise.catch(() => undefined);
    });

    expect(result.getByTestId('camera-stream-webview')).toBeTruthy();
    expect(result.queryByText('Unable to load stream')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('preserves platform-specific recoverable guidance', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const iosResult = await renderCamera();
    await waitFor(() =>
      expect(iosResult.getByText(/Settings → Privacy → Local Network/)).toBeTruthy(),
    );
    iosResult.unmount();

    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    const androidResult = await renderCamera();
    await fireEvent(androidResult.getByTestId('camera-stream-image'), 'loadStart');
    await act(async () => {
      fireEvent(androidResult.getByTestId('camera-stream-image'), 'error');
    });
    await waitFor(() =>
      expect(
        androidResult.getByText(/printer is reachable on your local network/),
      ).toBeTruthy(),
    );
  });
});
