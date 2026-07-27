import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PrinterDetailScreen from '@/screens/PrinterDetailScreen';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();
const mockUseQuery = jest.fn();
const mockInvalidateQueries = jest.fn();

const baseStatus = {
  state: 'IDLE',
  temperatures: {
    nozzle: { current: 210, target: 220 },
    bed: { current: 60, target: 65 },
    chamber: { current: 35, target: 40 },
  },
  fans: { part: 40, aux: 30, chamber: 20 },
  hms_errors: [],
  ams_slots: [],
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    setOptions: mockSetOptions,
  }),
  useRoute: () => ({
    params: { id: '1' },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useQuery: (options: { queryKey: Array<string | number> }) => mockUseQuery(options),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    getPrinter: jest.fn(),
    getPrinterStatus: jest.fn(),
    getMQTTLogs: jest.fn(),
    getArchives: jest.fn(),
    getAmsHistory: jest.fn(),
    getPrinterSensorHistory: jest.fn(),
    pausePrint: jest.fn(),
    resumePrint: jest.fn(),
    stopPrint: jest.fn(),
    setChamberLight: jest.fn(),
    setPrintSpeed: jest.fn(),
    xyJog: jest.fn(),
    bedJog: jest.fn(),
    homeAxes: jest.fn(),
    getCameraSnapshotUrl: () => 'https://example.com/camera.jpg',
  },
}));

jest.mock('@/components/common/AppUI', () => {
  const { Pressable, Text, View } = require('react-native');

  return {
    InlineTabBar: ({
      value,
      tabs,
      onChange,
    }: {
      value: string;
      tabs: Array<{ key: string; label: string }>;
      onChange: (next: string) => void;
    }) => (
      <View>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            testID={`heater-range-${tab.key}`}
          >
            <Text>{tab.label}{tab.key === value ? ' (active)' : ''}</Text>
          </Pressable>
        ))}
      </View>
    ),
    KeyValueRow: ({ label, value }: { label: string; value: string }) => (
      <Text>
        {label}:{value}
      </Text>
    ),
    PrimaryButton: ({ label }: { label: string }) => <Text>{label}</Text>,
    SectionCard: ({
      title,
      subtitle,
      children,
    }: {
      title?: string;
      subtitle?: string;
      children: React.ReactNode;
    }) => (
      <View>
        {title ? <Text>{title}</Text> : null}
        {subtitle ? <Text>{subtitle}</Text> : null}
        {children}
      </View>
    ),
    StatusBadge: ({ label }: { label: string }) => <Text>{label}</Text>,
  };
});

jest.mock('@/components/common/StateScreens', () => {
  const { Text } = require('react-native');

  return {
    ErrorState: ({ message }: { message: string }) => <Text>{message}</Text>,
    LoadingScreen: ({ message }: { message: string }) => <Text>{message}</Text>,
  };
});

jest.mock('@/components/common/Charts', () => {
  const { Text } = require('react-native');

  return {
    MultiSeriesLineChart: ({ points }: { points: unknown[] }) => (
      <Text>heater-chart-points:{points.length}</Text>
    ),
  };
});

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy(
      {},
      {
        get: () => '#888888',
      },
    ),
  }),
}));

function setupQueries({
  heaterHistorySeries,
}: {
  heaterHistorySeries: Array<{
    sensor_kind: 'nozzle' | 'bed' | 'chamber';
    data: Array<{ recorded_at: string; value: number | null; target: number | null }>;
    min_value: number | null;
    max_value: number | null;
    avg_value: number | null;
  }>;
}) {
  mockUseQuery.mockImplementation(
    ({ queryKey }: { queryKey: Array<string | number> }) => {
      if (queryKey[0] === 'printer') {
        return {
          data: { name: 'Printer One', model: 'X1C' },
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: jest.fn(),
        };
      }
      if (queryKey[0] === 'printerStatus') {
        return {
          data: baseStatus,
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: jest.fn(),
        };
      }
      if (queryKey[0] === 'heaterHistory') {
        return {
          data: { printer_id: 1, series: heaterHistorySeries },
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: jest.fn(),
        };
      }
      if (queryKey[0] === 'mqttLogs') {
        return {
          data: { entries: [] },
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: jest.fn(),
        };
      }
      if (queryKey[0] === 'printerArchives' || queryKey[0] === 'amsHistory') {
        return {
          data: [],
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: jest.fn(),
        };
      }

      return {
        data: undefined,
        isLoading: false,
        isError: false,
        isRefetching: false,
        refetch: jest.fn(),
      };
    },
  );
}

describe('PrinterDetailScreen heater history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders range selector and chart when heater history is present', async () => {
    setupQueries({
      heaterHistorySeries: [
        {
          sensor_kind: 'nozzle',
          data: [
            { recorded_at: '2026-01-01T00:00:00Z', value: 200, target: 220 },
            { recorded_at: '2026-01-01T00:10:00Z', value: 205, target: 220 },
          ],
          min_value: 200,
          max_value: 205,
          avg_value: 202.5,
        },
        {
          sensor_kind: 'bed',
          data: [
            { recorded_at: '2026-01-01T00:00:00Z', value: 55, target: 60 },
            { recorded_at: '2026-01-01T00:10:00Z', value: 57, target: 60 },
          ],
          min_value: 55,
          max_value: 57,
          avg_value: 56,
        },
      ],
    });

    const { getByText } = await render(<PrinterDetailScreen />);

    expect(getByText('Heater history')).toBeTruthy();
    expect(getByText('1h')).toBeTruthy();
    expect(getByText('6h')).toBeTruthy();
    expect(getByText('24h (active)')).toBeTruthy();
    expect(getByText('7d')).toBeTruthy();
    expect(getByText('heater-chart-points:2')).toBeTruthy();
  });

  it('shows chamber unavailable note when chamber series is missing', async () => {
    setupQueries({
      heaterHistorySeries: [
        {
          sensor_kind: 'nozzle',
          data: [{ recorded_at: '2026-01-01T00:00:00Z', value: 210, target: 220 }],
          min_value: 210,
          max_value: 210,
          avg_value: 210,
        },
      ],
    });

    const { getByText } = await render(<PrinterDetailScreen />);

    expect(
      getByText('Chamber history is unavailable for this printer in the selected range.'),
    ).toBeTruthy();
  });

  it('requests 7d heater history window when range changes to 7d', async () => {
    setupQueries({
      heaterHistorySeries: [],
    });

    const { getByTestId, getByText } = await render(<PrinterDetailScreen />);

    fireEvent.press(getByTestId('heater-range-7d'));

    await waitFor(() => expect(getByText('7d (active)')).toBeTruthy());

    const heaterHistoryCalls = mockUseQuery.mock.calls
      .map(call => call[0])
      .filter(
        (options: { queryKey?: Array<string | number> }) =>
          options.queryKey?.[0] === 'heaterHistory',
      );

    expect(
      heaterHistoryCalls.some(
        (options: { queryKey?: Array<string | number> }) => options.queryKey?.[2] === 168,
      ),
    ).toBe(true);
  });
});
