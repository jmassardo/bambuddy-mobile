import React from 'react';
import { render } from '@testing-library/react-native';
import DashboardScreen from '@/screens/DashboardScreen';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockMutate = jest.fn();
const mockUseQuery = jest.fn();
const mockUseQueries = jest.fn();

const printers = [
  { id: 1, name: 'Printer Alpha', model: 'X1 Carbon', location: 'Lab', serial_number: 'SER-1' },
  { id: 2, name: 'Printer Beta', model: 'P1S', location: 'Garage', serial_number: 'SER-2' },
] as any[];

const statuses = [
  { data: { connected: true, state: 'RUNNING', hms_errors: [], ams: [], vt_tray: [] }, isLoading: false, isRefetching: false },
  { data: { connected: true, state: 'IDLE', hms_errors: [], ams: [], vt_tray: [] }, isLoading: false, isRefetching: false },
];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
  useQuery: (options: { queryKey: string[] }) => mockUseQuery(options),
  useQueries: () => mockUseQueries(),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/api/client', () => ({
  api: {
    createPrinter: jest.fn(),
    getPrinters: jest.fn(),
    getQueue: jest.fn(),
    getMaintenanceTasks: jest.fn(),
    getAssignments: jest.fn(),
    getPrinterStatus: jest.fn(),
  },
}));

jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    SearchBar: ({ placeholder }: { placeholder: string }) =>
      React.createElement(Text, null, placeholder),
    InlineTabBar: ({ tabs }: { tabs: Array<{ label: string }> }) =>
      React.createElement(Text, null, tabs.map(tab => tab.label).join(', ')),
    StatCard: ({ label, value }: { label: string; value: string }) =>
      React.createElement(Text, null, `${label}:${value}`),
  };
});

jest.mock('@/components/common/StateScreens', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    EmptyState: ({ title }: { title: string }) => React.createElement(Text, null, title),
    ErrorState: ({ message }: { message: string }) =>
      React.createElement(Text, null, message),
    LoadingScreen: ({ message }: { message: string }) =>
      React.createElement(Text, null, message),
  };
});

jest.mock('@/components/printers/AddPrinterModal', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    AddPrinterModal: ({ visible }: { visible: boolean }) =>
      visible ? React.createElement(Text, null, 'Add Printer Modal') : null,
  };
});

jest.mock('@/components/printers/PrinterCard', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    PrinterCard: ({ printer }: { printer: { name: string } }) =>
      React.createElement(Text, null, printer.name),
  };
});

jest.mock('@/components/printers/PrintModal', () => ({
  PrintModal: () => null,
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasAnyPermission: () => true,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ isConnected: true }),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy(
      {},
      {
        get: () => '#888888',
      },
    ),
    isDark: true,
  }),
}));

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      switch (queryKey[0]) {
        case 'printers':
          return {
            data: printers,
            isLoading: false,
            isError: false,
            isRefetching: false,
            refetch: jest.fn(),
          };
        case 'queue':
          return {
            data: [],
            isLoading: false,
            isRefetching: false,
            refetch: jest.fn(),
          };
        case 'maintenanceTasks':
          return {
            data: [],
            isLoading: false,
            isRefetching: false,
            refetch: jest.fn(),
          };
        case 'spool-assignments':
          return {
            data: [],
            isLoading: false,
            isRefetching: false,
            refetch: jest.fn(),
          };
        default:
          return {
            data: undefined,
            isLoading: false,
            isRefetching: false,
            refetch: jest.fn(),
          };
      }
    });
    mockUseQueries.mockReturnValue(statuses);
  });

  it('renders without crashing when data is loaded', async () => {
    const { getByText } = await render(<DashboardScreen />);

    expect(getByText('Printer Alpha')).toBeTruthy();
    expect(getByText('Printer Beta')).toBeTruthy();
  });

  it('shows the add printer button', async () => {
    const { getAllByTestId } = await render(<DashboardScreen />);

    expect(getAllByTestId('icon-Plus').length).toBeGreaterThan(0);
  });

  it('shows the stat cards', async () => {
    const { getByText } = await render(<DashboardScreen />);

    expect(getByText('Total:2')).toBeTruthy();
    expect(getByText('Printing:1')).toBeTruthy();
    expect(getByText('Idle:1')).toBeTruthy();
    expect(getByText('Issues:0')).toBeTruthy();
  });
});
