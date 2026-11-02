import { camerasApi } from '@/api/cameras';
import { printersApi } from '@/api/printers';
import { request, setStreamToken, setAuthToken } from '@/api/http';
import { useServerStore } from '@/api/server';
import { cameraIntegrationUrl, overlayUrl, validExternalCameraUrl, validPlateRoi } from '@/utils/cameraIntegrations';

jest.mock('@/api/http', () => {
  const actual = jest.requireActual('@/api/http');
  return { ...actual, request: jest.fn() };
});

const mockRequest = jest.mocked(request);

beforeEach(() => {
  mockRequest.mockReset();
  useServerStore.setState({ serverUrl: 'https://farm.example', loading: false });
  setStreamToken('scoped-media');
});

afterEach(() => {
  setStreamToken(null);
  useServerStore.setState({ serverUrl: null });
});

it('uses actual camera plate routes and omits use_external to let the server choose the configured camera', async () => {
  await camerasApi.checkPlate(7);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/camera/check-plate?include_debug_image=true');
  await camerasApi.calibrate(7, 'Textured & clean');
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/camera/plate-detection/calibrate?label=Textured%20%26%20clean', { method: 'POST' });
  await camerasApi.renameReference(7, 2, 'PEI / second');
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/camera/plate-detection/references/2?label=PEI%20%2F%20second', { method: 'PUT' });
  await camerasApi.deleteReference(7, 2);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/camera/plate-detection/references/2', { method: 'DELETE' });
});

it('keeps the existing printer API facade on supported plate routes and query semantics', async () => {
  await printersApi.getPlateDetectionStatus(7);
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/camera/plate-detection/status');
  await printersApi.calibratePlateDetection(7, { label: 'PEI', useExternal: false });
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/7/camera/plate-detection/calibrate?label=PEI&use_external=false', { method: 'POST' });
});

it('tests unsaved stream and snapshot values with the printer-scoped endpoint', async () => {
  await camerasApi.testExternal(9, '/dev/video0', 'usb');
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/9/camera/external/test?url=%2Fdev%2Fvideo0&camera_type=usb', { method: 'POST' });
  await camerasApi.testExternal(9, 'https://camera/snapshot?key=a&b=c', 'snapshot');
  expect(mockRequest).toHaveBeenLastCalledWith('/printers/9/camera/external/test?url=https%3A%2F%2Fcamera%2Fsnapshot%3Fkey%3Da%26b%3Dc&camera_type=snapshot', { method: 'POST' });
});

it.each(['camera_stream', 'camwall', 'overlay'] as const)('creates the explicitly selected %s scope', async scope => {
  await camerasApi.createToken('Display', 30, scope);
  expect(mockRequest).toHaveBeenLastCalledWith('/auth/tokens', {
    method: 'POST', body: JSON.stringify({ name: 'Display', expires_in_days: 30, scope }),
  });
  const link = new URL(cameraIntegrationUrl('https://farm.example', scope, 'one/time&secret', 9));
  expect(link.searchParams.get('token')).toBe('one/time&secret');
  expect(link.pathname).toBe(scope === 'camwall' ? '/camwall' : scope === 'overlay' ? '/overlay/9' : '/api/v1/printers/9/camera/stream');
});

it('separates personal/admin token review and sends actual revoke requests', async () => {
  await camerasApi.tokens();
  expect(mockRequest).toHaveBeenLastCalledWith('/auth/tokens');
  await camerasApi.tokens(true);
  expect(mockRequest).toHaveBeenLastCalledWith('/auth/tokens/all');
  await camerasApi.revokeToken(12);
  expect(mockRequest).toHaveBeenLastCalledWith('/auth/tokens/12', { method: 'DELETE' });
});

it('never sends login credentials in image URLs and drops scoped access after logout/server changes', async () => {
  expect(camerasApi.referenceImage(7, 0, 'camera-only')).toContain('token=camera-only');
  expect(camerasApi.snapshot(7, 42, 'camera-only')).toBe('https://farm.example/api/v1/printers/7/camera/snapshot?t=42&token=camera-only');
  expect(camerasApi.snapshot(7, 42)).not.toContain('scoped-media');
  expect(printersApi.getCameraStreamUrl(7, 'camera-only')).toContain('token=camera-only');
  useServerStore.setState({ serverUrl: 'https://other.example' });
  expect(camerasApi.snapshot(7, 43)).not.toContain('scoped-media');
  setStreamToken('other-media');
  await setAuthToken(null);
  expect(camerasApi.referenceImage(7, 0)).not.toContain('token=');
});

it('encodes all overlay options including an intentionally empty field set', () => {
  const url = new URL(overlayUrl('https://farm.example', {
    printerId: 7, fields: [], artwork: '2', camera: false, fps: 30, size: 'large', token: ' overlay&secret ',
  }));
  expect(url.pathname).toBe('/overlay/7');
  expect(Object.fromEntries(url.searchParams)).toEqual({ show: '', size: 'large', artwork: '2', fps: '30', camera: 'false', token: 'overlay&secret' });
});

it('rejects invalid bounded ROIs and accepts edge-aligned areas', () => {
  expect(validPlateRoi({ x: 0, y: 0.1, w: 1, h: 0.9 })).toBe(true);
  expect(validPlateRoi({ x: 0.9, y: 0, w: 0.2, h: 1 })).toBe(false);
  expect(validPlateRoi({ x: 0, y: 0, w: 0, h: 1 })).toBe(false);
  expect(validPlateRoi({ x: NaN, y: 0, w: 1, h: 1 })).toBe(false);
  expect(validExternalCameraUrl('/dev/video0', 'usb')).toBe(true);
  expect(validExternalCameraUrl('file:///etc/passwd', 'snapshot')).toBe(false);
  expect(validExternalCameraUrl('rtsp://camera/live', 'rtsp')).toBe(true);
});
