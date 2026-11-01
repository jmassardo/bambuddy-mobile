import { printerFleetApi } from '@/api/printerFleet';
import { printersApi } from '@/api/printers';
import { request } from '@/api/http';

jest.mock('@/api/http', () => ({
  request: jest.fn(),
  requestWithFallback: jest.fn(),
  buildMediaUrl: jest.fn(),
}));

it('sends explicit archive retention and deletion choices', async () => {
  await printersApi.deletePrinter(7, false);
  expect(request).toHaveBeenLastCalledWith(
    '/printers/7?delete_archives=false',
    { method: 'DELETE' },
  );
  await printersApi.deletePrinter(7, true);
  expect(request).toHaveBeenLastCalledWith('/printers/7?delete_archives=true', {
    method: 'DELETE',
  });
});

it('uses device reconnect/republish and version-specific SD firmware endpoints', async () => {
  await printersApi.connectPrinter(7);
  expect(request).toHaveBeenLastCalledWith('/printers/7/connect', {
    method: 'POST',
  });
  await printersApi.refreshPrinterStatus(7);
  expect(request).toHaveBeenLastCalledWith('/printers/7/refresh-status', {
    method: 'POST',
  });
  await printerFleetApi.prepareFirmware(7, '01.02 beta');
  expect(request).toHaveBeenLastCalledWith(
    '/firmware/updates/7/prepare?version=01.02%20beta',
  );
  await printerFleetApi.uploadFirmware(7, '01.02 beta');
  expect(request).toHaveBeenLastCalledWith(
    '/firmware/updates/7/upload?version=01.02%20beta',
    { method: 'POST' },
  );
  await printerFleetApi.firmwareStatus(7);
  expect(request).toHaveBeenLastCalledWith('/firmware/updates/7/upload/status');
});
