import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DashboardScreen from '@/screens/DashboardScreen';
import type { PrinterStatus, PrintQueueItem } from '@/types/api';

const mockRefetch = jest.fn();
let mockStatusQueries: { data: Partial<PrinterStatus>; isLoading: boolean }[] = [];
let mockQueue: PrintQueueItem[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === 'printers'
      ? [{ id: 1, name: 'Printer Alpha', model: 'X1 Carbon', location: 'Lab' }]
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
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
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
