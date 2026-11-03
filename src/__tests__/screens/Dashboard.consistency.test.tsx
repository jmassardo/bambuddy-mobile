import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DashboardScreen from '@/screens/DashboardScreen';
import type { Printer, PrinterStatus, PrintQueueItem } from '@/types/api';

const mockRefetch = jest.fn();
let mockStatusQueries: { data: Partial<PrinterStatus>; isLoading: boolean }[] = [];
let mockQueue: PrintQueueItem[] = [];
let mockPrinters: Partial<Printer>[] = [];
let mockFontScale = 1;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === 'printers'
      ? mockPrinters
      : queryKey[0] === 'queue' ? mockQueue : [],
    isLoading: false,
    isError: false,
    isRefetching: true,
    refetch: mockRefetch,
  }),
  useQueries: () => mockStatusQueries,
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => ReactModule.createElement(View, props),
  };
});
jest.mock('@/api/client', () => ({ api: {} }));
jest.mock('@/components/printers/AddPrinterModal', () => ({ AddPrinterModal: () => null }));
jest.mock('@/components/printers/PrintModal', () => ({ PrintModal: () => null }));
jest.mock('@/components/printers/FleetModal', () => ({ FleetModal: () => null }));
jest.mock('@/components/printers/PrinterCard', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    PrinterCard: ({ printer }: { printer: { name: string } }) =>
      ReactModule.createElement(Text, null, printer.name),
  };
});
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true, hasAnyPermission: () => true }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ isConnected: true }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.dark, isDark: true }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockStatusQueries = [];
  mockQueue = [];
  mockPrinters = [{ id: 1, name: 'Printer Alpha', model: 'X1 Carbon', location: 'Lab' }];
  mockFontScale = 1;
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
});

it('keeps every state filter interactive in full-card and tile views', async () => {
  const states = [
    { name: 'Printing', state: 'RUNNING', connected: true },
    { name: 'Paused', state: 'PAUSE', connected: true },
    { name: 'Finished', state: 'FINISH', connected: true, awaiting_plate_clear: true },
    { name: 'Queued', state: 'IDLE', connected: true },
    { name: 'Idle', state: 'IDLE', connected: true },
    { name: 'Issues', state: 'FAILED', connected: true },
    { name: 'Offline', state: 'IDLE', connected: false },
  ];
  mockPrinters = states.map((state, index) => ({ id: index + 1, name: `${state.name} printer` }));
  mockStatusQueries = states.map(state => ({ data: { ...state, hms_errors: [] }, isLoading: false }));
  mockQueue = [{ id: 1, printer_id: 4, status: 'pending' } as PrintQueueItem];
  const view = await render(<DashboardScreen />);
  for (const compact of [false, true]) {
    if (compact) await fireEvent.press(view.getByRole('button', { name: 'Grid view' }));
    for (const state of states) {
      await fireEvent.press(view.getByRole('tab', { name: state.name }));
      expect(view.getByRole('tab', { name: state.name })).toBeSelected();
      expect(view.getByText(`${state.name} printer`)).toBeTruthy();
      for (const other of states.filter(item => item !== state)) {
        expect(view.queryByText(`${other.name} printer`)).toBeNull();
      }
    }
    await fireEvent.press(view.getByRole('tab', { name: 'All' }));
    for (const state of states) expect(view.getByText(`${state.name} printer`)).toBeTruthy();
  }
});

it('fits equal-width tiles to the measured viewport and falls back on narrow screens', async () => {
  mockPrinters = [1, 2, 3].map(id => ({ id, name: `Printer ${id}` }));
  const view = await render(<DashboardScreen />);
  const resize = async (width: number) => fireEvent(view.getByTestId('printers-viewport'), 'layout', {
    nativeEvent: { layout: { width, height: 800, x: 0, y: 0 } },
  });
  await resize(402);
  await fireEvent.press(view.getByRole('button', { name: 'Grid view' }));
  for (const id of [1, 2, 3]) expect(view.getByTestId(`printer-item-${id}`)).toHaveStyle({ width: 185 });
  await resize(320);
  for (const id of [1, 2, 3]) expect(view.getByTestId(`printer-item-${id}`)).toHaveStyle({ width: 296 });
  await resize(768);
  for (const id of [1, 2, 3]) expect(view.getByTestId(`printer-item-${id}`)).toHaveStyle({ width: 368 });
  mockFontScale = 2;
  await resize(402);
  for (const id of [1, 2, 3]) expect(view.getByTestId(`printer-item-${id}`)).toHaveStyle({ width: 378 });
});

it('moves a cleared FINISH printer to Idle and then Queued when a matching job is waiting', async () => {
  const finished: Partial<PrinterStatus> = {
    connected: true,
    state: 'FINISH',
    awaiting_plate_clear: true,
    hms_errors: [],
  };
  mockStatusQueries = [{ data: finished, isLoading: false }];
  const view = await render(<DashboardScreen />);
  await fireEvent.press(view.getByRole('tab', { name: 'Finished' }));
  expect(view.getByText('Printer Alpha')).toBeTruthy();
  await fireEvent.press(view.getByRole('tab', { name: 'Idle' }));
  expect(view.queryByText('Printer Alpha')).toBeNull();

  mockStatusQueries = [{ data: { ...finished, awaiting_plate_clear: false }, isLoading: false }];
  await view.rerender(<DashboardScreen />);
  expect(view.getByText('Printer Alpha')).toBeTruthy();
  await fireEvent.press(view.getByRole('tab', { name: 'Finished' }));
  expect(view.queryByText('Printer Alpha')).toBeNull();

  mockQueue = [{ id: 1, printer_id: 1, status: 'pending' } as PrintQueueItem];
  await view.rerender(<DashboardScreen />);
  await fireEvent.press(view.getByRole('tab', { name: 'Queued' }));
  expect(view.getByText('Printer Alpha')).toBeTruthy();
  await fireEvent.press(view.getByRole('tab', { name: 'Idle' }));
  expect(view.queryByText('Printer Alpha')).toBeNull();
});

it('only activates native pull refresh for an explicit gesture, not background queries', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  mockRefetch.mockReturnValue(pending);
  const view = await render(<DashboardScreen />);
  expect(view.getByTestId('printers-refresh').props.refreshing).toBe(false);
  expect(view.getByText('Printer Alpha')).toBeTruthy();
  await fireEvent(view.getByTestId('printers-refresh'), 'refresh');
  expect(view.getByTestId('printers-refresh').props.refreshing).toBe(true);
  await act(async () => finish());
  await waitFor(() => expect(view.getByTestId('printers-refresh').props.refreshing).toBe(false));
});
