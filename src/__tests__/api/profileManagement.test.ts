import { profileManagementApi } from '@/api/profileManagement';
import { maintenanceApi } from '@/api/maintenance';
import { request, uploadFile } from '@/api/http';

jest.mock('@/api/http', () => ({ request: jest.fn(), uploadFile: jest.fn() }));
const mockRequest = jest.mocked(request);
describe('current profile/maintenance contracts', () => {
  beforeEach(() => jest.clearAllMocks());
  it('uses device authorization without sending credentials', async () => {
    await profileManagementApi.orcaStart();
    await profileManagementApi.orcaPoll();
    expect(mockRequest.mock.calls).toEqual([
      ['/orca-cloud/device/start', { method: 'POST' }],
      ['/orca-cloud/device/poll', { method: 'POST' }],
    ]);
  });
  it('preserves delta settings and encodes cloud IDs for update/delete', async () => {
    const payload = {
      name: 'Updated',
      setting: { unknown: { retain: true }, enabled: null },
    };
    await profileManagementApi.update('a/b', payload);
    expect(mockRequest).toHaveBeenLastCalledWith('/cloud/settings/a%2Fb', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    await profileManagementApi.remove('a/b');
    expect(mockRequest).toHaveBeenLastCalledWith('/cloud/settings/a%2Fb', {
      method: 'DELETE',
    });
  });
  it('uses printer-scoped K operations and sends complete delete identity in body', async () => {
    const identity = {
      slot_id: 4,
      extruder_id: 1,
      nozzle_id: 'HH00-0.6',
      nozzle_diameter: '0.6',
      filament_id: 'GFA00',
      setting_id: 'key',
    };
    await profileManagementApi.kList(12, '0.6');
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/printers/12/kprofiles/?nozzle_diameter=0.6',
    );
    await profileManagementApi.kRemove(12, identity);
    expect(mockRequest).toHaveBeenLastCalledWith('/printers/12/kprofiles/', {
      method: 'DELETE',
      body: JSON.stringify(identity),
    });
    await profileManagementApi.kBatch(12, []);
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/printers/12/kprofiles/batch',
      { method: 'POST', body: '[]' },
    );
  });
  it('uploads local bundles as files and resets both interval overrides explicitly', async () => {
    const file = {
      uri: 'file:///preset.zip',
      name: 'preset.zip',
      type: 'application/zip',
    };
    await profileManagementApi.localImport(file);
    expect(uploadFile).toHaveBeenCalledWith('/local-presets/import', file);
    await maintenanceApi.updateMaintenanceItem(9, {
      custom_interval_hours: null,
      custom_interval_type: null,
    });
    expect(mockRequest).toHaveBeenLastCalledWith('/maintenance/items/9', {
      method: 'PATCH',
      body: '{"custom_interval_hours":null,"custom_interval_type":null}',
    });
    await maintenanceApi.setPrinterHours(2, 0);
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/maintenance/printers/2/hours?total_hours=0',
      { method: 'PATCH' },
    );
    await maintenanceApi.restoreDefaultMaintenanceTypes();
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/maintenance/types/restore-defaults',
      { method: 'POST' },
    );
  });
});
