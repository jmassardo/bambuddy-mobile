import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditPrinterModal } from '@/components/printers/EditPrinterModal';
import { FirmwareModal } from '@/components/printers/FirmwareModal';
import { MQTTConsole } from '@/components/printers/MQTTConsole';
import { api } from '@/api/client';
import { printerFleetApi } from '@/api/printerFleet';
import type { Printer } from '@/types/api';

let mockPermissions = new Set([
  'printers:update',
  'printers:control',
  'printers:read',
  'firmware:read',
  'firmware:update',
]);
const mockToast = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (permission: string) => mockPermissions.has(permission),
  }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    updatePrinter: jest.fn(),
    diagnoseConnection: jest.fn(),
    enableMQTTLogging: jest.fn(),
    disableMQTTLogging: jest.fn(),
    clearMQTTLogs: jest.fn(),
  },
}));
jest.mock('@/api/printerFleet', () => ({
  printerFleetApi: {
    firmware: jest.fn(),
    prepareFirmware: jest.fn(),
    uploadFirmware: jest.fn(),
    firmwareStatus: jest.fn(),
    logs: jest.fn(),
  },
}));

const printer = {
  id: 7,
  name: 'Lab',
  ip_address: 'printer.local',
  serial_number: 'SER7',
  model: 'P1S',
  auto_archive: true,
} as Printer;
async function mount(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return {
    ...(await render(
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    )),
    client,
  };
}
async function confirmLastAlert() {
  const calls = jest.mocked(Alert.alert).mock.calls;
  const buttons = calls[calls.length - 1][2];
  await act(async () => {
    buttons?.[buttons.length - 1].onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = new Set([
    'printers:update',
    'printers:control',
    'printers:read',
    'firmware:read',
    'firmware:update',
  ]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(api.updatePrinter).mockResolvedValue({});
  jest
    .mocked(api.diagnoseConnection)
    .mockResolvedValue({ checks: [] } as never);
});
afterEach(() => jest.restoreAllMocks());

it('preflights edited connection fields, preserves an unchanged secret, and persists archive/model options', async () => {
  const screen = await mount(
    <EditPrinterModal visible printer={printer} onClose={jest.fn()} />,
  );
  await fireEvent.changeText(
    screen.getByDisplayValue('printer.local'),
    'new.local',
  );
  await fireEvent.changeText(screen.getByDisplayValue('P1S'), 'P2S');
  await fireEvent(
    screen.getByLabelText('Automatically archive prints'),
    'valueChange',
    false,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(api.updatePrinter).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        ip_address: 'new.local',
        model: 'P2S',
        auto_archive: false,
      }),
    ),
  );
  expect(api.diagnoseConnection).toHaveBeenCalledWith({
    ip_address: 'new.local',
    serial_number: 'SER7',
  });
  expect(jest.mocked(api.updatePrinter).mock.calls[0][1]).not.toHaveProperty(
    'access_code',
  );
});

it('requires explicit save-anyway after failed diagnostics and sends replacement credentials only when entered', async () => {
  jest
    .mocked(api.diagnoseConnection)
    .mockResolvedValue({
      checks: [{ id: 'mqtt_auth', status: 'fail', params: {} }],
    } as never);
  const screen = await mount(
    <EditPrinterModal visible printer={printer} onClose={jest.fn()} />,
  );
  await fireEvent.changeText(
    screen.getByLabelText('Replacement access code (blank keeps existing)'),
    'replacement',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(api.updatePrinter).not.toHaveBeenCalled();
  await confirmLastAlert();
  await waitFor(() =>
    expect(api.updatePrinter).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ access_code: 'replacement' }),
    ),
  );
});

it('does not allow a viewer to save printer connection changes', async () => {
  mockPermissions.clear();
  const screen = await mount(
    <EditPrinterModal visible printer={printer} onClose={jest.fn()} />,
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(api.diagnoseConnection).not.toHaveBeenCalled();
});

function setupFirmware(canProceed = true) {
  jest.mocked(printerFleetApi.firmware).mockResolvedValue({
    printer_id: 7,
    current_version: '01.00',
    latest_version: '02.00',
    update_available: true,
    release_notes: 'New release',
    available_versions: [
      {
        version: '01.00',
        file_available: true,
        release_notes: 'Current',
        release_time: null,
      },
      {
        version: '02.00',
        file_available: true,
        release_notes: 'Latest release',
        release_time: null,
      },
      {
        version: '00.90',
        file_available: true,
        release_notes: 'Older release',
        release_time: null,
      },
      {
        version: '00.80',
        file_available: false,
        release_notes: null,
        release_time: null,
      },
    ],
  });
  jest
    .mocked(printerFleetApi.prepareFirmware)
    .mockResolvedValue({
      can_proceed: canProceed,
      sd_card_present: canProceed,
      sd_card_free_space: -1,
      firmware_size: 1024,
      space_sufficient: canProceed,
      errors: canProceed ? [] : ['Insert SD card'],
    });
  jest
    .mocked(printerFleetApi.firmwareStatus)
    .mockResolvedValue({
      status: 'idle',
      progress: 0,
      message: '',
      error: null,
      firmware_filename: null,
      firmware_version: null,
    });
  jest
    .mocked(printerFleetApi.uploadFirmware)
    .mockResolvedValue({ started: true, message: 'Started' });
}

it('does not claim firmware is current while info is loading, failed, or forbidden', async () => {
  setupFirmware();
  jest.mocked(printerFleetApi.firmware).mockImplementation(() => new Promise(() => {}));
  const pending = await mount(<FirmwareModal printerId={7} onClose={jest.fn()} />);
  expect(pending.queryByText('No newer firmware available')).toBeNull();
  await pending.unmount();
  pending.client.clear();

  jest.mocked(printerFleetApi.firmware).mockRejectedValue(new Error('Firmware unavailable'));
  const failed = await mount(<FirmwareModal printerId={7} onClose={jest.fn()} />);
  await failed.findByText('Firmware unavailable');
  expect(failed.queryByText('No newer firmware available')).toBeNull();
  await failed.unmount();
  failed.client.clear();

  mockPermissions.delete('firmware:read');
  const denied = await mount(<FirmwareModal printerId={7} onClose={jest.fn()} />);
  expect(denied.queryByText('No newer firmware available')).toBeNull();
  await denied.unmount();
  denied.client.clear();
});

it('selects older firmware, checks SD prerequisites and confirms a real upload request', async () => {
  setupFirmware();
  const screen = await mount(
    <FirmwareModal printerId={7} onClose={jest.fn()} />,
  );
  await waitFor(() =>
    expect(screen.getByText('Update available')).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: '00.90 · Available' }),
  );
  await waitFor(() =>
    expect(printerFleetApi.prepareFirmware).toHaveBeenCalledWith(7, '00.90'),
  );
  expect(
    screen.getByRole('button', { name: '01.00 · Installed' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: '00.80 · Unavailable' }),
  ).toBeDisabled();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Upload firmware to SD card' }),
    ).not.toBeDisabled(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Upload firmware to SD card' }),
  );
  expect(printerFleetApi.uploadFirmware).not.toHaveBeenCalled();
  await confirmLastAlert();
  await waitFor(() =>
    expect(printerFleetApi.uploadFirmware).toHaveBeenCalledWith(7, '00.90'),
  );
  expect(screen.getByText(/Uploading does not install firmware/)).toBeTruthy();
  await screen.unmount();
  screen.client.clear();
});

it('blocks upload when SD preflight fails and for firmware read-only users', async () => {
  setupFirmware(false);
  const screen = await mount(
    <FirmwareModal printerId={7} onClose={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByText('Insert SD card')).toBeTruthy());
  expect(
    screen.getByRole('button', { name: 'Upload firmware to SD card' }),
  ).toBeDisabled();
  expect(printerFleetApi.uploadFirmware).not.toHaveBeenCalled();
  await screen.unmount();
  mockPermissions.delete('firmware:update');
  const viewer = await mount(
    <FirmwareModal printerId={7} onClose={jest.fn()} />,
  );
  await waitFor(() =>
    expect(
      viewer.getByRole('button', { name: '00.90 · Available' }),
    ).toBeDisabled(),
  );
  await viewer.unmount();
});

it('shows firmware upload failure, allows retry, and displays completion without claiming installation', async () => {
  setupFirmware();
  jest
    .mocked(printerFleetApi.uploadFirmware)
    .mockRejectedValueOnce(new Error('FTP failed'));
  const screen = await mount(
    <FirmwareModal printerId={7} onClose={jest.fn()} />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Upload firmware to SD card' }),
    ).not.toBeDisabled(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Upload firmware to SD card' }),
  );
  await confirmLastAlert();
  await waitFor(() => expect(screen.getByText('FTP failed')).toBeTruthy());
  jest
    .mocked(printerFleetApi.firmwareStatus)
    .mockResolvedValue({
      status: 'complete',
      progress: 100,
      message: 'Upload complete',
      error: null,
      firmware_filename: 'firmware.bin',
      firmware_version: '02.00',
    });
  await fireEvent.press(
    screen.getByRole('button', { name: 'Upload firmware to SD card' }),
  );
  await confirmLastAlert();
  await waitFor(() =>
    expect(screen.getByText('complete: 100% — Upload complete')).toBeTruthy(),
  );
  expect(screen.getByText('SD file: firmware.bin')).toBeTruthy();
  expect(screen.getByText(/Uploading does not install firmware/)).toBeTruthy();
  await screen.unmount();
  screen.client.clear();
});

it('enables MQTT capture, filters direction/search, expands payloads, and confirms clear before disabling', async () => {
  const logs = [
    {
      timestamp: 'one',
      topic: 'device/report',
      direction: 'in' as const,
      payload: { temperature: 210 },
    },
    {
      timestamp: 'two',
      topic: 'device/request',
      direction: 'out' as const,
      payload: { command: 'pushall' },
    },
  ];
  jest
    .mocked(printerFleetApi.logs)
    .mockResolvedValue({ logging_enabled: false, logs });
  const screen = await mount(<MQTTConsole printerId={7} />);
  await waitFor(() =>
    expect(screen.getByText('one in device/report')).toBeTruthy(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Enable logging' }));
  await waitFor(() => expect(api.enableMQTTLogging).toHaveBeenCalledWith(7));
  await fireEvent.press(screen.getByRole('button', { name: 'Outbound' }));
  expect(screen.queryByText('one in device/report')).toBeNull();
  await fireEvent.press(screen.getByText('two out device/request'));
  expect(screen.getByText(/"command": "pushall"/)).toBeTruthy();
  await fireEvent.changeText(
    screen.getByPlaceholderText('Search topics and payloads'),
    'temperature',
  );
  expect(screen.queryByText('two out device/request')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear logs' }));
  expect(api.clearMQTTLogs).not.toHaveBeenCalled();
  await confirmLastAlert();
  await waitFor(() => expect(api.clearMQTTLogs).toHaveBeenCalledWith(7));
  jest
    .mocked(printerFleetApi.logs)
    .mockResolvedValue({ logging_enabled: true, logs: [] });
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Disable logging' }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Disable logging' }),
  );
  await waitFor(() => expect(api.disableMQTTLogging).toHaveBeenCalledWith(7));
  await screen.unmount();
  screen.client.clear();
});

it('shows MQTT operation errors and gates management for read-only users', async () => {
  jest
    .mocked(printerFleetApi.logs)
    .mockResolvedValue({ logging_enabled: false, logs: [] });
  jest
    .mocked(api.enableMQTTLogging)
    .mockRejectedValueOnce(new Error('Printer not connected'));
  const screen = await mount(<MQTTConsole printerId={7} />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Enable logging' }),
    ).not.toBeDisabled(),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Enable logging' }));
  await waitFor(() =>
    expect(screen.getByText('Printer not connected')).toBeTruthy(),
  );
  await screen.unmount();
  mockPermissions.delete('printers:control');
  const viewer = await mount(<MQTTConsole printerId={7} />);
  expect(viewer.getByRole('button', { name: 'Enable logging' })).toBeDisabled();
  expect(viewer.getByRole('button', { name: 'Clear logs' })).toBeDisabled();
  await viewer.unmount();
});
