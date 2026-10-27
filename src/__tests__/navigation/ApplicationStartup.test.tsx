import React from 'react';
import { Linking } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { useUiPreferencesStore } from '@/store/uiPreferencesStore';
import { BUILT_IN_NAV_ITEMS } from '@/navigation/navigationConfig';

const mockResetRoot = jest.fn();
const mockNavigate = jest.fn();
const mockAuth = {
  user: null as { id: number } | null,
  authEnabled: true,
  loading: false,
  requiresSetup: false,
};
let mockServerUrl = 'https://configured.test';
let mockLinkListener: ((event: { url: string }) => void) | undefined;
let mockInitialURL: string | null = null;
const mockRemoveLinkListener = jest.fn();
const mockLoadServerUrl = jest.fn();
const mockPushRender = jest.fn();
const mockItems = { items: [...BUILT_IN_NAV_ITEMS], loading: false };
const mockToastContext = React.createContext(false);
const mockAuthContext = React.createContext(false);

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: {
    getInitialURL: jest.fn(() => Promise.resolve(mockInitialURL)),
    addEventListener: jest.fn((_event, listener) => {
      mockLinkListener = listener;
      return { remove: mockRemoveLinkListener };
    }),
  },
}));
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => ({
    isReady: () => true,
    resetRoot: (...args: unknown[]) => mockResetRoot(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
  }),
  NavigationContainer: ({ children, onReady }: { children: React.ReactNode; onReady: () => void }) => {
    require('react').useEffect(onReady, []);
    return children;
  },
}));
jest.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) =>
    require('react').createElement(mockAuthContext.Provider, { value: true }, children),
  useAuth: () => mockAuth,
}));
jest.mock('@/contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) =>
    require('react').createElement(mockToastContext.Provider, { value: true }, children),
}));
jest.mock('@/contexts/PushNotificationContext', () => ({
  PushNotificationProvider: ({ children }: { children: React.ReactNode }) => {
    if (!require('react').useContext(mockToastContext)) throw new Error('Push notifications require ToastProvider');
    mockPushRender();
    return children;
  },
}));
jest.mock('@/contexts/SliceJobTrackerContext', () => ({
  SliceJobTrackerProvider: ({ children }: { children: React.ReactNode }) => children,
  SliceJobStatusBanner: () => null,
}));
jest.mock('@/components/system/BugReportTools', () => ({
  BugReportCollectionGuard: () => {
    require('@tanstack/react-query').useQueryClient();
    if (!require('react').useContext(mockAuthContext)) throw new Error('Collection guard requires AuthProvider');
    return null;
  },
}));
jest.mock('@/components/common/AnnouncementBanner', () => ({ AnnouncementBanner: () => null }));
jest.mock('@/components/common/ServerPreferencesSync', () => ({ ServerPreferencesSync: () => null }));
jest.mock('@/components/common/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('@/navigation/RootNavigator', () => () => null);
jest.mock('@/navigation/useNavigationItems', () => ({ useNavigationItems: () => mockItems }));
jest.mock('@/hooks/useOffline', () => ({ useOffline: () => ({ isOffline: false }) }));
jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { serverUrl: string; loading: boolean; loadServerUrl: () => void }) => unknown) =>
    selector({ serverUrl: mockServerUrl, loading: false, loadServerUrl: mockLoadServerUrl }),
}));
jest.mock('@/theme', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ colors: { background: 'black', text: 'white' } }),
}));

describe('application startup navigation', () => {
  const consentURL = 'bambuddy://connect/authorize?client_id=client&redirect_uri=client%3A%2F%2Fcallback&code_challenge=challenge&code_challenge_method=S256';

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.user = null;
    mockAuth.authEnabled = true;
    mockServerUrl = 'https://configured.test';
    mockItems.items = [...BUILT_IN_NAV_ITEMS];
    mockItems.loading = false;
    mockInitialURL = null;
    mockLinkListener = undefined;
    useUiPreferencesStore.setState({ loaded: true, landingPage: 'queue' });
  });

  it('applies the saved landing once on sign-in without resetting browsing or preference edits', async () => {
    const view = await render(<App />);
    expect(mockResetRoot).not.toHaveBeenCalled();
    expect(mockPushRender).not.toHaveBeenCalled();
    mockAuth.user = { id: 1 };
    await view.rerender(<App />);
    await waitFor(() => expect(mockResetRoot).toHaveBeenCalledWith({
      index: 0, routes: [{ name: 'Main', params: { screen: 'Queue' } }],
    }));
    expect(mockPushRender).toHaveBeenCalled();
    await act(() => useUiPreferencesStore.setState({ landingPage: 'files' }));
    await view.rerender(<App />);
    expect(mockResetRoot).toHaveBeenCalledTimes(1);
    mockAuth.user = null;
    await view.rerender(<App />);
    mockAuth.user = { id: 1 };
    await view.rerender(<App />);
    expect(mockResetRoot).toHaveBeenCalledTimes(2);
    expect(mockResetRoot.mock.calls[1][0].routes[0].params.screen).toBe('Files');
  });

  it('retains cold-start consent through server setup and sign-in on the configured server', async () => {
    mockInitialURL = `${consentURL}&server=https://untrusted.test`;
    mockServerUrl = '';
    const view = await render(<App />);
    await waitFor(() => expect(Linking.getInitialURL).toHaveBeenCalled());
    expect(mockResetRoot).not.toHaveBeenCalled();
    mockServerUrl = 'https://configured.test';
    await view.rerender(<App />);
    expect(mockResetRoot).not.toHaveBeenCalled();
    mockAuth.user = { id: 1 };
    await view.rerender(<App />);
    await waitFor(() => expect(mockResetRoot).toHaveBeenCalledTimes(1));
    const entry = mockResetRoot.mock.calls[0][0];
    expect(entry.routes[entry.index]).toEqual({
      name: 'ConnectAuthorize',
      params: { client_id: 'client', redirect_uri: 'client://callback', code_challenge: 'challenge', code_challenge_method: 'S256' },
    });
    expect(mockServerUrl).toBe('https://configured.test');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('queues a warm consent link while signed out and navigates without resetting an active session', async () => {
    const view = await render(<App />);
    await act(() => mockLinkListener?.({ url: consentURL }));
    expect(mockNavigate).not.toHaveBeenCalled();
    mockAuth.user = { id: 1 };
    await view.rerender(<App />);
    await waitFor(() => expect(mockResetRoot).toHaveBeenCalledTimes(1));
    await act(() => mockLinkListener?.({ url: `${consentURL}&state=next` }));
    expect(mockNavigate).toHaveBeenCalledWith('ConnectAuthorize', expect.objectContaining({ state: 'next' }));
    expect(mockResetRoot).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(mockRemoveLinkListener).toHaveBeenCalled();
  });

  it('waits for hydrated preferences and resolved visibility before the first landing', async () => {
    mockAuth.user = { id: 1 };
    mockItems.loading = true;
    useUiPreferencesStore.setState({ loaded: false, landingPage: 'finance' });
    const view = await render(<App />);
    expect(mockResetRoot).not.toHaveBeenCalled();
    await act(() => useUiPreferencesStore.setState({ loaded: true }));
    expect(mockResetRoot).not.toHaveBeenCalled();
    mockItems.loading = false;
    mockItems.items = BUILT_IN_NAV_ITEMS.filter(item => ['files', 'more'].includes(item.id));
    await view.rerender(<App />);
    await waitFor(() => expect(mockResetRoot).toHaveBeenCalledWith({
      index: 0, routes: [{ name: 'Main', params: { screen: 'Files' } }],
    }));
  });
});
