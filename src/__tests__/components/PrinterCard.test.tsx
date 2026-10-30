/* eslint-disable @typescript-eslint/no-shadow -- Test file with React imports shadowing globals */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PrinterCard } from '@/components/printers/PrinterCard';
import { api } from '@/api/client';

const mockNavigate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockSetQueryData = jest.fn();
const mockShowToast = jest.fn();
let mockCanControl = false;

jest.mock('@/api/workflowSettings', () => ({
  workflowSettingsApi: { getPrinterAiStatus: jest.fn() },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: (options: { mutationFn: (value: unknown) => Promise<unknown>; onSuccess?: (value: unknown, variables: unknown) => void; onError?: (error: unknown) => void }) => ({
    mutate: (variables: unknown) => Promise.resolve().then(() => options.mutationFn(variables)).then(value => options.onSuccess?.(value, variables)).catch(error => options.onError?.(error)),
    isPending: false,
  }),
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
  getAuthToken: () => null,
  withStreamToken: (url: string) => `${url}?token=media-token`,
  api: { pausePrint: jest.fn(), resumePrint: jest.fn(), stopPrint: jest.fn(), deletePrinter: jest.fn(), connectPrinter: jest.fn(), refreshPrinterStatus: jest.fn() },
}));
jest.mock('@/api/printerFleet', () => ({ printerFleetApi: {} }));
jest.mock('@/hooks/useStreamToken', () => ({ useMediaToken: () => ({ token: 'media-token' }) }));

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
jest.mock('@/components/printers/PrinterSourceActions', () => {
  const { Text } = require('react-native');
  return { PrinterSourceActions: ({ printerId }: { printerId: number }) => <Text>Printer sources {printerId}</Text> };
});
jest.mock('@/components/printers/HMSErrorModal', () => ({ HMSErrorModal: () => null }));
jest.mock('@/components/printers/MoveControlsModal', () => ({ MoveControlsModal: () => null }));
jest.mock('@/components/printers/SkipObjectsModal', () => ({ SkipObjectsModal: () => null }));
jest.mock('@/components/printers/TrayDetailModal', () => ({ TrayDetailModal: () => null }));
jest.mock('@/components/printers/hmsErrorCatalog', () => ({ filterKnownHMSErrors: (errors: unknown[]) => errors }));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => mockCanControl,
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanControl = false;
  });
  afterEach(() => jest.restoreAllMocks());
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

  it.each([false, true])('keeps source actions reachable while disconnected (compact %s)', async compact => {
    const screen = await render(<PrinterCard printer={printer} status={{ ...status, connected: false }} compact={compact} />);
    expect(screen.getByText('Printer sources 1')).toBeTruthy();
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

  it('confirms physical print stop and does not send anything on cancellation', async () => {
    mockCanControl = true;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await render(<PrinterCard printer={printer} status={status} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    expect(api.stopPrint).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('stop print?', expect.stringContaining('cannot be resumed'), expect.any(Array));
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => buttons[buttons.length - 1].onPress?.());
    await waitFor(() => expect(api.stopPrint).toHaveBeenCalledWith(1));
  });

  it('offers archive retention explicitly and calls a real reconnect/republish instead of HTTP reload', async () => {
    mockCanControl = true;
    jest.mocked(api.connectPrinter).mockResolvedValue({ connected: true });
    const screen = await render(<PrinterCard printer={printer} status={status} />);
    await fireEvent.press(screen.getByRole('button', { name: 'More options' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reconnect MQTT transport' }));
    await waitFor(() => expect(api.connectPrinter).toHaveBeenCalledWith(1));
    await fireEvent.press(screen.getByRole('button', { name: 'Force device status republish' }));
    await waitFor(() => expect(api.refreshPrinterStatus).toHaveBeenCalledWith(1));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(api.deletePrinter).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete printer · keep archives' }));
    await waitFor(() => expect(api.deletePrinter).toHaveBeenCalledWith(1, false));
  });

  it('shows compact ETA/layers and only offers plate clearance with permission', async () => {
    const compactStatus = { ...status, state: 'FINISH', awaiting_plate_clear: true, remaining_time: 12, layer_num: 3, total_layers: 20 };
    const screen = await render(<PrinterCard printer={printer} status={compactStatus} compact />);
    expect(screen.getByText('Plate awaiting clearance')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark plate as cleared?' })).toBeNull();
    await screen.rerender(<PrinterCard printer={printer} status={{ ...compactStatus, state: 'PAUSE' }} compact />);
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByText(/12 min · ETA .* · Layer 3\/20/)).toBeTruthy();
  });

  it('requires a separate destructive confirmation before deleting archives with a printer', async () => {
    mockCanControl = true;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await render(<PrinterCard printer={printer} status={status} />);
    await fireEvent.press(screen.getByRole('button', { name: 'More options' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete printer AND archives' }));
    expect(api.deletePrinter).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => buttons[buttons.length - 1].onPress?.());
    await waitFor(() => expect(api.deletePrinter).toHaveBeenCalledWith(1, true));
  });

  it('keeps paused and dirty-plate context visible alongside compact HMS alerts', async () => {
    const screen = await render(<PrinterCard printer={printer} status={{ ...status, state: 'PAUSE', awaiting_plate_clear: true, hms_errors: [{ code: '0300_8004', attr: 0, severity: 1, module: 0 }] }} compact />);
    expect(screen.getByText('1 HMS alerts')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByText('Plate awaiting clearance')).toBeTruthy();
  });
});
