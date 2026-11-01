import {
  inventoryBackend,
  inventoryManagementApi,
} from '@/api/inventoryManagement';
import { request, requestBlob } from '@/api/http';
jest.mock('@/api/http', () => ({ request: jest.fn(), requestBlob: jest.fn() }));
const mockRequest = jest.mocked(request);
const mockBlob = jest.mocked(requestBlob);
beforeEach(() => {
  jest.resetAllMocks();
  mockRequest.mockResolvedValue({});
  mockBlob.mockResolvedValue(new Blob());
});
describe('backend-aware inventory contracts', () => {
  it.each([false, true])(
    'uses the configured backend for create, selective bulk patch and counter reset (%s)',
    async spoolman => {
      const backend = inventoryBackend(spoolman);
      const root = spoolman ? '/spoolman/inventory' : '/inventory';
      await backend.create({ material: 'PLA', core_weight: 0 }, 3);
      expect(mockRequest).toHaveBeenLastCalledWith(
        `${root}/spools/bulk`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            spool: { material: 'PLA', core_weight: 0 },
            quantity: 3,
          }),
        }),
      );
      await backend.bulk('bulk-update', [1, 2], { note: null, location_id: 5 });
      expect(mockRequest).toHaveBeenLastCalledWith(
        `${root}/spools/bulk-update`,
        expect.objectContaining({
          body: JSON.stringify({
            ids: [1, 2],
            update: { note: null, location_id: 5 },
          }),
        }),
      );
      await backend.bulk('reset-consumed-counter-bulk', [1, 2]);
      expect(mockRequest).toHaveBeenLastCalledWith(
        `${root}/spools/reset-consumed-counter-bulk`,
        expect.objectContaining({ body: '{"spool_ids":[1,2]}' }),
      );
    },
  );
  it('uses scale reconciliation endpoints rather than merely changing used weight', async () => {
    await inventoryBackend(false).reconcile(3, 500);
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/spoolbuddy/scale/update-spool-weight',
      expect.objectContaining({
        method: 'POST',
        body: '{"spool_id":3,"weight_grams":500}',
      }),
    );
    await inventoryBackend(true).reconcile(3, 500);
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/spoolman/inventory/spools/3/weight',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"weight_grams":500}',
      }),
    );
  });
  it('sends authenticated native preview/output options as JSON to the matching backend', async () => {
    const options = {
      spool_ids: [3],
      template: 'avery_l7160',
      fields: ['brand', 'qr'],
      monochrome: true,
      starting_position: 5,
      format: 'png' as const,
      dpi: 600 as const,
    };
    await inventoryBackend(true).labels(options);
    expect(mockBlob).toHaveBeenLastCalledWith(
      '/spoolman/labels',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }),
    );
    await inventoryBackend(false).preview({ ...options, spool_id: 3 });
    expect(mockBlob).toHaveBeenLastCalledWith(
      '/inventory/labels/preview',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  it('fetches presets independently and preserves valid local/cloud/Orca/built-in identifiers without slicer-sidecar dependency', async () => {
    mockRequest.mockImplementation(async path => {
      if (path === '/cloud/settings') throw new Error('No cloud login');
      if (path === '/local-presets/')
        return { filament: [{ id: 12, name: 'Local PLA' }] };
      if (path === '/orca-cloud/profiles')
        return { filament: [{ setting_id: 'orca-ID', name: 'Orca PLA' }] };
      return [{ filament_id: 'GFL00', name: 'Bambu PLA Basic' }];
    });
    const result = await inventoryManagementApi.presets();
    expect(result.unavailable).toEqual(['cloud']);
    expect(result.rows.map(row => row.id)).toEqual(['12', 'orca-ID', 'GFL00']);
  });
  it('uses the server status-only shopping route and replace-all association contracts', async () => {
    await inventoryManagementApi.shoppingStatus(3, 'received');
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/inventory/shopping-list/3/status',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"status":"received"}',
      }),
    );
    await inventoryBackend(true).saveAssociations(3, 'filament-presets', []);
    expect(mockRequest).toHaveBeenLastCalledWith(
      '/spoolman/inventory/spools/3/filament-presets',
      expect.objectContaining({ method: 'PUT', body: '[]' }),
    );
  });
});
