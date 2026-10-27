import { printerControlsApi as device } from '@/api/printerControls';
import { request, requestBlob } from '@/api/http';

jest.mock('@/api/http', () => ({ request: jest.fn(), requestBlob: jest.fn() }));
const mockRequest = jest.mocked(request);

beforeEach(() => jest.clearAllMocks());

it('sends zero heater targets and independently addresses the right and left hotends as query parameters', async () => {
  await device.heater(7, 'nozzle', 0, 1);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/temperature/nozzle?target=0&nozzle=1', { method: 'POST' });
  await device.heater(7, 'nozzle', 225, 0);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/temperature/nozzle?target=225&nozzle=0', { method: 'POST' });
});

it('does not send an extruder for ordinary feed paths, but includes an explicit FTS direction', async () => {
  await device.load(7, 5);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/ams/load?tray_id=5', { method: 'POST' });
  await device.load(7, 5, 1);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/ams/load?tray_id=5&extruder_id=1', { method: 'POST' });
  await device.unload(7, 255);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/ams/unload?tray_id=255', { method: 'POST' });
  await device.unload(7);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/ams/unload?', { method: 'POST' });
});

it('sends all physical slot settings and saves the returned filament identity in the preset mapping', async () => {
  const configuration = {
    tray_info_idx: '', tray_type: 'PETG', tray_sub_brands: 'Orca custom', tray_color: '112233FF',
    nozzle_temp_min: 220, nozzle_temp_max: 260, cali_idx: 17, nozzle_diameter: '0.6',
    setting_id: '', orca_profile_id: 'orca-uuid', k_value: 0.035,
    kprofile_filament_id: 'PG00001', kprofile_setting_id: 'PFUS-full-id',
  };
  await device.configure(7, 128, 0, configuration);
  const endpoint = mockRequest.mock.calls[0][0];
  const parsed = new URL(endpoint, 'https://example.test');
  expect(parsed.pathname).toBe('/printers/7/slots/128/0/configure');
  for (const [key, value] of Object.entries(configuration)) expect(parsed.searchParams.get(key)).toBe(String(value));
  await device.saveMapping(7, 128, 0, 'orca-uuid', 'Orca custom', 'orca_cloud', 'PG00001');
  expect(mockRequest.mock.calls[1][0]).toContain('tray_info_idx=PG00001');
  expect(mockRequest.mock.calls[1][0]).toContain('preset_source=orca_cloud');
});

it('preserves explicit drying unit, timezone, rotation and waiting queue payloads', async () => {
  const run = { printer_id: 7, ams_id: 129, temp: 80, duration_hours: 12, filament: 'PA-CF',
    rotate_tray: false, start_after: '2027-01-02T03:04:00.000Z' };
  await device.schedule(run);
  expect(mockRequest).toHaveBeenLastCalledWith('/scheduled-dryings', { method: 'POST', body: JSON.stringify(run) });
  await device.cancelScheduled(3);
  expect(mockRequest).toHaveBeenLastCalledWith('/scheduled-dryings/3', { method: 'DELETE' });
});

it('uses direct Spoolman slot assignments and printer-scoped SD paths rather than Library', async () => {
  await device.assignSpoolman(7, 128, 0, 45);
  expect(mockRequest).toHaveBeenLastCalledWith('/spoolman/inventory/slot-assignments', {
    method: 'POST', body: JSON.stringify({ printer_id: 7, ams_id: 128, tray_id: 0, spoolman_spool_id: 45 }),
  });

  await device.files(7, '/models/a & b');
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/files?path=%2Fmodels%2Fa+%26+b');
  await device.download(7, '/models/a & b.3mf');
  expect(requestBlob).toHaveBeenCalledWith('/printers/7/files/download?path=%2Fmodels%2Fa+%26+b.3mf');
});

it('loads printer-bound HA readings independently of power and uses the backend action filter', async () => {
  await device.haReadings(7);
  expect(mockRequest).toHaveBeenLastCalledWith('/ha-sensors/by-printer/7/readings');
  await device.haActions(7);
  expect(mockRequest).toHaveBeenLastCalledWith('/smart-plugs/by-printer/7/scripts');
});
