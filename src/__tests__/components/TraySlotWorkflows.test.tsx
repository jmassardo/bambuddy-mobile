import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TrayDetailModal } from '@/components/printers/TrayDetailModal';
import { AssignSpoolModal } from '@/components/printers/AssignSpoolModal';
import { api } from '@/api/client';
import { printerControlsApi as device } from '@/api/printerControls';
import type { AMSTray, InventorySpool, PrinterStatus, SpoolAssignment } from '@/types/api';

const mockToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => {
  const { resolveNativeMessage } = jest.requireActual<typeof import('@/i18n')>('@/i18n');
  const showToast = (message: Parameters<typeof resolveNativeMessage>[0], ...args: unknown[]) => mockToast(resolveNativeMessage(message), ...args);
  return { useToast: () => ({ showToast }) };
});
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/components/printers/LinkSpoolModal', () => ({ LinkSpoolModal: () => null }));
jest.mock('@/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    getPrinterStatus: jest.fn(), getAssignments: jest.fn(), getSpoolmanStatus: jest.fn(),
    getSlotPresets: jest.fn(), refreshAmsSlot: jest.fn(), getSpools: jest.fn(), assignSpool: jest.fn(), unassignSpool: jest.fn(),
  },
}));
jest.mock('@/api/printerControls', () => ({
  printerControlsApi: { load: jest.fn(), unload: jest.fn(), spoolmanSpools: jest.fn(), spoolmanBindings: jest.fn(), assignSpoolman: jest.fn() },
}));

const tray = { id: 2, tray_color: '112233FF', tray_type: 'PLA', tray_sub_brands: 'PLA Basic',
  tray_info_idx: 'GFL99', remain: 50, state: 10 } as AMSTray;
const context = { amsId: 1, trayId: 2, slotIndex: 2, isExternal: false, label: '3', amsLabel: 'AMS B' };
const idle = { connected: true, state: 'IDLE', temperatures: { nozzle: 25, nozzle_2: 25 },
  fila_switch: { installed: true }, ams: [{ id: 1, tray: [tray] }], last_ams_update: 100 } as unknown as PrinterStatus;
const spool = { id: 3, material: 'PETG', brand: 'Brand', rgba: 'AABBCCFF', label_weight: 1000, weight_used: 100,
  archived_at: null, slicer_filament_name: 'PETG HF' } as InventorySpool;
const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
async function mount(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return { ...(await render(<QueryClientProvider client={client}>{element}</QueryClientProvider>)), client };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.getPrinterStatus).mockResolvedValue(idle);
  jest.mocked(api.getAssignments).mockResolvedValue([]);
  jest.mocked(api.getSlotPresets).mockResolvedValue({});
  jest.mocked(api.getSpoolmanStatus).mockResolvedValue({ enabled: false } as Awaited<ReturnType<typeof api.getSpoolmanStatus>>);
  jest.mocked(api.getSpools).mockResolvedValue([spool]);
  jest.mocked(api.assignSpool).mockResolvedValue({ pending_config: true } as SpoolAssignment);
  jest.mocked(api.unassignSpool).mockResolvedValue(undefined);
  jest.mocked(device.load).mockResolvedValue(undefined);
  jest.mocked(device.unload).mockResolvedValue(undefined);
  jest.mocked(api.refreshAmsSlot).mockResolvedValue(undefined);
  jest.mocked(device.spoolmanSpools).mockResolvedValue([spool]);
  jest.mocked(device.spoolmanBindings).mockResolvedValue([]);
  jest.mocked(device.assignSpoolman).mockResolvedValue(undefined);
});

it('asks for a feed direction only with FTS hardware and sends the selected hotend and addressed slot', async () => {
  const screen = await mount(<TrayDetailModal visible printerId={7} tray={tray} context={context} isPrinting={false} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Load filament')).toBeEnabled());
  await fireEvent.press(screen.getByText('Load filament'));
  expect(alert.mock.calls.at(-1)?.[0]).toBe('Choose feed direction');
  await act(async () => alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Left')?.onPress?.());
  await waitFor(() => expect(device.load).toHaveBeenCalledWith(7, 6, 1));
});

it('does not send an extruder override on a fixed-feed printer', async () => {
  jest.mocked(api.getPrinterStatus).mockResolvedValue({ ...idle, fila_switch: null });
  const screen = await mount(<TrayDetailModal visible printerId={7} tray={tray} context={context} isPrinting={false} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Load filament')).toBeEnabled());
  await fireEvent.press(screen.getByText('Load filament'));
  await waitFor(() => expect(device.load).toHaveBeenCalledWith(7, 6, undefined));
  expect(alert).not.toHaveBeenCalled();
});

it('warns about the HT unload fallback instead of addressing another unit', async () => {
  const screen = await mount(<TrayDetailModal visible printerId={7} tray={tray}
    context={{ ...context, amsId: 128, trayId: 0 }} isPrinting={false} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Unload filament')).toBeEnabled());
  await fireEvent.press(screen.getByText('Unload filament'));
  expect(alert.mock.calls.at(-1)?.[1]).toContain('cannot be addressed individually');
  await act(async () => alert.mock.calls.at(-1)?.[2]?.at(-1)?.onPress?.());
  await waitFor(() => expect(device.unload).toHaveBeenCalledWith(7, undefined));
});

it('rereads the actual selected AMS slot and waits for updated device telemetry', async () => {
  const screen = await mount(<TrayDetailModal visible printerId={7} tray={tray} context={context} isPrinting={false} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Reread spool RFID on printer')).toBeEnabled());
  await fireEvent.press(screen.getByText('Reread spool RFID on printer'));
  await waitFor(() => expect(api.refreshAmsSlot).toHaveBeenCalledWith(7, 1, 2));
  expect(mockToast).not.toHaveBeenCalledWith('AMS status refreshed after RFID reread.', 'success');
  await act(async () => { screen.client.setQueryData(['printerStatus', 7], { ...idle, last_ams_update: 101, ams_status_main: 0 }); });
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('AMS status refreshed after RFID reread.', 'success'));
});

it('warns about incompatible inventory material and reports an assignment awaiting insertion honestly', async () => {
  const screen = await mount(<AssignSpoolModal visible printerId={7} amsId={1} trayId={2} slotLabel="AMS B 3"
    materialHint="PLA" profileHint="PLA Basic" onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Brand • PETG')).toBeTruthy());
  await fireEvent.press(screen.getByText('Brand • PETG'));
  expect(alert.mock.calls.at(-1)?.[0]).toBe('Material / profile mismatch');
  expect(api.assignSpool).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls.at(-1)?.[2]?.at(-1)?.onPress?.());
  await waitFor(() => expect(api.assignSpool).toHaveBeenCalledWith(3, 7, 1, 2));
  expect(mockToast).toHaveBeenCalledWith('Spool assigned; printer configuration is waiting for insertion.', 'success');
});

it('assigns a direct Spoolman spool without importing it into local inventory', async () => {
  jest.mocked(api.getSpoolmanStatus).mockResolvedValue({ enabled: true } as Awaited<ReturnType<typeof api.getSpoolmanStatus>>);
  const screen = await mount(<AssignSpoolModal visible printerId={7} amsId={128} trayId={0} slotLabel="HT 1" onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Spoolman')).toBeTruthy());
  await fireEvent.press(screen.getByText('Spoolman'));
  await waitFor(() => expect(screen.getByText('#3 · Brand PETG ')).toBeTruthy());
  await fireEvent.press(screen.getByText('#3 · Brand PETG '));
  await act(async () => alert.mock.calls.at(-1)?.[2]?.at(-1)?.onPress?.());
  await waitFor(() => expect(device.assignSpoolman).toHaveBeenCalledWith(7, 128, 0, 3));
  expect(api.assignSpool).not.toHaveBeenCalled();
});

it.each([[254, 0], [255, 1]])('external tray %i keeps bindings in local slot %i and transport global', async (globalTrayId, localTrayId) => {
  jest.mocked(api.getSlotPresets).mockResolvedValue({
    [255 * 4 + localTrayId]: { ams_id: 255, tray_id: localTrayId, preset_id: 'builtin_GFL99', preset_name: 'External profile' },
  });
  jest.mocked(api.getAssignments).mockResolvedValue([{
    printer_id: 7, ams_id: 255, tray_id: localTrayId, spool_id: 3,
    spool: { ...spool, brand: 'External brand', material: 'PLA' },
  } as SpoolAssignment]);
  const screen = await mount(<TrayDetailModal visible printerId={7} tray={{ ...tray, id: globalTrayId }}
    context={{ ...context, amsId: 255, trayId: globalTrayId, isExternal: true }}
    isPrinting={false} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('External profile')).toBeTruthy());
  expect(screen.getByText('External brand • PLA')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Load filament')).toBeEnabled());
  await fireEvent.press(screen.getByText('Load filament'));
  await waitFor(() => expect(device.load).toHaveBeenCalledWith(7, globalTrayId, undefined));
  await fireEvent.press(screen.getByText('Unload filament'));
  await act(async () => alert.mock.calls.at(-1)?.[2]?.at(-1)?.onPress?.());
  await waitFor(() => expect(device.unload).toHaveBeenCalledWith(7, globalTrayId));
  await fireEvent.press(screen.getByText('Unassign inventory spool'));
  await waitFor(() => expect(api.unassignSpool).toHaveBeenCalledWith(7, 255, localTrayId));
});
