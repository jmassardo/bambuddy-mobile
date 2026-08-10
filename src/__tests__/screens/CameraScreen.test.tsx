import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import CameraScreen, { CAMERA_STREAM_TIMEOUT_MS } from '@/screens/CameraScreen';

interface MockWebViewProps {
  source: { uri: string };
  injectedJavaScriptBeforeContentLoaded?: string;
  injectedJavaScript: string;
  javaScriptEnabled: boolean;
  domStorageEnabled: boolean;
  incognito: boolean;
  sharedCookiesEnabled: boolean;
  useSharedProcessPool: boolean;
  javaScriptCanOpenWindowsAutomatically: boolean;
  allowFileAccessFromFileURLs: boolean;
  allowUniversalAccessFromFileURLs: boolean;
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
  onOpenWindow: (event: object) => void;
  onFileDownload: (event: object) => void;
  onError: (event: object) => void;
  onHttpError: (event: object) => void;
  onContentProcessDidTerminate: (event: object) => void;
}

const mockInvalidateQueries = jest.fn(() => Promise.resolve());
const mockDiagnoseMutate = jest.fn();
const mockDiagnoseReset = jest.fn();
const mockMutationMutateAsync = jest.fn(() => Promise.resolve());
const mockGetCameraStreamUrl = jest.fn(
  (printerId: number) => `https://example.com/printers/${printerId}/camera/stream`,
);
const mockGetAuthToken = jest.fn<string | null, []>();
let mockWebViewProps: MockWebViewProps | null;
let mockWebViewMounts: number;
let mockFocusCallback: (() => void) | null;
let mockServerUrl: string | null;
let mockAuthEnabled: boolean;
let mockUser: object | null;
let mockRouteId: string | number | undefined;
let mockPlateDetectionEnabled: boolean;
let mockPinchBegin: (() => void) | null;
let mockPinchUpdate: ((event: { scale: number }) => void) | null;
let mockPinchEnd: (() => void) | null;
let mockDoubleTapEnd: (() => void) | null;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const MockReact = require('react') as typeof React;
    mockFocusCallback = callback;
    MockReact.useEffect(() => callback(), [callback]);
  },
  useNavigation: () => ({
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useRoute: () => ({
    params: { id: mockRouteId },
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
          plate_detection_enabled: mockPlateDetectionEnabled,
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
    if (queryKey[0] === 'plateDetectionStatus') {
      return {
        data: { calibrated: true, reference_count: 1, max_references: 3 },
        isLoading: false,
        isError: false,
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
    mutateAsync: mockMutationMutateAsync,
    reset: mockDiagnoseReset,
  }),
}));

jest.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
  getAuthToken: () => mockGetAuthToken(),
  api: {
    getCameraStreamUrl: (printerId: number) => mockGetCameraStreamUrl(printerId),
  },
}));

jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { serverUrl: string | null }) => unknown) =>
    selector({ serverUrl: mockServerUrl }),
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
    authEnabled: mockAuthEnabled,
    user: mockUser,
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
  const createChain = (kind: 'pinch' | 'pan' | 'tap') => {
    const chain = new Proxy(
      {},
      {
        get: (_target, property) => (callback?: (...args: never[]) => void) => {
          if (kind === 'pinch' && property === 'onBegin') {
            mockPinchBegin = (callback as typeof mockPinchBegin) ?? null;
          }
          if (kind === 'pinch' && property === 'onUpdate') {
            mockPinchUpdate = (callback as typeof mockPinchUpdate) ?? null;
          }
          if (kind === 'pinch' && property === 'onEnd') {
            mockPinchEnd = (callback as typeof mockPinchEnd) ?? null;
          }
          if (kind === 'tap' && property === 'onEnd') {
            mockDoubleTapEnd = (callback as typeof mockDoubleTapEnd) ?? null;
          }
          return chain;
        },
      },
    );
    return chain;
  };
  return {
    Gesture: {
      Pinch: () => createChain('pinch'),
      Pan: () => createChain('pan'),
      Tap: () => createChain('tap'),
      Exclusive: (...gestures: unknown[]) => gestures,
      Simultaneous: (...gestures: unknown[]) => gestures,
    },
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

jest.mock('react-native-webview', () => ({
  WebView: (props: MockWebViewProps) => {
    const MockReact = require('react') as typeof React;
    const { View: MockView } = require('react-native');
    mockWebViewProps = props;
    MockReact.useEffect(() => {
      mockWebViewMounts += 1;
    }, []);
    return <MockView testID="camera-webview" />;
  },
}));

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
    writable: true,
  });
}

function requireWebViewProps() {
  if (!mockWebViewProps) throw new Error('Expected the camera WebView to render.');
  return mockWebViewProps;
}

function renderedText(result: Awaited<ReturnType<typeof render>>) {
  return JSON.stringify(result.toJSON());
}

async function pressAndFlush(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
    await Promise.resolve();
  });
}

class FakeDomElement {
  id = '';
  textContent = '';
  parentElement: FakeDomElement | null = null;
  readonly children: FakeDomElement[] = [];
  readonly attributes = new Set<string>();

  constructor(readonly tagName: string, textContent = '') {
    this.textContent = textContent;
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  appendChild(child: FakeDomElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name: string) {
    this.attributes.add(name);
  }

  querySelector(selector: string): FakeDomElement | null {
    for (const child of this.children) {
      if (child.tagName === selector) return child;
      const descendant = child.querySelector(selector);
      if (descendant) return descendant;
    }
    return null;
  }

  querySelectorAll(selector: string): FakeDomElement[] {
    const matches: FakeDomElement[] = [];
    for (const child of this.children) {
      if (child.tagName === selector) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  findById(id: string): FakeDomElement | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      const match = child.findById(id);
      if (match) return match;
    }
    return null;
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  disconnected = false;

  constructor(readonly callback: () => void) {
    FakeMutationObserver.instances.push(this);
  }

  observe() {
    return undefined;
  }

  disconnect() {
    this.disconnected = true;
  }
}

function createCameraDomFixture() {
  const html = new FakeDomElement('html');
  const head = html.appendChild(new FakeDomElement('head'));
  const body = html.appendChild(new FakeDomElement('body'));
  const root = body.appendChild(new FakeDomElement('div'));
  root.id = 'root';
  const page = root.appendChild(new FakeDomElement('div'));
  const header = page.appendChild(new FakeDomElement('div'));
  header.appendChild(new FakeDomElement('h1', 'Printer One'));
  const content = page.appendChild(new FakeDomElement('div'));
  const stream = content.appendChild(new FakeDomElement('div'));
  const errorOverlay = stream.appendChild(new FakeDomElement('div', 'Camera unavailable'));
  errorOverlay.appendChild(new FakeDomElement('button', 'Retry'));
  errorOverlay.appendChild(new FakeDomElement('button', 'Diagnose'));
  const image = stream.appendChild(new FakeDomElement('img'));
  const zoomControls = stream.appendChild(new FakeDomElement('div', '100%'));
  zoomControls.appendChild(new FakeDomElement('button'));
  zoomControls.appendChild(new FakeDomElement('button'));
  zoomControls.appendChild(new FakeDomElement('button'));

  return {
    document: {
      documentElement: html,
      head,
      createElement: (tagName: string) => new FakeDomElement(tagName),
      getElementById: (id: string) => html.findById(id),
    },
    errorOverlay,
    header,
    page,
    content,
    stream,
    image,
    zoomControls,
  };
}

function executePresentationScript(script: string, fixture: ReturnType<typeof createCameraDomFixture>) {
  const runInNewContext = require('vm').runInNewContext as (
    source: string,
    context: object,
  ) => void;
  const browserWindow = {
    setTimeout: jest.fn(() => 1),
    clearTimeout: jest.fn(),
  };
  runInNewContext(script, {
    document: fixture.document,
    window: browserWindow,
    MutationObserver: FakeMutationObserver,
  });
  return browserWindow;
}

beforeEach(() => {
  jest.clearAllMocks();
  FakeMutationObserver.instances = [];
  mockWebViewProps = null;
  mockWebViewMounts = 0;
  mockFocusCallback = null;
  mockServerUrl = 'https://bambuddy.example/base/path';
  mockAuthEnabled = true;
  mockUser = { id: 7 };
  mockRouteId = '1';
  mockPlateDetectionEnabled = false;
  mockPinchBegin = null;
  mockPinchUpdate = null;
  mockPinchEnd = null;
  mockDoubleTapEnd = null;
  mockGetAuthToken.mockReturnValue('mobile-auth-token');
});

describe('CameraScreen iOS Web camera', () => {
  beforeEach(() => {
    setPlatform('ios');
  });

  it('loads only the first-party standalone camera route with private capabilities', async () => {
    const result = await render(<CameraScreen />);
    const props = requireWebViewProps();

    expect(props.source).toEqual({ uri: 'https://bambuddy.example/camera/1' });
    expect(props.source.uri).not.toContain('mobile-auth-token');
    expect(props.source.uri).not.toMatch(/[?#]|stream|snapshot|html/i);
    expect(props.javaScriptEnabled).toBe(true);
    expect(props.domStorageEnabled).toBe(true);
    expect(props.incognito).toBe(true);
    expect(props.sharedCookiesEnabled).toBe(false);
    expect(props.useSharedProcessPool).toBe(false);
    expect(props.javaScriptCanOpenWindowsAutomatically).toBe(false);
    expect(props.allowFileAccessFromFileURLs).toBe(false);
    expect(props.allowUniversalAccessFromFileURLs).toBe(false);
    expect(result.getByText('Web camera · iOS')).toBeTruthy();
    expect(mockGetCameraStreamUrl).not.toHaveBeenCalled();
  });

  it('injects bounded idempotent styling that hides only duplicate Web chrome', async () => {
    await render(<CameraScreen />);
    const script = requireWebViewProps().injectedJavaScript;
    const fixture = createCameraDomFixture();

    executePresentationScript(script, fixture);

    expect(fixture.header.attributes).toContain('data-bambuddy-mobile-camera-hidden');
    expect(fixture.zoomControls.attributes).toContain('data-bambuddy-mobile-camera-hidden');
    expect(fixture.errorOverlay.attributes).not.toContain('data-bambuddy-mobile-camera-hidden');
    expect(fixture.page.attributes).toContain('data-bambuddy-mobile-camera-page');
    expect(fixture.content.attributes).toContain('data-bambuddy-mobile-camera-content');
    expect(fixture.stream.attributes).toContain('data-bambuddy-mobile-camera-stream');
    const style = fixture.document.getElementById('bambuddy-mobile-camera-style');
    expect(style?.textContent).toContain('html, body, #root');
    expect(style?.textContent).toContain('object-fit: contain');
    expect(style?.textContent).toContain('padding: 0');

    const observer = FakeMutationObserver.instances[0];
    for (let mutation = 0; mutation < 80; mutation += 1) observer.callback();
    expect(observer.disconnected).toBe(true);

    executePresentationScript(script, fixture);
    expect(
      fixture.document.head.children.filter(
        child => child.id === 'bambuddy-mobile-camera-style',
      ),
    ).toHaveLength(1);
  });

  it('keeps native gestures and plate overlay around the styled Web camera', async () => {
    mockPlateDetectionEnabled = true;
    const result = await render(<CameraScreen />);

    expect(result.getByText('Plate detection area')).toBeTruthy();
    await act(async () => {
      mockPinchBegin?.();
      mockPinchUpdate?.({ scale: 2 });
      mockPinchEnd?.();
    });
    expect(result.getByText('2.0×')).toBeTruthy();
  });

  it.each([
    ['ordinary-token', 'ordinary-token'],
    ['quote-" slash-\\ less-< separators-\u2028-\u2029', 'quote-" slash-\\ less-< separators-\u2028-\u2029'],
  ])('injects a safely serialized token before page JavaScript: %s', async (_label, token) => {
    mockGetAuthToken.mockReturnValue(token);
    await render(<CameraScreen />);
    const script = requireWebViewProps().injectedJavaScriptBeforeContentLoaded;
    const removeItem = jest.fn();
    const setItem = jest.fn();

    expect(script).toBeDefined();
    expect(script).not.toContain('<');
    expect(script).not.toContain('\u2028');
    expect(script).not.toContain('\u2029');
    const runInNewContext = require('vm').runInNewContext as (
      source: string,
      context: object,
    ) => void;
    runInNewContext(script as string, {
      window: { sessionStorage: { removeItem, setItem } },
    });

    expect(removeItem).toHaveBeenCalledWith('auth_token');
    expect(setItem).toHaveBeenCalledWith('auth_token', token);
  });

  it('loads without injection when authentication is disabled and no token exists', async () => {
    mockAuthEnabled = false;
    mockUser = null;
    mockGetAuthToken.mockReturnValue(null);
    const result = await render(<CameraScreen />);

    expect(result.getByTestId('camera-webview')).toBeTruthy();
    expect(requireWebViewProps().injectedJavaScriptBeforeContentLoaded).toBeUndefined();
  });

  it('does not load unauthenticated when authentication is enabled', async () => {
    mockGetAuthToken.mockReturnValue(null);
    const result = await render(<CameraScreen />);

    expect(result.queryByTestId('camera-webview')).toBeNull();
    expect(result.getByText('The Web camera is not available yet.')).toBeTruthy();
  });

  it.each([
    [null, '1'],
    ['', '1'],
    ['not a URL', '1'],
    ['file:///camera', '1'],
    ['https://user:password@bambuddy.example', '1'],
    ['https://bambuddy.example', 'invalid'],
  ])('fails closed for server %s and printer %s', async (serverUrl, printerId) => {
    mockServerUrl = serverUrl;
    mockRouteId = printerId;
    const result = await render(<CameraScreen />);

    expect(result.queryByTestId('camera-webview')).toBeNull();
    expect(result.getByText('Camera unavailable')).toBeTruthy();
    if (serverUrl) expect(renderedText(result)).not.toContain(serverUrl);
  });

  it('allows only the exact same-origin credential-free camera route', async () => {
    await render(<CameraScreen />);
    const allow = requireWebViewProps().onShouldStartLoadWithRequest;

    expect(allow({ url: 'https://bambuddy.example/camera/1' })).toBe(true);
    [
      'https://bambuddy.example/camera/2',
      'https://bambuddy.example/login',
      'https://bambuddy.example/camera/1?download=1',
      'https://bambuddy.example/camera/1#fragment',
      'https://other.example/camera/1',
      'https://bambuddy.example:444/camera/1',
      'http://bambuddy.example/camera/1',
      'https://user:password@bambuddy.example/camera/1',
      'mailto:test@example.com',
      'not a URL',
    ].forEach(url => expect(allow({ url })).toBe(false));
  });

  it('blocks popup and download callbacks without external opening or telemetry', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await render(<CameraScreen />);
    const props = requireWebViewProps();
    const secret = 'sentinel-popup-secret';

    props.onOpenWindow({ nativeEvent: { targetUrl: `https://evil.example/${secret}` } });
    props.onFileDownload({ nativeEvent: { downloadUrl: `https://evil.example/${secret}` } });

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  it('redacts native, HTTP, and process errors and exposes only a numeric HTTP status', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await render(<CameraScreen />);
    expect(mockWebViewMounts).toBe(1);
    const props = requireWebViewProps();
    const secret = 'sentinel-native-secret';

    await act(async () => {
      props.onHttpError({
        nativeEvent: {
          statusCode: 403,
          url: `https://bambuddy.example/${secret}`,
          description: secret,
          body: secret,
        },
      });
    });
    expect(result.getByText('The Web camera page could not be loaded (HTTP 403).')).toBeTruthy();
    expect(renderedText(result)).not.toContain(secret);
    expect(consoleError).not.toHaveBeenCalled();

    await pressAndFlush(result.getByText('Retry'));
    expect(mockWebViewMounts).toBe(2);
    const retriedProps = requireWebViewProps();
    await act(async () => {
      retriedProps.onError({ nativeEvent: { url: secret, description: secret } });
    });
    expect(result.getByText('The Web camera page could not be loaded.')).toBeTruthy();
    expect(renderedText(result)).not.toContain(secret);

    await pressAndFlush(result.getByText('Retry'));
    await act(async () => {
      requireWebViewProps().onContentProcessDidTerminate({ nativeEvent: { url: secret } });
    });
    expect(result.getByText('The Web camera page could not be loaded.')).toBeTruthy();
    expect(renderedText(result)).not.toContain(secret);
    consoleError.mockRestore();
  });

  it('retries an auth-enabled no-token state by synchronously reading the current token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    const result = await render(<CameraScreen />);
    const retry = result.getByText('Retry');
    mockGetAuthToken.mockReturnValue('restored-secret-token');

    await pressAndFlush(retry);

    expect(result.getByTestId('camera-webview')).toBeTruthy();
    expect(requireWebViewProps().source.uri).not.toContain('restored-secret-token');
  });

  it('remounts with a fresh token snapshot when the screen regains focus', async () => {
    mockGetAuthToken.mockReturnValue('focus-token-one');
    await render(<CameraScreen />);
    expect(mockWebViewMounts).toBe(1);

    mockGetAuthToken.mockReturnValue('focus-token-two');
    await act(async () => {
      mockFocusCallback?.();
      await Promise.resolve();
    });

    expect(mockWebViewMounts).toBe(2);
    expect(requireWebViewProps().injectedJavaScriptBeforeContentLoaded).toContain(
      'focus-token-two',
    );
  });

  it('unmounts the authenticated WebView when logout clears the token', async () => {
    const result = await render(<CameraScreen />);
    expect(result.getByTestId('camera-webview')).toBeTruthy();

    mockGetAuthToken.mockReturnValue(null);
    mockUser = null;
    await act(async () => {
      result.rerender(<CameraScreen />);
      await Promise.resolve();
    });

    expect(result.queryByTestId('camera-webview')).toBeNull();
    expect(result.getByText('The Web camera is not available yet.')).toBeTruthy();
  });

  it('remounts a clean WebView when switching printers after a page failure', async () => {
    const result = await render(<CameraScreen />);
    expect(mockWebViewMounts).toBe(1);
    await act(async () => {
      requireWebViewProps().onError({ nativeEvent: { description: 'redacted-secret' } });
    });
    expect(result.getByText('Unable to load Web camera')).toBeTruthy();

    mockRouteId = '2';
    await act(async () => {
      result.rerender(<CameraScreen />);
      await Promise.resolve();
    });

    expect(result.getByTestId('camera-webview')).toBeTruthy();
    expect(requireWebViewProps().source).toEqual({
      uri: 'https://bambuddy.example/camera/2',
    });
    expect(mockWebViewMounts).toBe(2);
    expect(renderedText(result)).not.toContain('redacted-secret');
  });

  it('clears stale session auth during a cold relaunch bootstrap', async () => {
    const first = await render(<CameraScreen />);
    await first.unmount();
    mockGetAuthToken.mockReturnValue('fresh-cold-launch-token');
    await render(<CameraScreen />);
    const script = requireWebViewProps().injectedJavaScriptBeforeContentLoaded;
    const storage = new Map<string, string>([['auth_token', 'stale-token']]);
    const runInNewContext = require('vm').runInNewContext as (
      source: string,
      context: object,
    ) => void;

    runInNewContext(script as string, {
      window: {
        sessionStorage: {
          removeItem: (key: string) => storage.delete(key),
          setItem: (key: string, value: string) => storage.set(key, value),
        },
      },
    });

    expect(storage.get('auth_token')).toBe('fresh-cold-launch-token');
    expect(requireWebViewProps().source.uri).not.toContain('fresh-cold-launch-token');
    expect(requireWebViewProps().injectedJavaScript).not.toContain(
      'fresh-cold-launch-token',
    );
  });
});

describe('CameraScreen Android renderer', () => {
  beforeEach(() => {
    setPlatform('android');
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T12:00:00Z'));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('retains the Image renderer, controls, plate overlay, and no WebView', async () => {
    mockPlateDetectionEnabled = true;
    const result = await render(<CameraScreen />);
    expect(Platform.OS).toBe('android');
    const image = result.getByTestId('camera-stream-image');

    expect(image.props.source.uri).toContain('/printers/1/camera/stream');
    expect(result.queryByTestId('camera-webview')).toBeNull();
    expect(result.getByText('Plate detection area')).toBeTruthy();
    expect(result.getAllByText('Diagnose').length).toBeGreaterThan(0);
    expect(result.getByText('Refresh')).toBeTruthy();
    expect(mockGetAuthToken).not.toHaveBeenCalled();
  });

  it('retains zoom gestures, Diagnose, fullscreen, light, and plate controls', async () => {
    const result = await render(<CameraScreen />);

    await act(async () => {
      mockPinchBegin?.();
      mockPinchUpdate?.({ scale: 2 });
      mockPinchEnd?.();
    });
    expect(result.getByText('2.0×')).toBeTruthy();

    await act(async () => {
      mockDoubleTapEnd?.();
    });
    expect(result.getByText('1.0×')).toBeTruthy();

    await act(async () => {
      fireEvent.press(result.getByText('Diagnose'));
    });
    expect(mockDiagnoseMutate).toHaveBeenCalled();
    expect(mockDiagnoseReset).toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(result.getByText('Light off'));
    });
    expect(mockDiagnoseMutate).toHaveBeenCalledTimes(2);

    await pressAndFlush(result.getAllByText('Plate detection')[0]);
    expect(mockMutationMutateAsync).toHaveBeenCalledWith(true);

    await act(async () => {
      fireEvent.press(result.getByText('Fill'));
    });
    expect(result.queryByText('Fill')).toBeNull();
    await result.unmount();
  });

  it('shows recovery actions after timeout and reseeds the Image on Retry', async () => {
    const result = await render(<CameraScreen />);
    const initialUri = result.getByTestId('camera-stream-image').props.source.uri;
    await fireEvent(result.getByTestId('camera-stream-image'), 'loadStart');

    await act(async () => {
      jest.advanceTimersByTime(CAMERA_STREAM_TIMEOUT_MS);
    });
    expect(result.getByText('Unable to load stream')).toBeTruthy();
    expect(result.getByText('Retry')).toBeTruthy();

    await pressAndFlush(result.getByText('Retry'));
    expect(result.getByTestId('camera-stream-image').props.source.uri).not.toBe(initialUri);
  });

  it('clears the timeout when the first frame loads and when unmounted', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const result = await render(<CameraScreen />);
    const image = result.getByTestId('camera-stream-image');
    await fireEvent(image, 'loadStart');
    await fireEvent(image, 'load');
    expect(clearTimeoutSpy).toHaveBeenCalled();

    await fireEvent(image, 'loadStart');
    await result.unmount();
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    clearTimeoutSpy.mockRestore();
  });
});

describe('CameraScreen iOS credential lifecycle', () => {
  beforeEach(() => {
    setPlatform('ios');
  });

  it('remounts with a replacement token when authentication context changes', async () => {
    const firstToken = 'first-secret-token';
    const secondToken = 'second-secret-token';
    mockGetAuthToken.mockReturnValue(firstToken);
    const result = await render(<CameraScreen />);
    expect(mockWebViewMounts).toBe(1);

    mockGetAuthToken.mockReturnValue(secondToken);
    mockUser = { id: 8 };
    result.rerender(<CameraScreen />);
    await act(async () => undefined);
    expect(mockWebViewMounts).toBe(2);
    expect(requireWebViewProps().injectedJavaScriptBeforeContentLoaded).toContain(secondToken);

    expect(renderedText(result)).not.toContain(firstToken);
    expect(requireWebViewProps().injectedJavaScriptBeforeContentLoaded).toContain(secondToken);
  });
});
