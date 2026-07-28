import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import EnergyScreen, { getEnergyRangeParams } from '@/screens/EnergyScreen';

const mockSetOptions = jest.fn();
let lastEnergyParams: Record<string, unknown> | undefined;

const populatedEnergyData = {
  total_energy_kwh: 12.5,
  total_energy_cost: 3.75,
  daily_data: [
    { date: '2026-07-20', energy_kwh: 2.1, energy_cost: 0.63 },
    { date: '2026-07-21', energy_kwh: 3.2, energy_cost: 0.96 },
  ],
  per_printer: [
    { printer_id: 11, printer_name: 'Printer A', energy_kwh: 8.2, energy_cost: 2.46 },
    { printer_id: 12, printer_name: 'Printer B', energy_kwh: 4.3, energy_cost: 1.29 },
  ],
};

let mockEnergyQueryState: {
  data: typeof populatedEnergyData | undefined;
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
  refetch: jest.Mock;
} = {
  data: populatedEnergyData,
  isLoading: false,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = String(queryKey[0] ?? '');
    if (key === 'archiveEnergyStats') {
      lastEnergyParams = (queryKey[1] as Record<string, unknown>) ?? {};
      return mockEnergyQueryState;
    }
    if (key === 'settings') {
      return {
        data: {
          currency: 'USD',
          energy_cost_per_kwh: 0.3,
        },
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
}));

jest.mock('@/api/client', () => ({
  api: {
    getArchiveEnergyStats: jest.fn(() => Promise.resolve({})),
    getSettings: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    InlineTabBar: ({
      tabs,
      onChange,
    }: {
      tabs: Array<{ key: string; label: string }>;
      onChange: (value: string) => void;
    }) =>
      React.createElement(
        View,
        null,
        tabs.map(tab =>
          React.createElement(
            Pressable,
            { key: tab.key, onPress: () => onChange(tab.key) },
            React.createElement(Text, null, tab.label),
          ),
        ),
      ),
    ProgressBar: ({ progress }: { progress: number }) => React.createElement(Text, null, `progress:${progress.toFixed(0)}`),
    SectionCard: ({
      title,
      subtitle,
      children,
    }: {
      title: string;
      subtitle?: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
        children,
      ),
    StatCard: ({ label, value }: { label: string; value: string }) => React.createElement(Text, null, `${label}:${value}`),
  };
});

jest.mock('@/components/common/Charts', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SimpleBarChart: () => React.createElement(Text, null, 'energy-chart'),
  };
});

jest.mock('@/components/common/StateScreens', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ErrorState: ({ message }: { message: string }) => React.createElement(Text, null, message),
    LoadingScreen: ({ message }: { message: string }) => React.createElement(Text, null, message),
  };
});

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      text: '#fff',
      textSecondary: '#ccc',
      textTertiary: '#aaa',
      surface: '#111',
      surfaceElevated: '#222',
      border: '#444',
      accent: '#3b82f6',
      warning: '#f59e0b',
    },
  }),
}));

describe('EnergyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastEnergyParams = undefined;
    mockEnergyQueryState = {
      data: populatedEnergyData,
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    };
  });

  it('renders energy sections and printer breakdown', async () => {
    const { getByText, getAllByText } = await render(<EnergyScreen />);

    expect(getByText('Energy dashboard')).toBeTruthy();
    expect(getByText('Overview')).toBeTruthy();
    expect(getByText('Energy trend')).toBeTruthy();
    expect(getByText('Per-printer breakdown')).toBeTruthy();
    // Printer names appear in both filter chips and breakdown
    expect(getAllByText('Printer A').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Printer B').length).toBeGreaterThanOrEqual(1);
  });

  it('updates date range query params when selecting a new range', async () => {
    const { getByText } = await render(<EnergyScreen />);
    fireEvent.press(getByText('7 Days'));

    expect(lastEnergyParams?.dateFrom).toBeTruthy();
    expect(lastEnergyParams?.dateTo).toBeTruthy();
  });

  it('shows loading screen while energy data is loading', async () => {
    mockEnergyQueryState = {
      data: undefined,
      isLoading: true,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    };
    const { getByText } = await render(<EnergyScreen />);
    expect(getByText('Loading energy dashboard…')).toBeTruthy();
  });

  it('shows error state when energy query fails', async () => {
    mockEnergyQueryState = {
      data: undefined,
      isLoading: false,
      isError: true,
      isRefetching: false,
      refetch: jest.fn(),
    };
    const { getByText } = await render(<EnergyScreen />);
    expect(getByText('Unable to load energy dashboard.')).toBeTruthy();
  });

  it('shows empty-state messages when data has no entries', async () => {
    mockEnergyQueryState = {
      data: {
        total_energy_kwh: 0,
        total_energy_cost: 0,
        daily_data: [],
        per_printer: [],
      },
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    };
    const { getByText } = await render(<EnergyScreen />);
    expect(getByText(/No time-series energy data/)).toBeTruthy();
    expect(getByText(/No per-printer energy breakdown/)).toBeTruthy();
  });

  it('filters to a single printer when a printer chip is pressed', async () => {
    const { getByText, getByTestId, queryByText } = await render(<EnergyScreen />);

    // Filter chips should be visible when multiple printers exist
    expect(getByText('All printers')).toBeTruthy();

    // Press the Printer A filter chip
    await fireEvent.press(getByTestId('filter-chip-11'));

    // Overview should now show Printer A values only
    expect(getByText('Energy:8.20 kWh')).toBeTruthy();

    // Printer B should no longer appear in the breakdown
    const printerBBreakdown = queryByText(/4\.30 kWh/);
    expect(printerBBreakdown).toBeNull();

    // Press "All printers" to reset
    await fireEvent.press(getByTestId('filter-chip-all'));
    expect(getByText('Energy:12.50 kWh')).toBeTruthy();
  });
});

describe('getEnergyRangeParams', () => {
  it('returns an open range for all-time', () => {
    expect(getEnergyRangeParams('all')).toEqual({});
  });

  it('returns bounded date filters for range presets', () => {
    const params = getEnergyRangeParams('30d');
    expect(params.dateFrom).toBeTruthy();
    expect(params.dateTo).toBeTruthy();
  });
});
