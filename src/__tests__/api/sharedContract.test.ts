import { settingsApi } from '@/api/settings';
import { systemApi } from '@/api/system';
import { request } from '@/api/http';

jest.mock('@/api/http', () => ({
  request: jest.fn(),
  requestBlob: jest.fn(),
  requestWithFallback: jest.fn(),
}));

const mockRequest = jest.mocked(request);

describe('shared parity API contract', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it.each([
    {
      name: 'getExternalCameras',
      call: () => settingsApi.getExternalCameras(),
      path: '/settings/cameras',
      options: undefined,
    },
    {
      name: 'createExternalCamera',
      call: () =>
        settingsApi.createExternalCamera({
          name: 'Enclosure',
          stream_url: 'https://camera.test/stream',
          camera_type: 'mjpeg',
          printer_id: 7,
        }),
      path: '/settings/cameras',
      options: {
        method: 'POST',
        body: JSON.stringify({
          name: 'Enclosure',
          stream_url: 'https://camera.test/stream',
          camera_type: 'mjpeg',
          printer_id: 7,
        }),
      },
    },
    {
      name: 'updateExternalCamera',
      call: () => settingsApi.updateExternalCamera(4, { name: 'Updated camera' }),
      path: '/settings/cameras/4',
      options: {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated camera' }),
      },
    },
    {
      name: 'deleteExternalCamera',
      call: () => settingsApi.deleteExternalCamera(4),
      path: '/settings/cameras/4',
      options: { method: 'DELETE' },
    },
    {
      name: 'testExternalCamera',
      call: () => settingsApi.testExternalCamera(4),
      path: '/settings/cameras/4/test',
      options: { method: 'POST' },
    },
    {
      name: 'createSpoolBuddyDevice',
      call: () =>
        systemApi.createSpoolBuddyDevice({
          device_id: 'spoolbuddy-1',
          hostname: 'spoolbuddy.local',
        }),
      path: '/spoolbuddy/devices',
      options: {
        method: 'POST',
        body: JSON.stringify({
          device_id: 'spoolbuddy-1',
          hostname: 'spoolbuddy.local',
        }),
      },
    },
    {
      name: 'updateSpoolBuddyDevice',
      call: () =>
        systemApi.updateSpoolBuddyDevice('spoolbuddy-1', {
          display_brightness: 80,
        }),
      path: '/spoolbuddy/devices/spoolbuddy-1',
      options: {
        method: 'PUT',
        body: JSON.stringify({ display_brightness: 80 }),
      },
    },
    {
      name: 'deleteSpoolBuddyDevice',
      call: () => systemApi.deleteSpoolBuddyDevice('spoolbuddy-1'),
      path: '/spoolbuddy/devices/spoolbuddy-1',
      options: { method: 'DELETE' },
    },
  ])('uses the recovered request contract for $name', async ({ call, path, options }) => {
    mockRequest.mockResolvedValue(undefined);

    await call();

    if (options === undefined) {
      expect(mockRequest).toHaveBeenCalledWith(path);
    } else {
      expect(mockRequest).toHaveBeenCalledWith(path, options);
    }
  });
});
