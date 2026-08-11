import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import * as ReactNative from 'react-native';
import CameraScreen, {
  CAMERA_STREAM_TIMEOUT_MS,
  isCameraLandscape,
  shouldHideCameraStatusBar,
} from '@/screens/CameraScreen';

interface MockWebViewProps {
  source: { uri: string };
  injectedJavaScriptBeforeContentLoaded?: string;
  injectedJavaScriptBeforeContentLoadedForMainFrameOnly: boolean;
  injectedJavaScript?: string;
  originWhitelist: string[];
  javaScriptEnabled: boolean;
  incognito: boolean;
  sharedCookiesEnabled: boolean;
  useSharedProcessPool: boolean;
  javaScriptCanOpenWindowsAutomatically: boolean;
  allowFileAccessFromFileURLs: boolean;
  allowUniversalAccessFromFileURLs: boolean;
  allowsLinkPreview: boolean;
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
let mockIsFocused: boolean;
let mockAppState: 'active' | 'background' | 'inactive';
let mockAppStateCallback: ((state: 'active' | 'background' | 'inactive') => void) | null;
let mockReduceMotion: boolean;
let mockInjectJavaScript: jest.Mock;
let mockWithTiming: jest.Mock;
let mockSafeAreaInsets: { top: number; right: number; bottom: number; left: number };

jest
  .spyOn(ReactNative.AccessibilityInfo, 'isReduceMotionEnabled')
  .mockImplementation(() => Promise.resolve(mockReduceMotion));
jest
  .spyOn(ReactNative.AccessibilityInfo, 'addEventListener')
  .mockImplementation(
    () =>
      ({ remove: jest.fn() }) as unknown as ReturnType<
        typeof ReactNative.AccessibilityInfo.addEventListener
      >,
  );
jest.spyOn(ReactNative.AppState, 'addEventListener').mockImplementation(
  (_event, callback) => {
    mockAppStateCallback = callback as (
      state: 'active' | 'background' | 'inactive',
    ) => void;
    return { remove: jest.fn() };
  },
);

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockIsFocused,
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
          chamber_light: false,
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
  useSafeAreaInsets: () => mockSafeAreaInsets,
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
  const MockReact = require('react') as typeof React;
  const { View: MockView } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: MockView,
    },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    useSharedValue: (value: unknown) =>
      MockReact.useRef({ value }).current,
    withTiming: (value: unknown) => mockWithTiming(value),
  };
});

jest.mock('react-native-webview', () => {
  const MockReact = require('react') as typeof React;
  return {
  WebView: MockReact.forwardRef((props: MockWebViewProps, ref: React.ForwardedRef<{ injectJavaScript: (script: string) => void }>) => {
    const { View: MockView } = require('react-native');
    mockWebViewProps = props;
    MockReact.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    MockReact.useEffect(() => {
      mockWebViewMounts += 1;
    }, []);
    return <MockView testID="camera-webview" />;
  }),
  };
});

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
    writable: true,
  });
}

function setWindowDimensions(width: number, height: number, fontScale = 1) {
  const size = { width, height, scale: 1, fontScale };
  Dimensions.set({ window: size, screen: size });
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
  observedOptions: { childList: boolean; subtree: boolean } | null = null;
  observedTarget: FakeDomElement | null = null;

  constructor(readonly callback: () => void) {
    FakeMutationObserver.instances.push(this);
  }

  observe(
    target: FakeDomElement,
    options: { childList: boolean; subtree: boolean },
  ) {
    this.observedTarget = target;
    this.observedOptions = options;
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
  header.appendChild(new FakeDomElement('button', 'Close'));
  const content = page.appendChild(new FakeDomElement('div'));
  const stream = content.appendChild(new FakeDomElement('div'));
  const errorOverlay = stream.appendChild(new FakeDomElement('div', 'Camera unavailable'));
  errorOverlay.appendChild(new FakeDomElement('button', 'Retry'));
  errorOverlay.appendChild(new FakeDomElement('button', 'Diagnose'));
  const image = stream.appendChild(new FakeDomElement('img'));
  const zoomControls = stream.appendChild(new FakeDomElement('div'));
  zoomControls.appendChild(new FakeDomElement('BUTTON', 'Zoom out'));
  zoomControls.appendChild(new FakeDomElement('BUTTON', '100%'));
  zoomControls.appendChild(new FakeDomElement('BUTTON', 'Zoom in'));

  const document: {
    documentElement: FakeDomElement;
    head: FakeDomElement | null;
    createElement: (tagName: string) => FakeDomElement;
    getElementById: (id: string) => FakeDomElement | null;
  } = {
    documentElement: html,
    head,
    createElement: (tagName: string) => new FakeDomElement(tagName),
    getElementById: (id: string) => html.findById(id),
  };

  return {
    document,
    body,
    head,
    html,
    root,
    errorOverlay,
    header,
    page,
    content,
    stream,
    image,
    zoomControls,
  };
}

function createFakeBrowserWindow(
  sessionStorage: {
    removeItem: (key: string) => unknown;
    setItem: (key: string, value: string) => unknown;
  } = {
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
) {
  let pendingTimer: (() => void) | null = null;
  return {
    sessionStorage,
    setTimeout: jest.fn((callback: () => void) => {
      pendingTimer = callback;
      return 1;
    }),
    clearTimeout: jest.fn(),
    runPendingTimer: () => {
      const callback = pendingTimer;
      pendingTimer = null;
      callback?.();
    },
  };
}

function executePresentationScript(
  script: string,
  fixture: ReturnType<typeof createCameraDomFixture>,
  browserWindow = createFakeBrowserWindow(),
) {
  const runInNewContext = require('vm').runInNewContext as (
    source: string,
    context: object,
  ) => void;
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
  mockIsFocused = true;
  setWindowDimensions(390, 844);
  mockAppState = 'active';
  Object.defineProperty(ReactNative.AppState, 'currentState', {
    configurable: true,
    value: mockAppState,
  });
  mockAppStateCallback = null;
  mockReduceMotion = false;
  mockInjectJavaScript = jest.fn();
  mockWithTiming = jest.fn((value: unknown) => value);
  mockSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
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
    expect(props.incognito).toBe(true);
    expect(props.sharedCookiesEnabled).toBe(false);
    expect(props.useSharedProcessPool).toBe(false);
    expect(props.javaScriptCanOpenWindowsAutomatically).toBe(false);
    expect(props.allowFileAccessFromFileURLs).toBe(false);
    expect(props.allowUniversalAccessFromFileURLs).toBe(false);
    expect(props.originWhitelist).toEqual(['*']);
    expect(props.injectedJavaScriptBeforeContentLoadedForMainFrameOnly).toBe(true);
    expect(props.injectedJavaScript).toBeUndefined();
    expect('onLoad' in props).toBe(false);
    expect('onLoadEnd' in props).toBe(false);
    expect(props.allowsLinkPreview).toBe(false);
    expect(result.queryByText('Web camera · iOS')).toBeNull();
    expect(result.getByLabelText('Close camera')).toBeTruthy();
    expect(result.getByLabelText('More camera actions')).toBeTruthy();
    expect(mockGetCameraStreamUrl).not.toHaveBeenCalled();
  });

  it('injects bounded idempotent styling that hides only duplicate Web chrome', async () => {
    await render(<CameraScreen />);
    const script = requireWebViewProps().injectedJavaScriptBeforeContentLoaded;
    const fixture = createCameraDomFixture();

    const browserWindow = executePresentationScript(script as string, fixture);

    expect(fixture.header.attributes).toContain('data-bambuddy-mobile-camera-hidden');
    expect(fixture.zoomControls.attributes).toContain('data-bambuddy-mobile-camera-hidden');
    expect(fixture.errorOverlay.attributes).not.toContain('data-bambuddy-mobile-camera-hidden');
    expect(fixture.page.attributes).toContain('data-bambuddy-mobile-camera-page');
    expect(fixture.content.attributes).toContain('data-bambuddy-mobile-camera-content');
    expect(fixture.stream.attributes).toContain('data-bambuddy-mobile-camera-stream');
    const style = fixture.document.getElementById('bambuddy-mobile-camera-style');
    expect(style?.textContent).toContain('html, body, #root');
    expect(style?.textContent).toContain('width: 100vw');
    expect(style?.textContent).toContain('height: 100dvh');
    expect(style?.textContent).toContain('position: fixed');
    expect(style?.textContent).toContain('position: absolute');
    expect(style?.textContent).toContain('inset: 0');
    expect(style?.textContent).toContain('top: 0');
    expect(style?.textContent).toContain('object-fit: contain');
    expect(style?.textContent).toContain('padding: 0');

    const observer = FakeMutationObserver.instances[0];
    expect(observer).toBeDefined();
    expect(observer.disconnected).toBe(false);
    expect(observer.observedTarget).toBe(fixture.document.documentElement);
    expect(observer.observedOptions).toEqual({ childList: true, subtree: true });

    observer.callback();
    executePresentationScript(script as string, fixture, browserWindow);
    expect(observer.disconnected).toBe(true);
    expect(browserWindow.clearTimeout).toHaveBeenCalledTimes(1);
    expect(
      fixture.head.children.filter(
        child => child.id === 'bambuddy-mobile-camera-style',
      ),
    ).toHaveLength(1);
  });

  it('observes before head and root exist, then styles their later mutations', async () => {
    await render(<CameraScreen />);
    const script = requireWebViewProps().injectedJavaScriptBeforeContentLoaded;
    const fixture = createCameraDomFixture();
    fixture.html.children.splice(0);
    fixture.document.head = null;

    const browserWindow = executePresentationScript(script as string, fixture);
    const observer = FakeMutationObserver.instances[0];

    expect(observer.observedTarget).toBe(fixture.html);
    expect(observer.observedOptions).toEqual({ childList: true, subtree: true });
    expect(fixture.document.getElementById('bambuddy-mobile-camera-style')).toBeNull();

    fixture.html.appendChild(fixture.head);
    fixture.html.appendChild(fixture.body);
    fixture.document.head = fixture.head;
    observer.callback();
    browserWindow.runPendingTimer();

    expect(fixture.document.getElementById('bambuddy-mobile-camera-style')).not.toBeNull();
    expect(fixture.header.attributes).toContain('data-bambuddy-mobile-camera-hidden');
    expect(fixture.zoomControls.attributes).toContain(
      'data-bambuddy-mobile-camera-hidden',
    );
    expect(fixture.errorOverlay.attributes).not.toContain(
      'data-bambuddy-mobile-camera-hidden',
    );
  });

  it('fails visibly for unknown chrome while preserving recovery actions', async () => {
    await render(<CameraScreen />);
    const fixture = createCameraDomFixture();
    fixture.header.children.splice(1, 1);
    fixture.zoomControls.children[1].textContent = 'Loading 100%';

    executePresentationScript(
      requireWebViewProps().injectedJavaScriptBeforeContentLoaded as string,
      fixture,
    );

    expect(fixture.header.attributes).not.toContain(
      'data-bambuddy-mobile-camera-hidden',
    );
    expect(fixture.zoomControls.attributes).not.toContain(
      'data-bambuddy-mobile-camera-hidden',
    );
    expect(fixture.errorOverlay.attributes).not.toContain(
      'data-bambuddy-mobile-camera-hidden',
    );
    expect(fixture.errorOverlay.querySelector('button')?.textContent).toBe('Retry');
  });

  it('keeps a compact non-wrapping portrait hierarchy at 320 points and 200% text', async () => {
    setWindowDimensions(320, 700, 2);
    const result = await render(<CameraScreen />);
    const dock = result.getByLabelText('Camera controls');

    expect(result.getByLabelText('Close camera')).toBeTruthy();
    expect(result.getByLabelText('More camera actions')).toBeTruthy();
    expect(result.getByLabelText('Refresh camera')).toBeTruthy();
    expect(result.getByLabelText('Turn chamber light on')).toBeTruthy();
    expect(result.getByLabelText('Enable plate detection')).toBeTruthy();
    expect(result.getByLabelText('Fill camera viewport')).toBeTruthy();
    expect(StyleSheet.flatten(dock.props.style).flexWrap).toBe('nowrap');
    expect(dock.props.children.filter(Boolean)).toHaveLength(4);
    expect(
      StyleSheet.flatten(result.getByLabelText('Close camera').props.style),
    ).toEqual(expect.objectContaining({ width: 44, height: 44 }));
  });

  it('hides the status bar while focused in portrait and landscape, then restores it on blur', () => {
    expect(isCameraLandscape(390, 844)).toBe(false);
    expect(shouldHideCameraStatusBar(true)).toBe(true);
    expect(isCameraLandscape(844, 390)).toBe(true);
    expect(shouldHideCameraStatusBar(true)).toBe(true);
    expect(shouldHideCameraStatusBar(false)).toBe(false);
  });

  it('positions portrait controls inside every physical safe-area inset', async () => {
    mockSafeAreaInsets = { top: 59, right: 7, bottom: 34, left: 9 };
    const result = await render(<CameraScreen />);

    expect(
      StyleSheet.flatten(result.getByTestId('camera-header-overlay').props.style),
    ).toEqual(expect.objectContaining({ top: 67, right: 19, left: 21 }));
    expect(
      StyleSheet.flatten(result.getByTestId('camera-bottom-overlay').props.style),
    ).toEqual(expect.objectContaining({ bottom: 46, right: 19, left: 21 }));
  });

  it('unmounts in background and revalidates auth before active remount', async () => {
    const result = await render(<CameraScreen />);
    await act(async () => {
      mockFocusCallback?.();
      await Promise.resolve();
    });
    expect(Platform.OS).toBe('ios');
    expect(ReactNative.AppState.currentState).toBe('active');
    expect(mockIsFocused).toBe(true);
    expect(mockGetAuthToken).toHaveBeenCalled();
    expect(result.getByTestId('camera-webview')).toBeTruthy();

    await act(async () => {
      mockAppStateCallback?.('background');
    });
    expect(result.queryByTestId('camera-webview')).toBeNull();

    mockGetAuthToken.mockReturnValue('active-revalidated-token');
    await act(async () => {
      mockAppStateCallback?.('active');
    });
    expect(result.getByTestId('camera-webview')).toBeTruthy();
    expect(requireWebViewProps().injectedJavaScriptBeforeContentLoaded).toContain(
      'active-revalidated-token',
    );

    mockIsFocused = false;
    await act(async () => {
      result.rerender(<CameraScreen />);
    });
    expect(result.queryByTestId('camera-webview')).toBeNull();
    await result.unmount();
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
    expect(result.getByText('2.0× · Reset')).toBeTruthy();
  });

  it('resets double-tap zoom without timing animation under Reduce Motion', async () => {
    mockReduceMotion = true;
    const result = await render(<CameraScreen />);
    await act(async () => {
      await Promise.resolve();
      mockPinchBegin?.();
      mockPinchUpdate?.({ scale: 2 });
      mockPinchEnd?.();
    });
    expect(result.getByText('2.0× · Reset')).toBeTruthy();
    mockWithTiming.mockClear();

    await act(async () => {
      mockDoubleTapEnd?.();
    });

    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(result.queryByLabelText('Reset zoom')).toBeNull();
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
    const fixture = createCameraDomFixture();
    const browserWindow = createFakeBrowserWindow({ removeItem, setItem });

    expect(script).toBeDefined();
    expect(script).not.toContain('<');
    expect(script).not.toContain('\u2028');
    expect(script).not.toContain('\u2029');
    executePresentationScript(script as string, fixture, browserWindow);

    expect(removeItem).toHaveBeenCalledWith('auth_token');
    expect(setItem).toHaveBeenCalledWith('auth_token', token);
  });

  it('starts presentation styling without auth injection when authentication is disabled', async () => {
    mockAuthEnabled = false;
    mockUser = null;
    mockGetAuthToken.mockReturnValue(null);
    const result = await render(<CameraScreen />);

    expect(result.getByTestId('camera-webview')).toBeTruthy();
    expect(requireWebViewProps().injectedJavaScriptBeforeContentLoaded).toBeDefined();
    expect(
      requireWebViewProps().injectedJavaScriptBeforeContentLoaded,
    ).not.toContain('auth_token');
    expect(requireWebViewProps().injectedJavaScript).toBeUndefined();
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
      ['https://camera-user', 'camera-credential@bambuddy.example/camera/1'].join(
        ':',
      ),
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
    const fixture = createCameraDomFixture();
    const browserWindow = createFakeBrowserWindow({
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    executePresentationScript(script as string, fixture, browserWindow);

    expect(storage.get('auth_token')).toBe('fresh-cold-launch-token');
    expect(requireWebViewProps().source.uri).not.toContain('fresh-cold-launch-token');
    expect(requireWebViewProps().source.uri).not.toContain('fresh-cold-launch-token');
  });

});

describe('CameraScreen iOS credential lifecycle', () => {
  beforeEach(() => {
    setPlatform('ios');
  });

  it('remounts with a replacement token and updates Fit without reloading', async () => {
    const firstToken = 'first-secret-token';
    const secondToken = 'second-secret-token';
    mockGetAuthToken.mockReturnValue(firstToken);
    const result = await render(<CameraScreen />);
    expect(mockWebViewMounts).toBe(1);

    mockGetAuthToken.mockReturnValue(secondToken);
    mockUser = { id: 8 };
    await result.rerender(<CameraScreen />);
    expect(mockWebViewMounts).toBe(2);
    expect(requireWebViewProps().injectedJavaScriptBeforeContentLoaded).toContain(secondToken);
    expect(renderedText(result)).not.toContain(firstToken);

    expect(requireWebViewProps().injectedJavaScriptBeforeContentLoaded).toContain(
      'object-fit: contain',
    );
    await pressAndFlush(result.getByLabelText('Fill camera viewport'));
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('object-fit: cover'),
    );
    expect(mockWebViewMounts).toBe(2);
    expect(result.getByLabelText('Show full camera image')).toBeTruthy();

    await act(async () => {
      mockPinchBegin?.();
      mockPinchUpdate?.({ scale: 2 });
      mockPinchEnd?.();
    });
    expect(result.getByText('2.0× · Reset')).toBeTruthy();
    await pressAndFlush(result.getByLabelText('More camera actions'));
    expect(result.getByText('Camera actions')).toBeTruthy();
    const source = requireWebViewProps().source;

    await act(async () => {
      setWindowDimensions(844, 390);
    });

    expect(result.queryByText('Camera actions')).toBeNull();
    expect(result.queryByLabelText('Printer One, Camera')).toBeNull();
    expect(result.queryByText('4%')).toBeNull();
    expect(result.getByLabelText('Refresh camera')).toBeTruthy();
    expect(mockWebViewMounts).toBe(2);
    expect(requireWebViewProps().source).toEqual(source);

    await act(async () => {
      setWindowDimensions(390, 844);
    });
    expect(result.getByLabelText('Printer One, Camera')).toBeTruthy();
    expect(result.getByLabelText('Show full camera image')).toBeTruthy();
    expect(result.getByText('2.0× · Reset')).toBeTruthy();
    expect(mockWebViewMounts).toBe(2);
  });
});

describe('CameraScreen Android renderer', () => {
  beforeEach(() => {
    setPlatform('android');
  });

  it('retains the Image renderer, controls, plate overlay, and no WebView', async () => {
    mockPlateDetectionEnabled = true;
    const result = await render(<CameraScreen />);
    expect(Platform.OS).toBe('android');
    const image = result.getByTestId('camera-stream-image');

    expect(image.props.source.uri).toContain('/printers/1/camera/stream');
    expect(image.props.resizeMode).toBe('contain');
    expect(result.queryByTestId('camera-webview')).toBeNull();
    expect(result.getByText('Plate detection area')).toBeTruthy();
    expect(result.getByLabelText('More camera actions')).toBeTruthy();
    expect(result.getByLabelText('Refresh camera')).toBeTruthy();
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    await result.unmount();
  });

  it('retains zoom gestures, Diagnose, fullscreen, light, and plate controls', async () => {
    const result = await render(<CameraScreen />);

    await act(async () => {
      mockPinchBegin?.();
      mockPinchUpdate?.({ scale: 2 });
      mockPinchEnd?.();
    });
    expect(result.getByText('2.0× · Reset')).toBeTruthy();

    await act(async () => {
      mockDoubleTapEnd?.();
    });
    expect(result.queryByLabelText('Reset zoom')).toBeNull();

    await pressAndFlush(result.getByLabelText('More camera actions'));
    await pressAndFlush(result.getByText('Diagnose camera'));
    expect(mockDiagnoseMutate).toHaveBeenCalled();
    expect(mockDiagnoseReset).toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(result.getByLabelText('Turn chamber light on'));
    });
    expect(mockDiagnoseMutate).toHaveBeenCalledTimes(2);

    await pressAndFlush(result.getByLabelText('Enable plate detection'));
    expect(mockMutationMutateAsync).toHaveBeenCalledWith(true);

    await act(async () => {
      fireEvent.press(result.getByLabelText('Fill camera viewport'));
    });
    expect(result.getByLabelText('Show full camera image')).toBeTruthy();
    await result.unmount();
  });

  it('shows recovery actions after timeout and reseeds the Image on Retry', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T12:00:00Z'));
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
    await result.unmount();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('clears the timeout when the first frame loads and when unmounted', async () => {
    jest.useFakeTimers();
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
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('isolates stream, zoom, and recovery state when switching printers', async () => {
    const result = await render(<CameraScreen />);
    const firstImage = result.getByTestId('camera-stream-image');
    await act(async () => {
      mockPinchBegin?.();
      mockPinchUpdate?.({ scale: 2 });
      mockPinchEnd?.();
    });
    expect(result.getByText('2.0× · Reset')).toBeTruthy();
    await fireEvent(firstImage, 'error');
    expect(result.getByText('Unable to load stream')).toBeTruthy();

    mockRouteId = '2';
    await result.rerender(<CameraScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.queryByText('Unable to load stream')).toBeNull();
    expect(result.queryByLabelText('Reset zoom')).toBeNull();
    expect(result.getByTestId('camera-stream-image').props.source.uri).toContain(
      '/printers/2/camera/stream',
    );
  });
});

describe('Camera iPhone orientation configuration', () => {
  const readFile = (path: string) =>
    (require('fs').readFileSync as (file: string, encoding: string) => string)(
      path,
      'utf8',
    );

  it('allows exactly portrait and both landscapes while preserving iPad settings', () => {
    const plist = readFile('ios/Bambuddy/Info.plist');
    const phoneOrientations = plist.match(
      /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/,
    )?.[1];
    const ipadOrientations = plist.match(
      /<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>([\s\S]*?)<\/array>/,
    )?.[1];

    expect(phoneOrientations?.match(/UIInterfaceOrientation\w+/g)).toEqual([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
    ]);
    expect(ipadOrientations).toContain('UIInterfaceOrientationPortraitUpsideDown');
  });

  it('locks only non-Camera iPhone screens to portrait in every navigator branch', () => {
    const navigator = readFile('src/navigation/RootNavigator.tsx');
    const cameraScreen = readFile('src/screens/CameraScreen.tsx');

    expect(navigator).toContain(
      "Platform.OS === 'ios' && !Platform.isPad",
    );
    expect(navigator).toContain("orientation: 'portrait_up' as const");
    expect(navigator).toContain(
      "locksIPhoneToPortrait ? { orientation: 'default' as const } : {}",
    );
    expect(navigator).toContain("Platform.OS === 'ios'");
    expect(navigator).toContain("presentation: 'fullScreenModal' as const");
    expect(navigator).toContain("contentStyle: { backgroundColor: '#000000' }");
    expect(navigator).toMatch(
      /name="Camera"[\s\S]*?headerShown: false,[\s\S]*?Platform\.OS === 'ios'[\s\S]*?presentation: 'fullScreenModal' as const[\s\S]*?: \{\}/,
    );
    expect(cameraScreen).toContain(
      'hidden={shouldHideCameraStatusBar(isFocused)}',
    );
    expect(cameraScreen).toContain('animated={false}');
    expect(cameraScreen).toContain('key={`${printerId}:${webViewGeneration}`}');
    expect(cameraScreen).not.toContain('key={`${width}');
  });

  it('treats only width greater than height as landscape', () => {
    expect(isCameraLandscape(844, 390)).toBe(true);
    expect(isCameraLandscape(390, 844)).toBe(false);
    expect(isCameraLandscape(390, 390)).toBe(false);
    expect(shouldHideCameraStatusBar(true)).toBe(true);
    expect(shouldHideCameraStatusBar(false)).toBe(false);
  });
});
