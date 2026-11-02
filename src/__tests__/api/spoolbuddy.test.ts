import { spoolbuddyApi } from '@/api/spoolbuddy';
import { request } from '@/api/http';

jest.mock('@/api/http', () => ({
  request: jest.fn().mockResolvedValue({ status: 'ok' }),
}));
const mockRequest = jest.mocked(request);
beforeEach(() => {
  mockRequest.mockClear();
});

it('uses actual remote job and calibration contracts with encoded device IDs', async () => {
  await spoolbuddyApi.write('reader/a', 12);
  expect(mockRequest).toHaveBeenLastCalledWith('/spoolbuddy/nfc/write-tag', {
    method: 'POST',
    body: JSON.stringify({ device_id: 'reader/a', spool_id: 12 }),
  });
  await spoolbuddyApi.cancelWrite('reader/a');
  expect(mockRequest).toHaveBeenLastCalledWith(
    '/spoolbuddy/devices/reader%2Fa/cancel-write',
    { method: 'POST', body: '{}' },
  );
  await spoolbuddyApi.calibrate('reader/a', 500, 1100, 100);
  expect(mockRequest).toHaveBeenLastCalledWith(
    '/spoolbuddy/devices/reader%2Fa/calibration/set-factor',
    {
      method: 'POST',
      body: JSON.stringify({
        known_weight_grams: 500,
        raw_adc: 1100,
        tare_raw_adc: 100,
      }),
    },
  );
});

it('runs each remote diagnostic, checks updates and uses the same update endpoint for forced reinstalls', async () => {
  await spoolbuddyApi.diagnose('a', 'read_tag');
  expect(mockRequest).toHaveBeenLastCalledWith(
    '/spoolbuddy/diagnostics/a/run?diagnostic=read_tag',
    { method: 'POST', body: '{}' },
  );
  await spoolbuddyApi.diagnosticResult('a', 'nfc');
  expect(mockRequest).toHaveBeenLastCalledWith(
    '/spoolbuddy/diagnostics/a/result?diagnostic=nfc',
  );
  await spoolbuddyApi.update('a');
  expect(mockRequest).toHaveBeenLastCalledWith('/spoolbuddy/devices/a/update', {
    method: 'POST',
    body: '{}',
  });
});

it('uses conflict-checked tag linking rather than generic spool PATCH for local and Spoolman inventory', async () => {
  await spoolbuddyApi.link(false, 1, {
    tag_uid: 'ABCD',
    data_origin: 'spoolbuddy',
  });
  expect(mockRequest).toHaveBeenLastCalledWith('/inventory/spools/1/link-tag', {
    method: 'PATCH',
    body: '{"tag_uid":"ABCD","data_origin":"spoolbuddy"}',
  });
  await spoolbuddyApi.link(true, 1, { tag_uid: '04010203040506' });
  expect(mockRequest).toHaveBeenLastCalledWith(
    '/spoolman/inventory/spools/1/tag',
    { method: 'PATCH', body: '{"tag_uid":"04010203040506"}' },
  );
  await spoolbuddyApi.untag(true, 1);
  expect(mockRequest).toHaveBeenLastCalledWith('/spoolman/inventory/spools/1', {
    method: 'PATCH',
    body: '{"tag_uid":null,"tray_uuid":null}',
  });
});
