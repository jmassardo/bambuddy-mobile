import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NumericDeviceControl } from '@/components/printers/PrinterDeviceControls';
import { AmsUnitControls } from '@/components/printers/AmsUnitControls';
import { ConfigureDeviceSlot } from '@/components/printers/ConfigureDeviceSlot';
import { SkipObjectsModal } from '@/components/printers/SkipObjectsModal';
import { api } from '@/api/client';
import { printerControlsApi as device } from '@/api/printerControls';
import type { AMSUnit, AMSTray, PrinterStatus } from '@/types/api';

jest.mock('@/components/printers/SkipObjectsPlate', () => ({ SkipObjectsPlate: () => null }));
jest.mock('@/api/client', () => ({
  api: {
    getPrinterStatus: jest.fn(), getPrintableObjects: jest.fn(), skipObjects: jest.fn(),
    getKProfiles: jest.fn(), getCloudProfileDetail: jest.fn(), startDrying: jest.fn(),
  },
}));
jest.mock('@/api/printerControls', () => ({
  printerControlsApi: {
    scheduled: jest.fn(), schedule: jest.fn(), configure: jest.fn(), saveMapping: jest.fn(), resetSlot: jest.fn(),
  },
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));

const status = { connected: true, state: 'RUNNING', layer_num: 2, current_print: 'job',
  supports_drying: true, supports_drying_while_printing: false, nozzles: [{ nozzle_diameter: '0.4' }] } as PrinterStatus;
const ams = { id: 128, module_type: 'n3s', tray: [], dry_time: 0, dry_sf_reason: [] } as unknown as AMSUnit;
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
function mount(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
async function confirmAlert() {
  const buttons = alert.mock.calls.at(-1)?.[2];
  await act(async () => buttons?.at(-1)?.onPress?.());
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.getPrinterStatus).mockResolvedValue(status);
  jest.mocked(api.getPrintableObjects).mockResolvedValue({ objects: [
    { id: 4, name: 'Bracket', skipped: false }, { id: 8, name: 'Cover', skipped: false },
    { id: 9, name: 'Already skipped', skipped: true },
  ] });
  jest.mocked(device.scheduled).mockResolvedValue([]);
  jest.mocked(api.skipObjects).mockResolvedValue();
  jest.mocked(api.getKProfiles).mockResolvedValue({ profiles: [], nozzle_diameter: '0.4' });
  jest.mocked(device.configure).mockResolvedValue({ tray_info_idx: 'P1234567' });
  jest.mocked(device.saveMapping).mockResolvedValue(undefined);
  jest.mocked(device.resetSlot).mockResolvedValue(undefined);
  jest.mocked(device.schedule).mockResolvedValue({ id: 1 } as Awaited<ReturnType<typeof device.schedule>>);
});

it('does not send invalid numeric targets and sends explicit off as zero', async () => {
  const submit = jest.fn().mockResolvedValue(undefined);
  const screen = await mount(<NumericDeviceControl label="Chamber" max={65} disabled={false} submit={submit} />);
  await fireEvent.changeText(screen.getByPlaceholderText('0–65'), '85');
  await fireEvent.press(screen.getByText('Apply'));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByText('Enter a whole number between 0 and 65.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Off'));
  await waitFor(() => expect(submit).toHaveBeenCalledWith(0, expect.anything()));
});

it('confirms one grouped request and never offers already-skipped objects', async () => {
  const screen = await mount(<SkipObjectsModal visible printerId={7} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('☐ Bracket')).toBeTruthy());
  await fireEvent.press(screen.getByText('☐ Bracket'));
  await fireEvent.press(screen.getByText('☐ Cover'));
  await fireEvent.press(screen.getByText('Skip selected (2)'));
  expect(api.skipObjects).not.toHaveBeenCalled();
  expect(alert.mock.calls.at(-1)?.[1]).toContain('every remaining object');
  await confirmAlert();
  await waitFor(() => expect(api.skipObjects).toHaveBeenCalledWith(7, [4, 8]));
  expect(api.skipObjects).toHaveBeenCalledTimes(1);
});

it('retains the layer guard even when objects are available after reconnect', async () => {
  jest.mocked(api.getPrinterStatus).mockResolvedValue({ ...status, layer_num: 1 });
  const screen = await mount(<SkipObjectsModal visible printerId={7} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('☐ Bracket')).toBeTruthy());
  await fireEvent.press(screen.getByText('☐ Bracket'));
  await fireEvent.press(screen.getByText('Select all remaining'));
  await fireEvent.press(screen.getByText('Skip selected (0)'));
  expect(api.skipObjects).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
});

it('schedules a delayed HT drying without allowing immediate drying during an unsupported print', async () => {
  const screen = await mount(<AmsUnitControls printerId={7} ams={ams} status={status} />);
  await fireEvent.changeText(screen.getByLabelText('Drying temperature (45–85°C)'), '80');
  await fireEvent.changeText(screen.getByLabelText('Duration (1–24 hours)'), '12');
  await fireEvent.changeText(screen.getByLabelText('Delay (minutes, optional)'), '60');
  await fireEvent.press(screen.getByText('Start drying'));
  expect(api.startDrying).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Schedule drying'));
  expect(device.schedule).not.toHaveBeenCalled();
  await confirmAlert();
  await waitFor(() => expect(device.schedule).toHaveBeenCalledWith(expect.objectContaining({
    printer_id: 7, ams_id: 128, temp: 80, duration_hours: 12, rotate_tray: false,
  })));
  const scheduled = jest.mocked(device.schedule).mock.calls[0][0];
  expect(new Date(scheduled.start_after!).getTime()).toBeGreaterThan(Date.now() + 59 * 60000);
});

it('rejects a Pro drying temperature above its hardware bound, rather than silently clamping', async () => {
  const screen = await mount(<AmsUnitControls printerId={7} ams={{ ...ams, id: 0, module_type: 'n3f' }} status={{ ...status, state: 'IDLE' }} />);
  await fireEvent.changeText(screen.getByLabelText('Drying temperature (45–65°C)'), '80');
  await fireEvent.changeText(screen.getByLabelText('Duration (1–24 hours)'), '6');
  await fireEvent.press(screen.getByText('Schedule drying'));
  expect(device.schedule).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  expect(screen.getByText('Check drying settings: 45–65')).toBeTruthy();
});

it('configures real material/color/K parameters before persisting the selected source association', async () => {
  const saved = jest.fn();
  const screen = await mount(<ConfigureDeviceSlot printerId={7} amsId={128} trayId={0}
    tray={{ tray_color: '112233FF', nozzle_temp_min: 220, nozzle_temp_max: 260 } as AMSTray}
    preset={{ id: 'orca-profile-uuid', name: 'Custom PETG @ Printer', source: 'orca_cloud', filament_type: 'PETG' }} onSaved={saved} />);
  await waitFor(() => expect(screen.getByDisplayValue('0.4')).toBeTruthy());
  await fireEvent.press(screen.getByText('Configure printer and save profile association'));
  expect(device.configure).not.toHaveBeenCalled();
  await confirmAlert();
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(device.configure).toHaveBeenCalledWith(7, 128, 0, expect.objectContaining({
    tray_info_idx: '', setting_id: '', orca_profile_id: 'orca-profile-uuid',
    tray_type: 'PETG', tray_sub_brands: 'Custom PETG', tray_color: '112233FF',
    nozzle_temp_min: 220, nozzle_temp_max: 260, cali_idx: -1,
  }));
  expect(device.saveMapping).toHaveBeenCalledWith(7, 128, 0, 'orca-profile-uuid', 'Custom PETG @ Printer', 'orca_cloud', 'P1234567');
});

it('does not claim complete slot configuration when saving the association fails', async () => {
  jest.mocked(device.saveMapping).mockRejectedValue(new Error('Mapping unavailable'));
  const saved = jest.fn();
  const screen = await mount(<ConfigureDeviceSlot printerId={7} amsId={0} trayId={1}
    tray={{ tray_color: '112233FF', nozzle_temp_min: 190, nozzle_temp_max: 230 } as AMSTray}
    preset={{ id: 'builtin_GFL99', name: 'Generic PLA', source: 'standard', filament_type: 'PLA' }} onSaved={saved} />);
  await waitFor(() => expect(screen.getByDisplayValue('0.4')).toBeTruthy());
  await fireEvent.press(screen.getByText('Configure printer and save profile association'));
  await confirmAlert();
  await waitFor(() => expect(screen.getByText('Mapping unavailable')).toBeTruthy());
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByText(/Device configured, but saving its profile association failed/)).toBeTruthy();
});

it.each([[254, 0], [255, 1]])('configures, maps and resets global external tray %i as local slot %i', async (globalTrayId, localTrayId) => {
  const saved = jest.fn();
  const screen = await mount(<ConfigureDeviceSlot printerId={7} amsId={255} trayId={globalTrayId}
    tray={{ tray_color: '112233FF', nozzle_temp_min: 190, nozzle_temp_max: 230 } as AMSTray}
    preset={{ id: 'builtin_GFL99', name: 'Generic PLA', source: 'standard', filament_type: 'PLA' }} onSaved={saved} />);
  await waitFor(() => expect(screen.getByDisplayValue('0.4')).toBeTruthy());
  await fireEvent.press(screen.getByText('Configure printer and save profile association'));
  await confirmAlert();
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(device.configure).toHaveBeenCalledWith(7, 255, localTrayId, expect.objectContaining({ tray_type: 'PLA' }));
  expect(device.saveMapping).toHaveBeenCalledWith(7, 255, localTrayId, 'builtin_GFL99', 'Generic PLA', 'builtin', 'P1234567');
  await fireEvent.press(screen.getByText('Reset slot to generic defaults'));
  await confirmAlert();
  await waitFor(() => expect(device.resetSlot).toHaveBeenCalledWith(7, 255, localTrayId));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(2));
});
