import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { QueryClientProvider } from '@tanstack/react-query';
import ServerSetupScreen from '@/screens/ServerSetupScreen';
import {
  clearTestQueryClients,
  createTestQueryClient,
} from '@/testUtils/queryClient';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();
const mockLogin = jest.fn();
const mockSetServerConnected = jest.fn();
const mockShowToast = jest.fn();
const mockGetAuthStatus = jest.fn();
const mockSetServerUrl = jest.fn();
const mockSetDemoMode = jest.fn();
const mockClearServerUrl = jest.fn();
const mockIsDemoConfigured = jest.fn();

let mockServerUrl: string | null = null;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions }),
}));

jest.mock('@/api/client', () => ({
  api: { getAuthStatus: (...args: unknown[]) => mockGetAuthStatus(...args) },
}));

jest.mock('@/api/server', () => ({
  isInsecureUrl: (url: string) => /^http:\/\//i.test(url),
  useServerStore: Object.assign(
    (selector: (state: { serverUrl: string | null }) => unknown) =>
      selector({ serverUrl: mockServerUrl }),
    {
      getState: () => ({
        setServerUrl: (...args: unknown[]) => mockSetServerUrl(...args),
        setDemoMode: (...args: unknown[]) => mockSetDemoMode(...args),
        clearServerUrl: (...args: unknown[]) => mockClearServerUrl(...args),
      }),
    },
  ),
}));

jest.mock('@/config/demo', () => ({
  demoConfig: {
    url: 'https://demo.test',
    username: 'reviewer',
    password: 'secret',
  },
  isDemoConfigured: () => mockIsDemoConfigured(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    setServerConnected: mockSetServerConnected,
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

jest.mock('@/components/common/AppUI', () => {
  const ReactLib = require('react');
  const { Text: RNText, TextInput, View } = require('react-native');
  return {
    TextField: ({ label, ...props }: { label: string } & Record<string, unknown>) =>
      ReactLib.createElement(
        View,
        null,
        ReactLib.createElement(RNText, null, label),
        ReactLib.createElement(TextInput, { placeholder: props.placeholder ?? label, ...props }),
      ),
    PrimaryButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
      ReactLib.createElement(View, { onPress, disabled }, ReactLib.createElement(RNText, null, label)),
  };
});

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

async function render() {
  const client = createTestQueryClient();
  let root!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    root = ReactTestRenderer.create(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(ServerSetupScreen),
      ),
    );
  });
  return root;
}

describe('ServerSetupScreen demo button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerUrl = null;
    mockIsDemoConfigured.mockReturnValue(true);
    mockGetAuthStatus.mockResolvedValue({ auth_enabled: true, requires_setup: false });
    mockLogin.mockResolvedValue({ access_token: 'token', user: { id: 1, username: 'reviewer' } });
    mockSetServerUrl.mockResolvedValue(undefined);
    mockSetDemoMode.mockResolvedValue(undefined);
    mockClearServerUrl.mockResolvedValue(undefined);
  });

  afterEach(clearTestQueryClients);

  it('is hidden when the build has no demo configuration', async () => {
    mockIsDemoConfigured.mockReturnValue(false);
    const root = await render();
    expect(findText(root, 'Try the demo')).toBeNull();
  });

  it('is shown when the build has a demo configuration', async () => {
    const root = await render();
    expect(findText(root, 'Try the demo')).not.toBeNull();
  });

  it('connects to the demo server and signs in automatically', async () => {
    const root = await render();
    await act(async () => {
      findPressableForText(root, 'Try the demo').props.onPress();
    });

    expect(mockSetServerUrl).toHaveBeenCalledWith('https://demo.test');
    expect(mockGetAuthStatus).toHaveBeenCalled();
    expect(mockLogin).toHaveBeenCalledWith('reviewer', 'secret');
    expect(mockSetDemoMode).toHaveBeenCalledWith(true);
    expect(mockSetServerConnected).toHaveBeenCalledWith(true);
    expect(mockClearServerUrl).not.toHaveBeenCalled();
  });

  it('rolls back the stored server URL when the demo login fails', async () => {
    mockLogin.mockRejectedValue(new Error('nope'));
    const root = await render();
    await act(async () => {
      findPressableForText(root, 'Try the demo').props.onPress();
    });

    expect(mockClearServerUrl).toHaveBeenCalled();
    expect(mockSetDemoMode).not.toHaveBeenCalled();
    expect(mockSetServerConnected).not.toHaveBeenCalled();
    expect(findText(root, 'nope')).not.toBeNull();
  });

  it('does not enter demo mode when the demo account requires 2FA', async () => {
    mockLogin.mockResolvedValue({ requires_2fa: true, pre_auth_token: 'pre' });
    const root = await render();
    await act(async () => {
      findPressableForText(root, 'Try the demo').props.onPress();
    });

    expect(mockSetDemoMode).not.toHaveBeenCalled();
    expect(mockClearServerUrl).toHaveBeenCalled();
  });
});

describe('ServerSetupScreen insecure URL warning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerUrl = null;
    mockIsDemoConfigured.mockReturnValue(false);
    mockGetAuthStatus.mockResolvedValue({ auth_enabled: true, requires_setup: false });
  });

  afterEach(clearTestQueryClients);

  it('shows an HTTP warning when the stored URL uses plain HTTP', async () => {
    mockServerUrl = 'http://192.168.1.100:8080';
    const root = await render();
    const warning = findText(
      root,
      '⚠️ Plain HTTP is only supported for servers on your local network. Public servers require HTTPS.',
    );
    expect(warning).not.toBeNull();
  });

  it('does not show an HTTP warning when the stored URL uses HTTPS', async () => {
    mockServerUrl = 'https://bambuddy.example.com';
    const root = await render();
    const warning = findText(
      root,
      '⚠️ Plain HTTP is only supported for servers on your local network. Public servers require HTTPS.',
    );
    expect(warning).toBeNull();
  });
});
