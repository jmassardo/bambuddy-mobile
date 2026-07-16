import React from 'react';
import { Text, TextInput } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import LoginScreen from '@/screens/LoginScreen';

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

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions, reset: mockReset }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@/api/client', () => ({
  api: {
    verify2FA: (...args: unknown[]) => mockVerify2FA(...args),
    forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
    forgotPasswordConfirm: (...args: unknown[]) => mockForgotPasswordConfirm(...args),
    getOIDCProviders: jest.fn(() => Promise.resolve([])),
    beginOIDCLogin: jest.fn(),
    exchangeOIDCToken: jest.fn(),
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
  useServerStore: (selector: (state: { serverUrl: string }) => unknown) =>
    selector({ serverUrl: 'https://bambuddy.test' }),
}));

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
  let current = findText(root, value);
  while (current) {
    if (typeof current.props.onPress === 'function') return current;
    current = current.parent;
  }
  throw new Error(`Pressable for text "${value}" not found`);
}

function findInput(root: ReactTestRenderer.ReactTestRenderer, placeholder: string) {
  return root.root.findAllByType(TextInput).find(node => node.props.placeholder === placeholder);
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogin.mockResolvedValue({ access_token: 'token', user: { id: 1, username: 'test', is_admin: true } });
    mockVerify2FA.mockResolvedValue({ access_token: 'token', user: { id: 1, username: 'test', is_admin: true } });
    mockForgotPassword.mockResolvedValue({ message: 'sent' });
    mockForgotPasswordConfirm.mockResolvedValue({ message: 'reset' });
    mockSetAuthToken.mockResolvedValue(undefined);
  });

  function renderScreen() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <QueryClientProvider client={client}>
          <LoginScreen />
        </QueryClientProvider>,
      );
    });
    return renderer;
  }

  it('renders username and password fields and keeps login disabled when empty', () => {
    const renderer = renderScreen();

    expect(findInput(renderer, 'Username')).toBeTruthy();
    expect(findInput(renderer, 'Password')).toBeTruthy();
    expect(findPressableForText(renderer, 'Login').props.disabled).toBe(true);
  });

  it('shows the 2FA input when a pre-auth token is returned', async () => {
    mockLogin.mockResolvedValue({ requires_2fa: true, pre_auth_token: 'pre-auth-token' });
    const renderer = renderScreen();

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

  it('shows the forgot password email form', async () => {
    const renderer = renderScreen();

    await act(async () => {
      await findPressableForText(renderer, 'Forgot password?').props.onPress();
    });

    expect(findInput(renderer, 'Email')).toBeTruthy();
    expect(findText(renderer, 'Send Reset Link')).not.toBeNull();
  });

  it('returns to the login form from the forgot password flow', async () => {
    const renderer = renderScreen();

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
});
