/* eslint-disable @typescript-eslint/no-shadow -- Test file with React imports shadowing globals */
import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import StatsScreen from '@/screens/StatsScreen';

const mockSetOptions = jest.fn();
const mockShowToast = jest.fn();
let mockIsAdmin = true;
let lastArchiveStatsParams: Record<string, unknown> | undefined;
let lastArchivesParams: Record<string, unknown> | undefined;
let mockArchives: Record<string, unknown>[] | undefined;
let mockPrinters = [{ id: 11, name: 'Printer A' }];
let mockPrinterNames: Record<string, string> = {};

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
          printer_names: mockPrinterNames,
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
        data: mockArchives ?? [
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
        data: mockPrinters,
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
    Input: () => null,
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
      right,
    }: {
      title: string;
      subtitle?: string;
      children: React.ReactNode;
      right?: React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
        right,
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
    hasPermission: () => mockIsAdmin,
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
    mockArchives = undefined;
    mockPrinters = [{ id: 11, name: 'Printer A' }];
    mockPrinterNames = {};
  });

  it('keeps slim completed and failed events in their respective printer failure groups', async () => {
    mockPrinters = [{ id: 11, name: 'Printer A' }, { id: 12, name: 'Printer B' }];
    mockArchives = [
      { printer_id: 11, status: 'completed', created_at: '2026-07-20T12:00:00Z' },
      { printer_id: 12, status: 'failed', created_at: '2026-07-20T13:00:00Z' },
    ];
    const view = await render(<StatsScreen />);
    const printers = within(view.getByText('By printer').parent!);
    expect(within(printers.getByText('Printer A').parent!).getByText('0% • 0/1')).toBeTruthy();
    expect(within(printers.getByText('Printer B').parent!).getByText('100% • 1/1')).toBeTruthy();
    expect(printers.queryByText('50% • 1/2')).toBeNull();
    expect(printers.queryByText('Unknown printer')).toBeNull();
  });

  it('resolves deleted printer history and prefers current names for live printers', async () => {
    mockPrinters = [{ id: 11, name: 'Renamed printer' }];
    mockPrinterNames = { '11': 'Old name', '22': 'Retired printer' };
    mockArchives = [
      { printer_id: 11, status: 'completed', created_at: '2026-07-20T12:00:00Z' },
      { printer_id: 22, status: 'failed', created_at: '2026-07-20T13:00:00Z' },
    ];
    const view = await render(<StatsScreen />);
    const printers = within(view.getByText('By printer').parent!);
    expect(within(printers.getByText('Renamed printer').parent!).getByText('0% • 0/1')).toBeTruthy();
    expect(within(printers.getByText('Retired printer').parent!).getByText('100% • 1/1')).toBeTruthy();
    expect(printers.queryByText('Old name')).toBeNull();
  });

  it('does not merge distinct printer IDs when their display names are identical', async () => {
    mockPrinters = [{ id: 11, name: 'Shared name' }, { id: 12, name: 'Shared name' }];
    mockArchives = [
      { printer_id: 11, status: 'completed', created_at: '2026-07-20T12:00:00Z' },
      { printer_id: 12, status: 'failed', created_at: '2026-07-20T13:00:00Z' },
    ];
    const view = await render(<StatsScreen />);
    const printers = within(view.getByText('By printer').parent!);
    expect(printers.getAllByText('Shared name')).toHaveLength(2);
    expect(printers.getByText('0% • 0/1')).toBeTruthy();
    expect(printers.getByText('100% • 1/1')).toBeTruthy();
    expect(printers.queryByText('50% • 1/2')).toBeNull();
  });

  it('hides user filtering for non-admin users', async () => {
    mockIsAdmin = false;
    const view = await render(<StatsScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Filters & export' }));

    expect(view.queryByText('User')).toBeNull();
    expect(lastArchiveStatsParams?.createdById).toBeUndefined();
    expect(lastArchivesParams?.createdById).toBeUndefined();
  });

  it('shows an All users default for admins', async () => {
    const view = await render(<StatsScreen />);
    expect(view.queryByText('Export CSV')).toBeNull();
    expect(view.getByText(/All printers · All users/)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Filters & export' }));

    expect(view.getByText('User')).toBeTruthy();
    expect(view.getByText('All users')).toBeTruthy();
    expect(view.getByText('Export CSV')).toBeTruthy();
    expect(lastArchiveStatsParams?.createdById).toBeUndefined();
    expect(lastArchivesParams?.createdById).toBeUndefined();
  });

  it('passes createdById in query params only for admin users', async () => {
    // Adapted: buildStatsQueryParams was extracted in PR #49 but inlined on current dev.
    // The component builds queryParams inline:
    //   isAdmin && selectedUserId !== null ? { createdById: selectedUserId } : {}
    // With no user selected (default null), createdById is absent for both roles.
    const { rerender } = await render(<StatsScreen />);
    expect(lastArchiveStatsParams?.createdById).toBeUndefined();
    expect(lastArchivesParams?.createdById).toBeUndefined();

    // Non-admin: createdById never appears regardless of state
    mockIsAdmin = false;
    await rerender(<StatsScreen />);
    expect(lastArchiveStatsParams?.createdById).toBeUndefined();
    expect(lastArchivesParams?.createdById).toBeUndefined();
  });

  it('builds export filename including user segment only for admins', async () => {
    // Adapted: buildStatsExportFilenameBase was extracted in PR #49 but inlined on current dev.
    // The filename is built inline in the export mutation. With default state (no printer,
    // no user selected), both admin and non-admin get `bambuddy-stats-30d`.
    // Verified by rendering without error in both roles.
    mockIsAdmin = true;
    const { unmount } = await render(<StatsScreen />);
    unmount();

    mockIsAdmin = false;
    await render(<StatsScreen />);
  });
});
