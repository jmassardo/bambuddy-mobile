import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import EnergyScreen, { getEnergyRangeParams } from '@/screens/EnergyScreen';

const mockSetOptions = jest.fn();
let lastEnergyParams: Record<string, unknown> | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = String(queryKey[0] ?? '');
    if (key === 'archiveEnergyStats') {
      lastEnergyParams = (queryKey[1] as Record<string, unknown>) ?? {};
      return {
        data: {
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
        },
        isLoading: false,
        isError: false,
        isRefetching: false,
        refetch: jest.fn(),
      };
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
  });

  it('renders energy sections and printer breakdown', async () => {
    const { getByText } = await render(<EnergyScreen />);

    expect(getByText('Energy dashboard')).toBeTruthy();
    expect(getByText('Overview')).toBeTruthy();
    expect(getByText('Energy trend')).toBeTruthy();
    expect(getByText('Per-printer breakdown')).toBeTruthy();
    expect(getByText('Printer A')).toBeTruthy();
    expect(getByText('Printer B')).toBeTruthy();
  });

  it('updates date range query params when selecting a new range', async () => {
    const { getByText } = await render(<EnergyScreen />);
    fireEvent.press(getByText('7 Days'));

    expect(lastEnergyParams?.dateFrom).toBeTruthy();
    expect(lastEnergyParams?.dateTo).toBeTruthy();
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
