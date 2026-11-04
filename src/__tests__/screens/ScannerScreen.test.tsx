import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ScannerScreen from '@/screens/ScannerScreen';
import { buildApiKeyEnrollment } from '@/utils/authSecurity';

const mockReset = jest.fn();
const mockSetOptions = jest.fn();
const mockGoBack = jest.fn();
const mockLoginWithApiKey = jest.fn();
const mockSetServerUrl = jest.fn();
const mockToast = jest.fn();
const mockClearQueries = jest.fn();
let mockUser: { id: number } | null = null;
let mockMode = 'server';
let mockOnCodeScanned: (codes: { value: string }[]) => void;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ reset: mockReset, setOptions: mockSetOptions, goBack: mockGoBack }),
  useRoute: () => ({ params: { mode: mockMode } }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: mockClearQueries }),
}));
jest.mock('react-native-vision-camera', () => ({
  Camera: (props: Record<string, unknown>) => {
    const { View } = require('react-native');
    return require('react').createElement(View, { ...props, testID: 'scanner-camera' });
  },
  useCameraDevice: () => ({ id: 'back' }),
  useCameraPermission: () => ({ hasPermission: true, requestPermission: jest.fn() }),
  useCodeScanner: (options: { onCodeScanned: typeof mockOnCodeScanned }) => {
    mockOnCodeScanned = options.onCodeScanned;
    return options;
  },
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser, loading: false,
    loginWithApiKey: mockLoginWithApiKey,
    setServerConnected: jest.fn(),
  }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock('@/api/server', () => ({
  useServerStore: { getState: () => ({ setServerUrl: mockSetServerUrl }) },
}));
jest.mock('@/api/client', () => ({ api: { getAuthStatus: jest.fn() } }));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.dark }),
}));

async function scan(payload: string) {
  await act(async () => mockOnCodeScanned([{ value: payload }]));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mockMode = 'server';
  mockLoginWithApiKey.mockResolvedValue(undefined);
});

it('confirms native enrollment without displaying its key and waits for authenticated navigation', async () => {
  const view = await render(<ScannerScreen />);
  await scan(buildApiKeyEnrollment('https://farm.test', 'bb_private-fixture'));
  expect(view.getByText('Connect with API key?')).toBeTruthy();
  expect(view.getByText(/Connect to https:\/\/farm.test using/)).toBeTruthy();
  expect(view.queryByText(/bb_private-fixture/)).toBeNull();
  expect(mockLoginWithApiKey).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  expect(mockLoginWithApiKey).toHaveBeenCalledTimes(1);
  expect(mockLoginWithApiKey).toHaveBeenCalledWith('https://farm.test', 'bb_private-fixture');
  expect(mockSetServerUrl).not.toHaveBeenCalled();
  expect(mockClearQueries).toHaveBeenCalledTimes(1);
  expect(mockReset).not.toHaveBeenCalled();
  mockUser = { id: 7 };
  await view.rerender(<ScannerScreen />);
  expect(mockReset).toHaveBeenCalledWith({
    index: 0, routes: [{ name: 'Main', params: { screen: 'Dashboard' } }],
  });
});

it('cancels without connecting or immediately reopening the same QR confirmation', async () => {
  const view = await render(<ScannerScreen />);
  const payload = buildApiKeyEnrollment('https://farm.test', 'bb_fixture');
  await scan(payload);
  await fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
  await scan(payload);
  expect(view.queryByText('Connect with API key?')).toBeNull();
  expect(mockLoginWithApiKey).not.toHaveBeenCalled();
  expect(view.getByTestId('scanner-camera').props.isActive).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: 'Scan Another' }));
  await scan(payload);
  expect(view.getByText('Connect with API key?')).toBeTruthy();
});

it('pauses on invalid codes and on rejected credentials without repeated messages or raw errors', async () => {
  const view = await render(<ScannerScreen />);
  await act(async () => {
    mockOnCodeScanned([{ value: 'unsupported code' }]);
    mockOnCodeScanned([{ value: 'unsupported code' }]);
  });
  expect(view.getAllByText(/This QR code is not a supported/)).toHaveLength(1);
  expect(view.getByTestId('scanner-camera').props.isActive).toBe(false);
  expect(mockToast).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Scan Another' }));
  await scan(buildApiKeyEnrollment('https://farm.test', 'bb_fixture'));
  mockLoginWithApiKey.mockRejectedValue(new Error('Server error includes bb_secret'));
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  expect(view.getByText(/Could not connect with this API key/)).toBeTruthy();
  expect(view.queryByText(/bb_secret/)).toBeNull();
  expect(mockSetServerUrl).not.toHaveBeenCalled();
  expect(mockClearQueries).not.toHaveBeenCalled();
  expect(mockReset).not.toHaveBeenCalled();
});

it('warns explicitly before sending a key over local HTTP and preserves spool scanning', async () => {
  const view = await render(<ScannerScreen />);
  await scan(buildApiKeyEnrollment('http://192.168.1.4', 'bb_fixture'));
  expect(view.getByText(/using this API key over unencrypted HTTP/)).toBeTruthy();
  await view.unmount();
  mockMode = '';
  await render(<ScannerScreen />);
  await scan('spool:42');
  expect(mockReset).toHaveBeenCalledWith({
    index: 0, routes: [{ name: 'Inventory', params: { spool: '42' } }],
  });
});

it('shows a single recoverable camera error instead of exposing native diagnostics', async () => {
  const view = await render(<ScannerScreen />);
  await fireEvent(view.getByTestId('scanner-camera'), 'error', { message: 'native camera diagnostic' });
  expect(view.getByText(/The camera could not start/)).toBeTruthy();
  expect(view.getByTestId('scanner-camera').props.isActive).toBe(false);
  expect(view.queryByText(/native camera diagnostic/)).toBeNull();
});
