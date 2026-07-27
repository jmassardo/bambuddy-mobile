import React from 'react';
import { render } from '@testing-library/react-native';
import StatsScreen, {
  buildStatsExportFilenameBase,
  buildStatsQueryParams,
} from '@/screens/StatsScreen';

const mockSetOptions = jest.fn();
const mockShowToast = jest.fn();
let mockIsAdmin = true;
let lastArchiveStatsParams: Record<string, unknown> | undefined;
let lastArchivesParams: Record<string, unknown> | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({
    queryKey,
    enabled = true,
  }: {
    queryKey: unknown[];
    enabled?: boolean;
  }) => {
    const key = String(queryKey[0] ?? '');
    if (key === 'archiveStats') {
      lastArchiveStatsParams = (queryKey[1] as Record<string, unknown>) ?? {};
      return {
        data: {
          total_prints: 1,
          success_rate: 1,
          total_print_time_seconds: 3600,
          total_filament_grams: 10,
          total_cost: 1.5,
        },
        isLoading: false,
        isError: false,
        isRefetching: false,
        refetch: jest.fn(),
      };
    }
    if (key === 'archives') {
      lastArchivesParams = (queryKey[2] as Record<string, unknown>) ?? {};
      return {
        data: [
          {
            id: 1,
            print_name: 'Test print',
            status: 'success',
            printer_name: 'Printer A',
            created_by_username: 'jenna',
            completed_at: '2026-07-20T12:00:00Z',
            actual_time_seconds: 1200,
            filament_used_grams: 15,
            cost: 2.1,
          },
        ],
        isLoading: false,
        isError: false,
        isRefetching: false,
        refetch: jest.fn(),
      };
    }
    if (key === 'printers') {
      return {
        data: [{ id: 11, name: 'Printer A' }],
        isLoading: false,
        isError: false,
        isRefetching: false,
        refetch: jest.fn(),
      };
    }
    if (key === 'users') {
      return {
        data: enabled
          ? [
              { id: 7, username: 'jenna', email: 'jenna@example.com', is_admin: false, groups: [], created_at: '2026-01-01T00:00:00Z' },
            ]
          : [],
        isLoading: false,
        isError: false,
        isRefetching: false,
        refetch: jest.fn(),
      };
    }
    return {
      data: [],
      isLoading: false,
      isError: false,
      isRefetching: false,
      refetch: jest.fn(),
    };
  },
  useMutation: (options: {
    mutationFn: (...args: unknown[]) => Promise<unknown>;
    onSuccess?: (...args: unknown[]) => void;
    onError?: (error: Error) => void;
  }) => ({
    mutateAsync: (...args: unknown[]) => {
      return options
        .mutationFn(...args)
        .then(result => {
          options.onSuccess?.(result, ...args);
          return result;
        })
        .catch(error => {
          options.onError?.(error as Error);
          throw error;
        });
    },
    isPending: false,
  }),
}));

jest.mock('@/api/client', () => ({
  api: {
    recalculateCosts: jest.fn(() => Promise.resolve({ message: 'ok' })),
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
    PrimaryButton: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => React.createElement(Pressable, { onPress, disabled }, React.createElement(Text, null, label)),
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
    StatCard: ({ label, value }: { label: string; value: string }) =>
      React.createElement(Text, null, `${label}:${value}`),
  };
});

jest.mock('@/components/common/Charts', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SimpleBarChart: () => React.createElement(Text, null, 'chart'),
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

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdmin: mockIsAdmin,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

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
      overlay: '#00000088',
      accent: '#3b82f6',
      accentBg: '#1e3a8a',
      warning: '#f59e0b',
    },
  }),
}));

jest.mock('@/utils/share', () => ({
  shareBlob: jest.fn(() => Promise.resolve()),
}));

describe('StatsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdmin = true;
    lastArchiveStatsParams = undefined;
    lastArchivesParams = undefined;
  });

  it('hides user filtering for non-admin users', async () => {
    mockIsAdmin = false;
    const { queryByText } = await render(<StatsScreen />);

    expect(queryByText('User')).toBeNull();
    expect(lastArchiveStatsParams?.createdById).toBeUndefined();
    expect(lastArchivesParams?.createdById).toBeUndefined();
  });

  it('shows an All users default for admins', async () => {
    const { getByText } = await render(<StatsScreen />);

    expect(getByText('User')).toBeTruthy();
    expect(getByText('All users')).toBeTruthy();
    expect(lastArchiveStatsParams?.createdById).toBeUndefined();
    expect(lastArchivesParams?.createdById).toBeUndefined();
  });

  it('builds query params with selected user only for admins', () => {
    expect(
      buildStatsQueryParams({
        baseParams: { dateFrom: '2026-07-01', dateTo: '2026-07-27' },
        selectedPrinterId: 11,
        selectedUserId: 7,
        isAdmin: true,
      }),
    ).toEqual({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-27',
      printerId: 11,
      createdById: 7,
    });

    expect(
      buildStatsQueryParams({
        baseParams: { dateFrom: '2026-07-01', dateTo: '2026-07-27' },
        selectedPrinterId: 11,
        selectedUserId: 7,
        isAdmin: false,
      }),
    ).toEqual({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-27',
      printerId: 11,
    });
  });

  it('includes selected user in export filename only for admins', () => {
    expect(
      buildStatsExportFilenameBase({
        range: '30d',
        selectedPrinterId: 11,
        selectedUserId: 7,
        isAdmin: true,
      }),
    ).toBe('bambuddy-stats-30d-printer-11-user-7');

    expect(
      buildStatsExportFilenameBase({
        range: '30d',
        selectedPrinterId: 11,
        selectedUserId: 7,
        isAdmin: false,
      }),
    ).toBe('bambuddy-stats-30d-printer-11');
  });
});
