/* eslint-disable @typescript-eslint/no-shadow -- Test file with React/Text imports shadowing globals */
import React from 'react';
import { Linking, Text, TextInput } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import LoginScreen from '@/screens/LoginScreen';
import {
  clearTestQueryClients,
  createTestQueryClient,
} from '@/testUtils/queryClient';

const mockNavigate = jest.fn();
const mockReset = jest.fn();
const mockSetOptions = jest.fn();
const mockLogin = jest.fn();
const mockLoginWithToken = jest.fn();
const mockShowToast = jest.fn();
const mockVerify2FA = jest.fn();
const mockForgotPassword = jest.fn();
const mockForgotPasswordConfirm = jest.fn();
const mockSetAuthToken = jest.fn();
const mockSendEmail = jest.fn();
const mockPolicy = jest.fn();
const mockLDAPStatus = jest.fn();
const mockProviders = jest.fn();
const mockAuthorize = jest.fn();
const mockExchange = jest.fn();
const mockGetAuthStatus = jest.fn();
const mockSetServerUrl = jest.fn();
let mockServerUrl: string | null = 'https://bambuddy.test';
const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

jest.mock('@/api/auth', () => ({ authApi: {
  getAdvancedAuthStatus: () => mockPolicy(),
  getLDAPStatus: () => mockLDAPStatus(),
  sendEmailOTP: (token: string) => mockSendEmail(token),
} }));
jest.mock('@/components/settings/shared', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SwitchRow: (props: object) => React.createElement(View, props) };
});
jest.mock('@/components/common/OIDCAuthorizationBrowser', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { OIDCAuthorizationBrowser: (props: object) => React.createElement(View, { ...props, testID: 'oidcBrowser' }) };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions, reset: mockReset }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@/api/client', () => ({
  api: {
    getAuthStatus: () => mockGetAuthStatus(),
    verify2FA: (...args: unknown[]) => mockVerify2FA(...args),
    forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
    forgotPasswordConfirm: (...args: unknown[]) => mockForgotPasswordConfirm(...args),
    getOIDCProviders: () => mockProviders(),
    getOIDCAuthorizeUrl: (...args: unknown[]) => mockAuthorize(...args),
    beginOIDCLogin: jest.fn(),
    exchangeOIDCToken: (token: string) => mockExchange(token),
  },
  setAuthToken: (...args: unknown[]) => mockSetAuthToken(...args),
}));

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) =>
      React.createElement(View, props, children),
  };
});

jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Text, TextInput, View } = require('react-native');
  return {
    TextField: ({ label, ...props }: { label: string } & Record<string, unknown>) =>
      React.createElement(View, null, React.createElement(Text, null, label), React.createElement(TextInput, { placeholder: props.placeholder ?? label, ...props })),
    PrimaryButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
      React.createElement(View, { onPress, disabled }, React.createElement(Text, null, label)),
  };
});

jest.mock('@/components/common/StateScreens', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    LoadingScreen: ({ message }: { message: string }) =>
      React.createElement(Text, null, message),
  };
});

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    login: mockLogin,
    loginWithToken: mockLoginWithToken,
    loading: false,
    requiresSetup: false,
    serverConnected: true,
    setServerConnected: jest.fn(),
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
    isDark: true,
  }),
}));

jest.mock('@/api/server', () => ({
  isInsecureUrl: (url: string) => /^http:\/\//i.test(url),
  useServerStore: Object.assign((selector: (state: { serverUrl: string | null }) => unknown) =>
    selector({ serverUrl: mockServerUrl }), { getState: () => ({
      serverUrl: mockServerUrl,
      setServerUrl: (url: string) => mockSetServerUrl(url),
      clearServerUrl: jest.fn(),
    }) }),
}));
jest.mock('@/config/demo', () => ({ isDemoConfigured: () => false, demoConfig: {} }));

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    getInitialURL: jest.fn(() => Promise.resolve(null)),
    openURL: jest.fn(() => Promise.resolve()),
  },
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  openURL: jest.fn(() => Promise.resolve()),
}));

function textContent(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function findText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  return root.root.findAllByType(Text).find(node => textContent(node) === value) ?? null;
}

function findPressableForText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  for (const candidate of root.root.findAllByType(Text).filter(node => textContent(node) === value)) {
    let current: ReactTestInstance | null = candidate;
    while (current) {
      if (typeof current.props.onPress === 'function') return current;
      current = current.parent;
    }
  }
  throw new Error(`Pressable for text "${value}" not found`);
}

function findInput(root: ReactTestRenderer.ReactTestRenderer, placeholder: string) {
  return root.root.findAllByType(TextInput).find(node => node.props.placeholder === placeholder);
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerUrl = 'https://bambuddy.test';
    mockSetServerUrl.mockImplementation(async (url: string) => { mockServerUrl = url; });
    mockGetAuthStatus.mockResolvedValue({ auth_enabled: true, requires_setup: false });
    mockLogin.mockResolvedValue({ access_token: 'token', user: { id: 1, username: 'test', is_admin: true } });
    mockVerify2FA.mockResolvedValue({ access_token: 'token', user: { id: 1, username: 'test', is_admin: true } });
    mockForgotPassword.mockResolvedValue({ message: 'sent' });
    mockForgotPasswordConfirm.mockResolvedValue({ message: 'reset' });
    mockSetAuthToken.mockResolvedValue(undefined);
    mockPolicy.mockResolvedValue({ local_login_enabled: true, autologin_provider_id: null });
    mockLDAPStatus.mockResolvedValue({ ldap_enabled: false, ldap_configured: false });
    mockProviders.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ message: 'sent', pre_auth_token: 'rotated-token' });
    mockAuthorize.mockResolvedValue({ auth_url: 'https://identity/authorize?state=server-state&redirect_uri=https%3A%2F%2Fbambuddy.test%2Fapi%2Fv1%2Fauth%2Foidc%2Fcallback' });
    mockExchange.mockResolvedValue({ access_token: 'oidc-session', user: { id: 1, username: 'test', is_admin: true } });
  });

  afterEach(async () => {
    await act(async () => { renderers.splice(0).forEach(renderer => renderer.unmount()); });
    clearTestQueryClients();
  });

  async function renderScreen() {
    const client = createTestQueryClient();
    client.setDefaultOptions({ ...client.getDefaultOptions(), mutations: { retry: false, gcTime: 0 } });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <QueryClientProvider client={client}>
          <LoginScreen />
        </QueryClientProvider>,
      );
    });
    await act(async () => { await new Promise<void>(r => setTimeout(r, 10)); });
    renderers.push(renderer);
    return renderer;
  }

  it('renders username and password fields and keeps login disabled when empty', async () => {
    const renderer = await renderScreen();

    expect(findInput(renderer, 'Username')).toBeTruthy();
    expect(findInput(renderer, 'Password')).toBeTruthy();
    expect(findPressableForText(renderer, 'Login').props.disabled).toBe(true);
  });

  it('connects and signs in on the same form without sending credentials to an unconfirmed server', async () => {
    const renderer = await renderScreen();
    expect(findInput(renderer, 'https://bambuddy.example.com')!.props.value).toBe('https://bambuddy.test');
    await act(async () => {
      findInput(renderer, 'Username')!.props.onChangeText('operator');
      findInput(renderer, 'Password')!.props.onChangeText('password');
      findInput(renderer, 'https://bambuddy.example.com')!.props.onChangeText('https://another.test/');
    });
    expect(findPressableForText(renderer, 'Login').props.disabled).toBe(true);
    await act(async () => {
      findPressableForText(renderer, 'Connect').props.onPress();
      await new Promise<void>(r => setTimeout(r, 10));
    });
    expect(mockSetServerUrl).toHaveBeenCalledWith('https://another.test');
    expect(mockGetAuthStatus).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(findInput(renderer, 'Username')!.props.value).toBe('operator'));
    expect(findPressableForText(renderer, 'Login').props.disabled).toBe(false);
    await act(async () => { findPressableForText(renderer, 'Login').props.onPress(); });
    expect(mockLogin).toHaveBeenCalledWith('operator', 'password', true);
  });

  it('does not request authentication methods until a server is configured', async () => {
    mockServerUrl = null;
    const renderer = await renderScreen();
    expect(findInput(renderer, 'https://bambuddy.example.com')).toBeTruthy();
    expect(findText(renderer, 'Connect')).not.toBeNull();
    expect(mockPolicy).not.toHaveBeenCalled();
    expect(mockLDAPStatus).not.toHaveBeenCalled();
    expect(mockProviders).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('allows directory credentials when local-account login is disabled', async () => {
    mockPolicy.mockResolvedValue({ local_login_enabled: false, autologin_provider_id: null });
    mockLDAPStatus.mockResolvedValue({ ldap_enabled: true, ldap_configured: true });
    const renderer = await renderScreen();
    expect(findInput(renderer, 'Username')).toBeTruthy();
    expect(findInput(renderer, 'Password')).toBeTruthy();
    expect(findText(renderer, 'Forgot password?')).toBeNull();
    await act(async () => {
      findInput(renderer, 'Username')!.props.onChangeText('directory-user');
      findInput(renderer, 'Password')!.props.onChangeText('directory-password');
    });
    await act(async () => { findPressableForText(renderer, 'Login').props.onPress(); });
    expect(mockLogin).toHaveBeenCalledWith('directory-user', 'directory-password', true);
  });

  it('stays closed while both credential policies are unknown, then allows a confirmed LDAP provider', async () => {
    let resolveLDAP!: (status: { ldap_enabled: boolean; ldap_configured: boolean }) => void;
    mockPolicy.mockReturnValue(new Promise(() => {}));
    mockLDAPStatus.mockReturnValue(new Promise(resolve => { resolveLDAP = resolve; }));
    const renderer = await renderScreen();
    expect(findInput(renderer, 'Username')).toBeUndefined();
    expect(() => findPressableForText(renderer, 'Login')).toThrow();
    await act(async () => {
      resolveLDAP({ ldap_enabled: true, ldap_configured: true });
      await new Promise<void>(r => setTimeout(r, 10));
    });
    expect(findInput(renderer, 'Username')).toBeTruthy();
    expect(() => findPressableForText(renderer, 'Login')).not.toThrow();
  });

  it('does not delay confirmed local sign-in while LDAP status is unknown', async () => {
    mockLDAPStatus.mockReturnValue(new Promise(() => {}));
    const renderer = await renderScreen();
    expect(findInput(renderer, 'Username')).toBeTruthy();
    expect(() => findPressableForText(renderer, 'Login')).not.toThrow();
  });

  it('does not expose credentials if local login is disabled and LDAP status is unavailable', async () => {
    mockPolicy.mockResolvedValue({ local_login_enabled: false, autologin_provider_id: null });
    mockLDAPStatus.mockRejectedValue(new Error('Directory status unavailable'));
    const renderer = await renderScreen();
    expect(findInput(renderer, 'Username')).toBeUndefined();
    expect(() => findPressableForText(renderer, 'Login')).toThrow();
    expect(findText(renderer, 'Retry directory sign-in status')).not.toBeNull();
    mockLDAPStatus.mockResolvedValue({ ldap_enabled: true, ldap_configured: true });
    await act(async () => {
      findPressableForText(renderer, 'Retry directory sign-in status').props.onPress();
      await new Promise<void>(r => setTimeout(r, 10));
    });
    expect(findInput(renderer, 'Username')).toBeTruthy();
  });

  it('shows the 2FA input when a pre-auth token is returned', async () => {
    mockLogin.mockResolvedValue({ requires_2fa: true, pre_auth_token: 'pre-auth-token' });
    const renderer = await renderScreen();

    await act(async () => {
      findInput(renderer, 'Username')?.props.onChangeText('jenna');
      findInput(renderer, 'Password')?.props.onChangeText('hunter2');
    });

    await act(async () => {
      await findPressableForText(renderer, 'Login').props.onPress();
    });

    expect(findInput(renderer, 'Enter the authenticator app code')).toBeTruthy();
    expect(findText(renderer, 'Verify Code')).not.toBeNull();
  });

  it('verifies an authenticator code directly when multiple MFA methods are available', async () => {
    mockLogin.mockResolvedValue({ requires_2fa: true, pre_auth_token: 'pre', available_methods: ['backup', 'totp', 'email'] });
    const renderer = await renderScreen();
    await act(async () => {
      findInput(renderer, 'Username')!.props.onChangeText('operator');
      findInput(renderer, 'Password')!.props.onChangeText('password');
    });
    await act(async () => { findPressableForText(renderer, 'Login').props.onPress(); });
    await act(async () => { findInput(renderer, 'Enter the authenticator app code')!.props.onChangeText('123456'); });
    expect(findPressableForText(renderer, 'Verify Code').props.disabled).toBe(false);
    expect(findText(renderer, 'Verification method')).toBeNull();
    expect(findText(renderer, 'Authenticator app')).toBeNull();
    expect(findText(renderer, 'BACKUP')).toBeNull();
    const labels = renderer.root.findAllByType(Text).map(textContent);
    expect(labels.indexOf('Use Backup Code')).toBeGreaterThan(labels.lastIndexOf('Verify Code'));
    expect(labels.indexOf('Use Backup Code')).toBeLessThan(labels.indexOf('Back to sign in'));
    await act(async () => { findPressableForText(renderer, 'Verify Code').props.onPress(); });
    expect(mockVerify2FA).toHaveBeenCalledWith({ pre_auth_token: 'pre', code: '123456', method: 'totp' });
  });

  it('switches between backup and authenticator codes below verification without reusing entered codes', async () => {
    mockLogin.mockResolvedValue({ requires_2fa: true, pre_auth_token: 'pre', available_methods: ['totp', 'backup', 'email'] });
    const renderer = await renderScreen();
    await act(async () => {
      findInput(renderer, 'Username')!.props.onChangeText('operator');
      findInput(renderer, 'Password')!.props.onChangeText('password');
    });
    await act(async () => { findPressableForText(renderer, 'Login').props.onPress(); });
    await act(async () => { findInput(renderer, 'Enter the authenticator app code')!.props.onChangeText('123456'); });
    await act(async () => { findPressableForText(renderer, 'Use Backup Code').props.onPress(); });
    expect(findInput(renderer, 'Enter a complete backup code')!.props.value).toBe('');
    expect(findInput(renderer, 'Enter a complete backup code')!.props.keyboardType).toBe('default');
    expect(findPressableForText(renderer, 'Verify Code').props.disabled).toBe(true);
    await act(async () => { findInput(renderer, 'Enter a complete backup code')!.props.onChangeText('AbCd-1234-EfGh'); });
    await act(async () => { findPressableForText(renderer, 'Verify Code').props.onPress(); });
    expect(mockVerify2FA).toHaveBeenCalledWith({ pre_auth_token: 'pre', code: 'AbCd-1234-EfGh', method: 'backup' });
    await act(async () => { findPressableForText(renderer, 'Use Authenticator App').props.onPress(); });
    expect(findInput(renderer, 'Enter the authenticator app code')!.props.value).toBe('');
    await act(async () => { findPressableForText(renderer, 'Use Email Code').props.onPress(); });
    expect(findInput(renderer, 'Enter the email verification code')).toBeTruthy();
    expect(findText(renderer, 'Send email code')).not.toBeNull();
  });

  it('shows the forgot password email form', async () => {
    const renderer = await renderScreen();

    await act(async () => {
      await findPressableForText(renderer, 'Forgot password?').props.onPress();
    });

    expect(findInput(renderer, 'Email')).toBeTruthy();
    expect(findText(renderer, 'Send Reset Link')).not.toBeNull();
  });

  it('returns to the login form from the forgot password flow', async () => {
    const renderer = await renderScreen();

    await act(async () => {
      await findPressableForText(renderer, 'Forgot password?').props.onPress();
    });
    expect(findInput(renderer, 'Email')).toBeTruthy();

    await act(async () => {
      await findPressableForText(renderer, 'Back to login').props.onPress();
    });

    expect(findInput(renderer, 'Email')).toBeUndefined();
    expect(findInput(renderer, 'Username')).toBeTruthy();
    expect(findInput(renderer, 'Password')).toBeTruthy();
  });

  it('requests/resends challenge-bound email codes and verifies with the rotated pre-auth token', async () => {
    mockLogin.mockResolvedValue({ requires_2fa: true, pre_auth_token: 'original-token', available_methods: ['email'] });
    const renderer = await renderScreen();
    await act(async () => {
      findInput(renderer, 'Username')!.props.onChangeText('operator');
      findInput(renderer, 'Password')!.props.onChangeText('password');
    });
    await act(async () => { await findPressableForText(renderer, 'Login').props.onPress(); });
    await act(async () => { findPressableForText(renderer, 'Send email code').props.onPress(); await new Promise<void>(r => setTimeout(r, 10)); });
    expect(mockSendEmail).toHaveBeenCalledWith('original-token');
    await act(async () => { findPressableForText(renderer, 'Resend email code').props.onPress(); await new Promise<void>(r => setTimeout(r, 10)); });
    expect(mockSendEmail).toHaveBeenLastCalledWith('rotated-token');
    await act(async () => { findInput(renderer, 'Enter the email verification code')!.props.onChangeText('123456'); });
    await act(async () => { await findPressableForText(renderer, 'Verify Code').props.onPress(); });
    expect(mockVerify2FA).toHaveBeenCalledWith({ pre_auth_token: 'rotated-token', code: '123456', method: 'email' });
  });

  it('surfaces email delivery failure and allows returning to fresh credentials', async () => {
    mockLogin.mockResolvedValue({ requires_2fa: true, pre_auth_token: 'pre', available_methods: ['email'] });
    mockSendEmail.mockRejectedValue(new Error('Delivery unavailable'));
    const renderer = await renderScreen();
    await act(async () => {
      findInput(renderer, 'Username')!.props.onChangeText('operator'); findInput(renderer, 'Password')!.props.onChangeText('password');
    });
    await act(async () => { await findPressableForText(renderer, 'Login').props.onPress(); });
    await act(async () => { findPressableForText(renderer, 'Send email code').props.onPress(); await new Promise<void>(r => setTimeout(r, 10)); });
    expect(findText(renderer, 'Delivery unavailable')).not.toBeNull();
    await act(async () => { findPressableForText(renderer, 'Back to sign in').props.onPress(); });
    expect(findInput(renderer, 'Password')!.props.value).toBe('');
    expect(findText(renderer, 'Verify Code')).toBeNull();
  });

  it('uses a text keyboard for complete alphanumeric backup codes', async () => {
    mockLogin.mockResolvedValue({ requires_2fa: true, pre_auth_token: 'pre', available_methods: ['backup'] });
    const renderer = await renderScreen();
    await act(async () => {
      findInput(renderer, 'Username')!.props.onChangeText('operator'); findInput(renderer, 'Password')!.props.onChangeText('password');
    });
    await act(async () => { await findPressableForText(renderer, 'Login').props.onPress(); });
    const input = findInput(renderer, 'Enter a complete backup code')!;
    expect(input.props.keyboardType).toBe('default');
    await act(async () => { input.props.onChangeText('aBcD-1234-EfGh'); });
    await act(async () => { await findPressableForText(renderer, 'Verify Code').props.onPress(); });
    expect(mockVerify2FA).toHaveBeenCalledWith({ pre_auth_token: 'pre', code: 'aBcD-1234-EfGh', method: 'backup' });
  });

  it('respects disabled local login and starts automatic SSO once, with cancellation fallback', async () => {
    mockPolicy.mockResolvedValue({ local_login_enabled: false, autologin_provider_id: 3 });
    mockProviders.mockResolvedValue([{ id: 3, name: 'Identity', has_icon: false, is_autologin: true }]);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (b: Uint8Array) => { b.fill(1); return b; } } });
    const renderer = await renderScreen();
    await act(async () => { await new Promise<void>(r => setTimeout(r, 10)); });
    expect(findInput(renderer, 'Username')).toBeUndefined();
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.root.findByProps({ testID: 'oidcBrowser' }).props.onCancel(); });
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(findText(renderer, 'Sign in with Identity')).not.toBeNull();
    await act(async () => { findPressableForText(renderer, 'Sign in with Identity').props.onPress(); await new Promise<void>(r => setTimeout(r, 10)); });
    await act(async () => { renderer.root.findByProps({ testID: 'oidcBrowser' }).props.onToken('exchange-token'); await new Promise<void>(r => setTimeout(r, 10)); });
    expect(mockExchange).toHaveBeenCalledWith('exchange-token');
    expect(mockLoginWithToken).toHaveBeenCalledWith('oidc-session', expect.objectContaining({ id: 1 }), true);
  });

  it('starts automatic SSO again after confirming a different server', async () => {
    mockPolicy.mockResolvedValue({ local_login_enabled: false, autologin_provider_id: 3 });
    mockProviders.mockResolvedValue([{ id: 3, name: 'Identity', has_icon: false, is_autologin: true }]);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (b: Uint8Array) => { b.fill(3); return b; } } });
    mockAuthorize.mockImplementation(async (_providerId: number, state: string) => ({ auth_url: `https://identity/authorize?state=${state}&redirect_uri=${encodeURIComponent(`${mockServerUrl}/api/v1/auth/oidc/callback`)}` }));
    const renderer = await renderScreen();
    await waitFor(() => expect(renderer.root.findByProps({ testID: 'oidcBrowser' })).toBeTruthy());
    await act(async () => { renderer.root.findByProps({ testID: 'oidcBrowser' }).props.onCancel(); });
    await act(async () => { findInput(renderer, 'https://bambuddy.example.com')!.props.onChangeText('https://another.test'); });
    await act(async () => { findPressableForText(renderer, 'Connect').props.onPress(); });
    await waitFor(() => {
      expect(mockAuthorize).toHaveBeenCalledTimes(2);
      expect(renderer.root.findByProps({ testID: 'oidcBrowser' }).props.serverUrl).toContain('another.test');
    });
  });

  it('rejects mismatched native callback state and completes a fresh state-checked native exchange', async () => {
    mockProviders.mockResolvedValue([{ id: 3, name: 'Identity', has_icon: false, is_autologin: false }]);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (b: Uint8Array) => { b.fill(2); return b; } } });
    const renderer = await renderScreen();
    await act(async () => { findPressableForText(renderer, 'Sign in with Identity').props.onPress(); await new Promise<void>(r => setTimeout(r, 10)); });
    const handleUrl = jest.mocked(Linking.addEventListener).mock.calls.at(-1)![1];
    await act(async () => { await handleUrl({ url: 'bambuddy://login?oidc_token=bad&state=wrong' }); });
    expect(mockExchange).not.toHaveBeenCalled();
    await act(async () => { findPressableForText(renderer, 'Sign in with Identity').props.onPress(); await new Promise<void>(r => setTimeout(r, 10)); });
    const state = mockAuthorize.mock.calls.at(-1)![1];
    await act(async () => { await handleUrl({ url: `bambuddy://login?oidc_token=good&state=${state}` }); });
    expect(mockExchange).toHaveBeenCalledWith('good');
  });
});
