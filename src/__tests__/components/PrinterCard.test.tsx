import React from 'react';
import { render } from '@testing-library/react-native';
import { PrinterCard } from '@/components/printers/PrinterCard';

const mockNavigate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockSetQueryData = jest.fn();
const mockShowToast = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
  getAuthToken: () => null,
  api: {},
}));

jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { serverUrl: string }) => unknown) =>
    selector({ serverUrl: 'https://bambuddy.test' }),
}));

jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    StatusBadge: ({ label }: { label: string }) => React.createElement(Text, null, label),
  };
});

jest.mock('@/components/printers/EditPrinterModal', () => ({ EditPrinterModal: () => null }));
jest.mock('@/components/printers/HMSErrorModal', () => ({ HMSErrorModal: () => null }));
jest.mock('@/components/printers/MoveControlsModal', () => ({ MoveControlsModal: () => null }));
jest.mock('@/components/printers/SkipObjectsModal', () => ({ SkipObjectsModal: () => null }));
jest.mock('@/components/printers/TrayDetailModal', () => ({ TrayDetailModal: () => null }));
jest.mock('@/components/printers/hmsErrorCatalog', () => ({ filterKnownHMSErrors: () => [] }));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => false,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
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

describe('PrinterCard', () => {
  const printer = {
    id: 1,
    name: 'Printer Alpha',
    model: 'X1 Carbon',
    location: 'Lab',
    is_active: true,
  } as any;

  const status = {
    connected: true,
    state: 'RUNNING',
    progress: 42,
    hms_errors: [],
    ams: [
      {
        id: 0,
        tray: [
          {
            id: 0,
            tray_type: 'PLA',
            tray_sub_brands: 'PLA Basic',
            tray_color: '#ffffff',
            remain: 80,
            state: 1,
          },
          {
            id: 1,
            tray_type: 'PETG',
            tray_sub_brands: 'PETG',
            tray_color: '#000000',
            remain: 25,
            state: 1,
          },
        ],
      },
    ],
    vt_tray: [],
  } as any;

  it('renders the printer name', async () => {
    const { getByText } = await render(<PrinterCard printer={printer} status={status} />);

    expect(getByText('Printer Alpha')).toBeTruthy();
  });

  it('shows the correct status indicator', async () => {
    const { getAllByText, rerender } = await render(
      <PrinterCard printer={printer} status={status} />,
    );

    expect(getAllByText('Printing').length).toBeGreaterThan(0);

    await rerender(
      <PrinterCard
        printer={printer}
        status={{ ...status, connected: false, state: 'IDLE' }}
      />,
    );

    expect(getAllByText('Offline').length).toBeGreaterThan(0);
  });

  it('shows filament fill percentages for loaded trays', async () => {
    const { getByText } = await render(
      <PrinterCard printer={printer} status={status} />,
    );

    expect(getByText('80% remaining')).toBeTruthy();
    expect(getByText('25% remaining')).toBeTruthy();
  });
});
