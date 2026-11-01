import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrinterHAControls } from '@/components/printers/PrinterDeviceControls';
import { PrinterSDBrowser } from '@/components/printers/PrinterSDBrowser';
import { AmsUnitControls } from '@/components/printers/AmsUnitControls';
import { api } from '@/api/client';
import { printerControlsApi as device } from '@/api/printerControls';
import { shareBlob } from '@/utils/share';
import type { AMSUnit, PrinterStatus, SmartPlug } from '@/types/api';

jest.mock('@/components/printers/SkipObjectsPlate', () => ({ SkipObjectsPlate: () => null }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/utils/share', () => ({ shareBlob: jest.fn(), blobToDataUrl: jest.fn() }));
jest.mock('@/api/client', () => ({ api: { controlSmartPlug: jest.fn() } }));
jest.mock('@/api/printerControls', () => ({
  printerControlsApi: {
    haReadings: jest.fn(), haActions: jest.fn(), files: jest.fn(), download: jest.fn(), deleteFile: jest.fn(),
    history: jest.fn(), scheduled: jest.fn(), label: jest.fn(), resetLabel: jest.fn(),
  },
}));
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
function mount(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(device.haReadings).mockResolvedValue([{ id: 5, name: 'Door', state: 'closed', value: null, unit: null, reachable: true, alerting: false } as Awaited<ReturnType<typeof device.haReadings>>[number]]);
  jest.mocked(device.haActions).mockResolvedValue([]);
  jest.mocked(api.controlSmartPlug).mockResolvedValue({ success: true, action: 'toggle' });
  jest.mocked(device.files).mockResolvedValue({ path: '/', warnings: [], files: [{ name: 'part.3mf', path: '/part.3mf', size: 50, is_directory: false }] });
  jest.mocked(device.deleteFile).mockResolvedValue(undefined);
  jest.mocked(device.download).mockResolvedValue(new Blob(['printer data']));
  jest.mocked(device.scheduled).mockResolvedValue([]);
  jest.mocked(device.history).mockResolvedValue({
    printer_id: 7, ams_id: 128, data: [{ recorded_at: '2026-10-27T00:00:00Z', humidity: 0, humidity_raw: 0, temperature: 24 }],
    min_humidity: 0, max_humidity: 0, avg_humidity: 0, min_temperature: 24, max_temperature: 24, avg_temperature: 24,
  });
  jest.mocked(device.label).mockResolvedValue(undefined);
});

it('shows printer-bound HA readings even when no smart plug exists', async () => {
  const screen = await mount(<PrinterHAControls printerId={7} />);
  await waitFor(() => expect(screen.getByText('Door: closed ')).toBeTruthy());
  expect(device.haReadings).toHaveBeenCalledWith(7);
});

it('runs scripts directly but requires confirmation before toggling an entity', async () => {
  jest.mocked(device.haActions).mockResolvedValue([
    { id: 1, name: 'Ventilate', printer_id: 7, plug_type: 'homeassistant', ha_entity_id: 'script.ventilate', show_on_printer_card: true },
    { id: 2, name: 'Filter', printer_id: 7, plug_type: 'homeassistant', ha_entity_id: 'switch.filter', show_on_printer_card: true },
  ] as SmartPlug[]);
  const screen = await mount(<PrinterHAControls printerId={7} />);
  await waitFor(() => expect(screen.getByText('Run Ventilate')).toBeTruthy());
  await fireEvent.press(screen.getByText('Run Ventilate'));
  await waitFor(() => expect(api.controlSmartPlug).toHaveBeenCalledWith(1, 'on'));
  await waitFor(() => expect(screen.getByText('Toggle Filter')).toBeEnabled());
  await fireEvent.press(screen.getByText('Toggle Filter'));
  expect(api.controlSmartPlug).not.toHaveBeenCalledWith(2, 'toggle');
  await act(async () => alert.mock.calls.at(-1)?.[2]?.at(-1)?.onPress?.());
  await waitFor(() => expect(api.controlSmartPlug).toHaveBeenCalledWith(2, 'toggle'));
});

it('downloads a selected physical-printer file through native save/share and confirms deletion', async () => {
  const screen = await mount(<PrinterSDBrowser visible printerId={7} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('☐ part.3mf')).toBeTruthy());
  await fireEvent.press(screen.getByText('☐ part.3mf'));
  await fireEvent.press(screen.getByText('Download selected (1)'));
  await waitFor(() => expect(shareBlob).toHaveBeenCalledWith(expect.any(Blob), 'part.3mf'));
  expect(device.download).toHaveBeenCalledWith(7, '/part.3mf');
  await waitFor(() => expect(screen.getByText('☐ part.3mf')).toBeTruthy());
  await fireEvent.press(screen.getByText('☐ part.3mf'));
  await fireEvent.press(screen.getByText('Delete'));
  expect(device.deleteFile).not.toHaveBeenCalled();
  expect(alert.mock.calls.at(-1)?.[1]).toContain('physical printer');
  await act(async () => alert.mock.calls.at(-1)?.[2]?.at(-1)?.onPress?.());
  await waitFor(() => expect(device.deleteFile).toHaveBeenCalledWith(7, '/part.3mf'));
});

it('does not present an unavailable printer storage response as an empty directory', async () => {
  jest.mocked(device.files).mockResolvedValue({ path: '/', files: [], warnings: ['printer_unavailable'] });
  const screen = await mount(<PrinterSDBrowser visible printerId={7} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Printer storage is unavailable; this is not an empty directory.')).toBeTruthy());
  expect(screen.queryByText('Empty folder.')).toBeNull();
});

it('shows true zero environmental summaries, supports ranges, and saves an AMS name by serial', async () => {
  const screen = await mount(<AmsUnitControls printerId={7}
    ams={{ id: 128, serial_number: 'HT-SERIAL', sw_ver: '01.02', module_type: 'ams', tray: [] } as unknown as AMSUnit}
    status={{ supports_drying: false } as PrinterStatus} name="Drybox" />);
  await fireEvent.press(screen.getByText('AMS details, name and history'));
  await waitFor(() => expect(screen.getByText('Min 0 · Avg 0 · Max 0')).toBeTruthy());
  await fireEvent.press(screen.getByText('6h'));
  await waitFor(() => expect(device.history).toHaveBeenCalledWith(7, 128, 6));
  await fireEvent.changeText(screen.getByLabelText('Friendly name'), 'Nylon drybox');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(device.label).toHaveBeenCalledWith(7, 128, 'Nylon drybox', 'HT-SERIAL'));
});
