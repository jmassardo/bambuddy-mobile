import React from 'react';
import { Alert, AppState, Share } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Clipboard from '@react-native-clipboard/clipboard';
import CameraIntegrationsScreen, { CameraTokenManager } from '@/screens/CameraIntegrationsScreen';
import CameraWallScreen, { wallLiveIds } from '@/screens/CameraWallScreen';
import { camerasApi } from '@/api/cameras';
import { printersApi } from '@/api/printers';
import type { CameraIntegrationToken, Printer, PrinterStatus } from '@/types/api';
import { ApiKeysSettingsSection } from '@/components/settings/ApiKeysSettingsSection';
import type { SettingsScreenController } from '@/components/settings/useSettingsScreenController';

let mockAdmin = false;
let mockFocused = true;
let mockUser: { id: number } | null = { id: 3 };
let mockActiveHandler: ((state: string) => void) | null = null;
let mockViewable: ((value: { viewableItems: { item: { id: number } }[] }) => void) | null = null;
const mockNavigate = jest.fn();
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: { text: '#fff', background: '#000', border: '#333' } }) }));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: mockAdmin, user: mockUser, authEnabled: true, hasPermission: () => true }),
}));
jest.mock('@/api/server', () => ({ useServerStore: (select: (state: { serverUrl: string }) => unknown) => select({ serverUrl: 'https://farm' }) }));
jest.mock('@/api/http', () => ({ getAuthToken: () => 'login-secret' }));
jest.mock('@/api/cameras', () => ({ camerasApi: { tokens: jest.fn(), createToken: jest.fn(), revokeToken: jest.fn() } }));
jest.mock('@/api/printers', () => ({ printersApi: { getPrinters: jest.fn(), getPrinterStatus: jest.fn() } }));
jest.mock('@/components/printers/OverlayPreview', () => ({
  OverlayPreview: () => { const { Text: MockText } = require('react-native'); return <MockText>Running overlay preview</MockText>; },
}));
jest.mock('@/components/printers/ScopedCameraStream', () => ({
  ScopedCameraStream: ({ printerId }: { printerId: number }) => { const { Text: MockText } = require('react-native'); return <MockText>{`live ${printerId}`}</MockText>; },
}));
jest.mock('@/components/printers/CameraSnapshot', () => ({
  CameraSnapshot: ({ printerId }: { printerId: number }) => { const { Text: MockText } = require('react-native'); return <MockText>{`snapshot ${printerId}`}</MockText>; },
}));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused, useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }));
jest.mock('@/components/common/AppUI', () => {
  const { View: MockView, Text: MockText, TextInput: MockTextInput, Pressable: MockPressable } = require('react-native');
  return {
    SectionCard: ({ title, children }: { title?: string; children: React.ReactNode }) => <MockView><MockText>{title}</MockText>{children}</MockView>,
    TextField: ({ label, ...props }: { label: string }) => <MockTextInput accessibilityLabel={label} {...props} />,
    PrimaryButton: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => <MockPressable disabled={disabled} accessibilityRole="button" onPress={onPress}><MockText>{label}</MockText></MockPressable>,
  };
});

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const MockFlatList = ({ data, renderItem, onViewableItemsChanged }: {
      data: { id: number }[];
      renderItem: (args: { item: { id: number } }) => React.ReactNode;
      onViewableItemsChanged: typeof mockViewable;
    }) => {
      mockViewable = onViewableItemsChanged;
      return <actual.View>{data.map(item => <actual.View key={item.id}>{renderItem({ item })}</actual.View>)}</actual.View>;
    };
  return new Proxy(actual, { get: (target, key) => key === 'FlatList' ? MockFlatList : target[key] });
});

const created: CameraIntegrationToken = {
  id: 12, user_id: 3, name: 'OBS', scope: 'overlay', token: 'one-time-secret',
  lookup_prefix: 'bblt_123', created_at: '2026-10-27T00:00:00Z', expires_at: '2026-11-27T00:00:00Z', last_used_at: null,
};
const printers = [{ id: 7, name: 'Seven' }, { id: 8, name: 'Eight' }, { id: 9, name: 'Offline' }] as Printer[];

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAdmin = false;
  mockFocused = true;
  mockUser = { id: 3 };
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.mocked(camerasApi.tokens).mockResolvedValue([{ ...created, token: null }]);
  jest.mocked(camerasApi.createToken).mockResolvedValue(created);
  jest.mocked(camerasApi.revokeToken).mockResolvedValue(undefined);
  jest.mocked(printersApi.getPrinters).mockResolvedValue(printers as (Printer & Record<string, unknown>)[]);
  jest.mocked(printersApi.getPrinterStatus).mockImplementation(async id => ({ connected: id !== 9, state: 'RUNNING', progress: 10 } as PrinterStatus));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    mockActiveHandler = callback as (state: string) => void;
    return { remove: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());

it('creates scoped tokens, explicitly copies/shares one-time secret and selected-printer URL, then forgets it', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  const result = await render(<CameraTokenManager printerId={7} />, { wrapper: Wrapper });
  await fireEvent.changeText(result.getByLabelText('Token name'), 'OBS');
  await fireEvent.press(result.getByText('overlay'));
  await fireEvent.press(result.getByText('Create camera token'));
  await waitFor(() => expect(result.getByText('one-time-secret')).toBeTruthy());
  expect(camerasApi.createToken).toHaveBeenCalledWith('OBS', 30, 'overlay');
  const copies = result.getAllByText('Copy');
  await fireEvent.press(copies[0]);
  expect(Clipboard.setString).toHaveBeenCalledWith('one-time-secret');
  await fireEvent.press(copies[1]);
  expect(Clipboard.setString).toHaveBeenLastCalledWith('https://farm/overlay/7?token=one-time-secret');
  await fireEvent.press(result.getAllByText('Share')[0]);
  expect(share).toHaveBeenCalledWith({ message: 'one-time-secret' });
  await fireEvent.press(result.getByText('Dismiss'));
  expect(result.queryByText('one-time-secret')).toBeNull();
  await result.rerender(<CameraTokenManager printerId={7} />);
  expect(result.queryByText('one-time-secret')).toBeNull();
});

it('separates personal/admin review, shows owner/scope and confirms revoke', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const result = await render(<CameraTokenManager printerId={7} />, { wrapper: Wrapper });
  await waitFor(() => expect(result.getByText('Owner #3 · Scope overlay · Prefix bblt_123')).toBeTruthy());
  expect(camerasApi.tokens).toHaveBeenCalledWith(false);
  await fireEvent.press(result.getByText('Show all users’ tokens (admin)'));
  expect(camerasApi.tokens).not.toHaveBeenCalledWith(true);
  mockAdmin = true;
  await result.rerender(<CameraTokenManager printerId={7} />);
  await fireEvent.press(result.getByText('Show all users’ tokens (admin)'));
  await waitFor(() => expect(camerasApi.tokens).toHaveBeenCalledWith(true));
  await waitFor(() => expect(result.getByText('Revoke token')).toBeTruthy());
  await fireEvent.press(result.getByText('Revoke token'));
  expect(camerasApi.revokeToken).not.toHaveBeenCalled();
  const confirm = alert.mock.calls[0][2]?.find(button => button.style === 'destructive');
  await act(async () => confirm?.onPress?.());
  await waitFor(() => expect(camerasApi.revokeToken).toHaveBeenCalledWith(12, expect.anything()));
});

it('unmounts unused overlay preview when toggled off and in background', async () => {
  const result = await render(<CameraIntegrationsScreen />, { wrapper: Wrapper });
  await fireEvent.press(result.getByText('Preview overlay'));
  expect(result.getByText('Running overlay preview')).toBeTruthy();
  await fireEvent.press(result.getByText('Stop preview'));
  expect(result.queryByText('Running overlay preview')).toBeNull();
  await fireEvent.press(result.getByText('Preview overlay'));
  await act(async () => mockActiveHandler?.('background'));
  expect(result.queryByText('Running overlay preview')).toBeNull();
});

it('bounds live tiles to visible online printers, falls back to snapshots and pauses on background', async () => {
  const result = await render(<CameraWallScreen />, { wrapper: Wrapper });
  await waitFor(() => expect(result.getByText('Seven')).toBeTruthy());
  await act(async () => mockViewable?.({ viewableItems: [{ item: { id: 7 } }, { item: { id: 8 } }, { item: { id: 9 } }] }));
  await fireEvent.changeText(result.getByLabelText('Maximum live streams (0–16)'), '1');
  await waitFor(() => expect(result.getByText('live 7')).toBeTruthy());
  expect(result.getByText('snapshot 8')).toBeTruthy();
  expect(result.queryByText('live 9')).toBeNull();
  await act(async () => mockViewable?.({ viewableItems: [{ item: { id: 8 } }] }));
  expect(result.queryByText('live 7')).toBeNull();
  expect(result.getByText('live 8')).toBeTruthy();
  await fireEvent.press(result.getByLabelText('Open Eight camera'));
  expect(mockNavigate).toHaveBeenCalledWith('Camera', { id: 8 });
  await act(async () => mockActiveHandler?.('background'));
  expect(result.queryByText('live 8')).toBeNull();
  expect(result.queryByText('snapshot 8')).toBeNull();
});

it('does not allocate live resources to offline printers ahead of online tiles', () => {
  const statuses = new Map<number, PrinterStatus | undefined>([
    [1, { connected: false } as PrinterStatus], [2, { connected: true } as PrinterStatus], [3, { connected: true } as PrinterStatus],
  ]);
  expect([...wallLiveIds([1, 2, 3], statuses, 1)]).toEqual([2]);
});

it('keeps API-key settings intact and opens the dedicated camera-token management route', async () => {
  const controller = {
    state: { newApiKeyName: '', createdApiKey: '' },
    actions: { setNewApiKeyName: jest.fn() },
    mutations: {
      createApiKeyMutation: { isPending: false, mutateAsync: jest.fn() },
      deleteApiKeyMutation: { mutateAsync: jest.fn() },
    },
    queries: { apiKeysQuery: { data: [] } },
    colors: {},
  } as unknown as SettingsScreenController;
  const result = await render(<ApiKeysSettingsSection controller={controller} />);
  expect(result.getByText('API keys')).toBeTruthy();
  expect(result.queryByText('Create camera token')).toBeNull();
  await fireEvent.press(result.getByText('Camera tokens and OBS overlays'));
  expect(mockNavigate).toHaveBeenCalledWith('CameraIntegrations');
});
