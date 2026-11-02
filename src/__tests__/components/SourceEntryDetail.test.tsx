import React from 'react';
import { render } from '@testing-library/react-native';
import PrinterDetailScreen from '@/screens/PrinterDetailScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({ params: { id: '5' } }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data:
      queryKey[0] === 'printer'
        ? { id: 5, name: 'Lab', model: 'X1C' }
        : queryKey[0] === 'printerStatus'
        ? { state: 'IDLE', connected: false }
        : queryKey[0] === 'heaterHistory'
        ? { series: [] }
        : [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useMutation: () => ({ isPending: false, mutate: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/api/client', () => ({
  api: { getCameraSnapshotUrl: () => 'https://farm.test/snapshot' },
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/components/printers/PrinterSourceActions', () => {
  const { Text } = require('react-native');
  return {
    PrinterSourceActions: ({ printerId }: { printerId: number }) => (
      <Text>Sources for {printerId}</Text>
    ),
  };
});
jest.mock('@/components/settings/SmartPlugPowerControls', () => {
  const { Text } = require('react-native');
  return {
    PrinterPowerIntegration: ({ printerId }: { printerId: number }) => (
      <Text>Linked power for {printerId}</Text>
    ),
  };
});
jest.mock('@/components/printers/PrinterDeviceControls', () => {
  const { Text } = require('react-native');
  return {
    PrinterDeviceControls: ({ printerId }: { printerId: number }) => (
      <Text>Hardware for {printerId}</Text>
    ),
  };
});
jest.mock('@/components/printers/EditPrinterModal', () => ({
  EditPrinterModal: () => null,
}));
jest.mock('@/components/common/Charts', () => ({
  MultiSeriesLineChart: () => null,
}));
jest.mock('@/components/common/AppUI', () => {
  const { Text, View } = require('react-native');
  return {
    SectionCard: ({
      title,
      children,
    }: {
      title: string;
      children: React.ReactNode;
    }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
    PrimaryButton: ({ label }: { label: string }) => <Text>{label}</Text>,
    KeyValueRow: () => null,
    StatusBadge: () => null,
    InlineTabBar: () => null,
  };
});

it('mounts linked power immediately after Profile and keeps disconnected source entries and hardware controls reachable', async () => {
  const screen = await render(<PrinterDetailScreen />);
  const entries = screen.getAllByText(
    /^(Profile|Linked power for 5|Sources for 5|Status|Fan Speeds|Hardware for 5)$/,
  );
  expect(entries.map(entry => entry.props.children)).toEqual([
    'Profile',
    ['Linked power for ', 5],
    ['Sources for ', 5],
    'Status',
    'Fan Speeds',
    ['Hardware for ', 5],
  ]);
});
