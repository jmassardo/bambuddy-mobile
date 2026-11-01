/* eslint-disable @typescript-eslint/no-shadow -- Test file with React imports shadowing globals */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfilesScreen, { formatKProfileDetail } from '@/screens/ProfilesScreen';

const mockSetOptions = jest.fn();
let mockKProfiles: Array<Record<string, unknown>>;

const cloudProfile = {
  name: 'Generic PLA',
  type: 'filament',
  description: 'Cloud profile description',
  setting_id: 'GFSA00',
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = String(queryKey[0] ?? '');
    const data =
      key === 'cloudProfiles'
        ? [cloudProfile]
        : key === 'kprofiles'
        ? { profiles: mockKProfiles }
        : key === 'cloudStatus'
        ? { is_authenticated: false }
        : [];

    return {
      data,
      isLoading: false,
      isError: false,
      isFetching: false,
      isRefetching: false,
      refetch: jest.fn(),
      error: null,
    };
  },
  useMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
}));

jest.mock('@/api/client', () => ({
  api: {},
  ApiError: class ApiError extends Error {},
}));
jest.mock('@react-native-documents/picker', () => ({ pick: jest.fn(), types: { allFiles: '*/*' }, errorCodes: {}, isErrorWithCode: () => false }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
jest.mock('@/components/profiles/PresetEditor', () => ({ PresetEditor: () => null }));
jest.mock('@/components/profiles/KProfileManager', () => ({
  KProfileManager: () => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, 'Connected printer / nozzle');
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
    PrimaryButton: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
    SectionCard: ({
      title,
      subtitle,
      children,
    }: {
      title?: string;
      subtitle?: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        title ? React.createElement(Text, null, title) : null,
        subtitle ? React.createElement(Text, null, subtitle) : null,
        children,
      ),
    StatusBadge: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
    TextField: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
  };
});

jest.mock('@/components/profiles/CloudProfileDetailModal', () => ({
  CloudProfileDetailModal: () => null,
}));

jest.mock('@/components/profiles/CloudProfileDiffModal', () => ({
  CloudProfileDiffModal: () => null,
}));

jest.mock('@/components/common/StateScreens', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    EmptyState: ({ message }: { message: string }) =>
      React.createElement(Text, null, message),
    ErrorState: ({ message }: { message: string }) =>
      React.createElement(Text, null, message),
    LoadingScreen: ({ message }: { message: string }) =>
      React.createElement(Text, null, message),
  };
});

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
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

describe('ProfilesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKProfiles = [
      {
        name: 'Textured PEI calibration',
        k_value: '0.020',
        n_coef: '1.0',
        nozzle_diameter: '0.4',
        filament_id: 'GFA00',
        ams_id: 1,
        tray_id: 3,
        setting_id: null,
      },
    ];
  });

  it('opens the context-aware K profile manager from the reachable source tab', async () => {
    const { getByText, queryByText } = await render(<ProfilesScreen />);

    await fireEvent.press(getByText('K-Profiles'));

    expect(getByText('Connected printer / nozzle')).toBeTruthy();
    expect(formatKProfileDetail(mockKProfiles[0])).toEqual({ subtitle: '0.4 mm nozzle · Filament GFA00', detail: 'K 0.020 · N 1.0\nAMS 1 · Tray 3' });
    expect(queryByText('No profile details available.')).toBeNull();
  });

  it('omits missing K-profile fields without rendering invalid values', async () => {
    mockKProfiles = [
      {
        name: 'Partial calibration',
        k_value: '0.035',
        n_coef: undefined,
        nozzle_diameter: '0.6',
        filament_id: 'PVA',
        ams_id: 0,
        tray_id: null,
        setting_id: null,
      },
    ];
    expect(formatKProfileDetail(mockKProfiles[0])).toEqual({ subtitle: '0.6 mm nozzle · Filament PVA', detail: 'K 0.035\nAMS 0' });
  });

  it('keeps rendering Cloud profile descriptions', async () => {
    const { getByText } = await render(<ProfilesScreen />);

    expect(getByText('Cloud profile description')).toBeTruthy();
  });
});
