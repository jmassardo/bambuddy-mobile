import React from 'react';
import { render } from '@testing-library/react-native';
import PrinterDetailScreen from '@/screens/PrinterDetailScreen';

let mockCanControl = true;
let mockConnected = true;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: { id: '1' } }),
}));
jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === 'printer'
      ? { name: 'Printer One', model: 'X1C' }
      : queryKey[0] === 'printerStatus'
        ? {
            connected: mockConnected,
            state: 'IDLE',
            temperatures: {
              nozzle: { current: 210, target: 220 },
              bed: { current: 60, target: 65 },
              chamber: { current: 35, target: 40 },
            },
            fans: { part: 40, aux: 30, chamber: 20 },
            hms_errors: [],
            ams_slots: [],
          }
        : queryKey[0] === 'heaterHistory'
          ? { series: [] }
          : undefined,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: { getCameraSnapshotUrl: () => 'https://example.test/camera.jpg' },
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      permission !== 'printers:control' || mockCanControl,
  }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.dark, isDark: true }),
}));
jest.mock('@/components/common/Charts', () => ({ MultiSeriesLineChart: () => null }));
jest.mock('@/components/printers/EditPrinterModal', () => ({ EditPrinterModal: () => null }));
jest.mock('@/components/printers/PrinterDeviceControls', () => ({ PrinterDeviceControls: () => null }));
jest.mock('@/components/printers/PrinterSourceActions', () => ({ PrinterSourceActions: () => null }));
jest.mock('@/components/settings/SmartPlugPowerControls', () => ({ PrinterPowerIntegration: () => null }));
jest.mock('@/hooks/useStreamToken', () => ({
  useCameraToken: () => ({ token: null, isReady: false }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCanControl = true;
  mockConnected = true;
});

it.each(['permission', 'connection'])(
  'disables light, jogging and speed when %s is unavailable',
  async reason => {
    mockCanControl = reason !== 'permission';
    mockConnected = reason !== 'connection';
    const screen = await render(<PrinterDetailScreen />);
    expect(screen.getByRole('button', { name: /Light/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Silent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '0.1mm' })).toBeDisabled();
  },
);
