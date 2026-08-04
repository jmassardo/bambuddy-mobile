import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DashboardScreen, {
  comparePrinters,
  type PrinterSortMode,
} from '@/screens/DashboardScreen';
import type { Printer, PrinterStatus } from '@/types/api';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockMutate = jest.fn();
const mockUseQuery = jest.fn();
const mockUseQueries = jest.fn();
const mockShowToast = jest.fn();

const defaultPrinters = [
  { id: 1, name: 'Printer Alpha', model: 'X1 Carbon', location: 'Lab', serial_number: 'SER-1' },
  { id: 2, name: 'Printer Beta', model: 'P1S', location: 'Garage', serial_number: 'SER-2' },
] as any[];

interface StatusQueryResult {
  data: PrinterStatus;
  isLoading: boolean;
  isRefetching: boolean;
}

const defaultStatuses: StatusQueryResult[] = [
  { data: printerStatus('RUNNING'), isLoading: false, isRefetching: false },
  { data: printerStatus('IDLE'), isLoading: false, isRefetching: false },
];
let printers = defaultPrinters;
let statuses: StatusQueryResult[] = defaultStatuses;

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
  const { Pressable, Text, TextInput, View } = require('react-native');

  return {
    SearchBar: ({
      value,
      onChangeText,
      placeholder,
    }: {
      value: string;
      onChangeText: (value: string) => void;
      placeholder: string;
    }) => React.createElement(TextInput, {
      accessibilityLabel: placeholder,
      placeholder,
      value,
      onChangeText,
    }),
    InlineTabBar: ({
      tabs,
      onChange,
    }: {
      tabs: Array<{ key: string; label: string }>;
      onChange: (value: string) => void;
    }) => React.createElement(
      View,
      null,
      tabs.map(tab => React.createElement(
        Pressable,
        {
          key: tab.key,
          accessibilityLabel: tab.label,
          accessibilityRole: 'button',
          onPress: () => onChange(tab.key),
        },
        React.createElement(Text, null, tab.label),
      )),
    ),
    StatCard: ({ label, value }: { label: string; value: string }) =>
      React.createElement(Text, null, `${label}:${value}`),
    PrimaryButton: ({ label }: { label: string }) => React.createElement(Text, null, label),
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
  const { Text, View } = require('react-native');

  return {
    PrinterCard: ({ printer }: { printer: { name: string } }) =>
      React.createElement(
        View,
        { testID: 'printer-card', accessibilityLabel: printer.name },
        React.createElement(Text, null, printer.name),
      ),
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
  useToast: () => ({ showToast: mockShowToast }),
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
    printers = defaultPrinters;
    statuses = defaultStatuses;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
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
    mockUseQueries.mockImplementation(() => statuses);
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

  it('renders the printer list', async () => {
    const { toJSON } = await render(<DashboardScreen />);
    // Smoke test — component renders without crashing
    expect(toJSON()).toBeTruthy();
  });

  it('composes status filtering, search, and name sorting', async () => {
    printers = [
      { id: 1, name: 'Zulu', model: 'X1', location: 'Lab', serial_number: 'SER-1' },
      { id: 2, name: 'Alpha', model: 'P1', location: 'Lab', serial_number: 'SER-2' },
      { id: 3, name: 'Beta', model: 'A1', location: 'Lab', serial_number: 'SER-3' },
      { id: 4, name: 'Gamma', model: 'A1', location: 'Office', serial_number: 'SER-4' },
    ] as any[];
    statuses = [
      { data: printerStatus('RUNNING'), isLoading: false, isRefetching: false },
      { data: printerStatus('RUNNING'), isLoading: false, isRefetching: false },
      { data: printerStatus('IDLE'), isLoading: false, isRefetching: false },
      { data: printerStatus('RUNNING'), isLoading: false, isRefetching: false },
    ];

    const screen = await render(<DashboardScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Printing' }));
    await fireEvent.changeText(screen.getByPlaceholderText('Search printers…'), 'lab');
    await fireEvent.press(screen.getByRole('button', { name: 'Sort printers by Name' }));

    await waitFor(() => {
      expect(printerNames(screen.getAllByTestId('printer-card'))).toEqual(['Alpha', 'Zulu']);
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('bambuddy-printer-sort', 'name');
    await screen.unmount();
  });

  it('restores the persisted sort preference on remount', async () => {
    printers = [
      { id: 1, name: 'Zulu', model: 'X1', location: 'Lab', serial_number: 'SER-1' },
      { id: 2, name: 'Alpha', model: 'P1', location: 'Lab', serial_number: 'SER-2' },
    ] as any[];
    statuses = [
      { data: printerStatus('RUNNING'), isLoading: false, isRefetching: false },
      { data: printerStatus('IDLE'), isLoading: false, isRefetching: false },
    ];
    const firstMount = await render(<DashboardScreen />);
    await fireEvent.press(firstMount.getByRole('button', { name: 'Sort printers by Name' }));
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('bambuddy-printer-sort', 'name');
    await firstMount.unmount();

    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('name');
    const secondMount = await render(<DashboardScreen />);
    await waitFor(() => {
      expect(printerNames(secondMount.getAllByTestId('printer-card'))).toEqual(['Alpha', 'Zulu']);
      expect(
        secondMount.getByRole('button', { name: 'Sort printers by Name' }).props
          .accessibilityState,
      ).toEqual({ selected: true });
    });
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('bambuddy-printer-sort');
    await secondMount.unmount();
  });
});

describe('comparePrinters', () => {
  const maintenance = new Map();

  it('sorts names ascending with case-insensitive, locale-aware comparison', () => {
    const localeCompare = jest.spyOn(String.prototype, 'localeCompare');
    const sorted = sortPrinters(
      [printer(2, 'zulu'), printer(1, 'Alpha'), printer(3, 'alpha')],
      'name',
      new Map(),
      maintenance,
    );

    expect(sorted.map(item => item.id)).toEqual([1, 3, 2]);
    expect(localeCompare).toHaveBeenCalledWith(expect.any(String), undefined, {
      sensitivity: 'base',
    });
    localeCompare.mockRestore();
  });

  it('orders statuses attention-first with offline last', () => {
    const input = [
      printer(1, 'Offline'),
      printer(2, 'Idle'),
      printer(3, 'Paused'),
      printer(4, 'Printing'),
      { ...printer(5, 'Issues'), is_active: false },
    ];
    const statusByPrinter = new Map<number, PrinterStatus | undefined>([
      [1, printerStatus('IDLE', false)],
      [2, printerStatus('IDLE')],
      [3, printerStatus('PAUSE')],
      [4, printerStatus('RUNNING')],
      [5, printerStatus('IDLE')],
    ]);

    expect(
      sortPrinters(input, 'status', statusByPrinter, maintenance).map(item => item.name),
    ).toEqual(['Issues', 'Printing', 'Paused', 'Idle', 'Offline']);
  });

  it('breaks duplicate status ties by name', () => {
    const input = [printer(2, 'Zulu'), printer(1, 'alpha'), printer(3, 'Beta')];
    const statusByPrinter = new Map(
      input.map(item => [item.id, printerStatus('RUNNING')] as const),
    );

    expect(
      sortPrinters(input, 'status', statusByPrinter, maintenance).map(item => item.name),
    ).toEqual(['alpha', 'Beta', 'Zulu']);
  });
});

function printer(id: number, name: string): Printer {
  return {
    id,
    name,
    serial_number: `SER-${id}`,
    ip_address: '192.0.2.1',
    model: 'X1',
    location: 'Lab',
    nozzle_count: 1,
    is_active: true,
    auto_archive: false,
    external_camera_url: null,
    external_camera_type: null,
    external_camera_enabled: false,
    external_camera_snapshot_url: null,
    camera_rotation: 0,
    plate_detection_enabled: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function printerStatus(
  state: PrinterStatus['state'],
  connected = true,
): PrinterStatus {
  const status: Partial<PrinterStatus> = {
    connected,
    state,
    hms_errors: [],
    ams: [],
    vt_tray: [],
  };

  return status as PrinterStatus;
}

function sortPrinters(
  input: Printer[],
  sortBy: PrinterSortMode,
  statusByPrinter: ReadonlyMap<number, PrinterStatus | undefined>,
  maintenanceByPrinter: ReadonlyMap<number, undefined>,
) {
  return [...input].sort((first, second) =>
    comparePrinters(
      first,
      second,
      sortBy,
      statusByPrinter,
      maintenanceByPrinter,
    ),
  );
}

function printerNames(nodes: Array<{ props: Record<string, unknown> }>) {
  return nodes.map(node => String(node.props.accessibilityLabel));
}
