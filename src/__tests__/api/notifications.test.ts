import { notificationsApi } from '@/api/notifications';
import { settingsApi } from '@/api/settings';
import { request, requestWithFallback } from '@/api/http';

jest.mock('@/api/http', () => ({ request: jest.fn(), requestWithFallback: jest.fn() }));
const mockRequest = jest.mocked(request);

beforeEach(() => jest.clearAllMocks());

it('tests draft credentials and photo policy without creating or updating a provider', async () => {
  mockRequest.mockResolvedValueOnce({ success: false, message: 'Rejected' });
  const draft = { provider_type: 'bark' as const, config: { device_key: 'key' }, attach_photo: false };
  await expect(notificationsApi.testDraft(draft)).resolves.toEqual({ success: false, message: 'Rejected' });
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(mockRequest).toHaveBeenCalledWith('/notifications/test-config', { method: 'POST', body: JSON.stringify(draft) });
});

it('uses actual aggregate-test and template variable/preview endpoints and preserves server errors', async () => {
  mockRequest.mockResolvedValueOnce({ tested: 0, success: 0, failed: 0, results: [] });
  await notificationsApi.testAll();
  expect(mockRequest).toHaveBeenLastCalledWith('/notifications/test-all', { method: 'POST' });
  await notificationsApi.variables();
  expect(mockRequest).toHaveBeenLastCalledWith('/notification-templates/variables');
  const draft = { event_type: 'print_complete', title_template: '{printer}', body_template: 'Complete' };
  mockRequest.mockRejectedValueOnce(new Error('Preview unavailable'));
  await expect(notificationsApi.preview(draft)).rejects.toThrow('Preview unavailable');
  expect(mockRequest).toHaveBeenLastCalledWith('/notification-templates/preview', { method: 'POST', body: JSON.stringify(draft) });
});

it('serializes failures-only, days and log pagination into the server request', async () => {
  await settingsApi.getNotificationLog({ success: false, days: 90, offset: 100, limit: 100 });
  expect(requestWithFallback).toHaveBeenCalledWith(
    { endpoint: '/notifications/logs?limit=100&offset=100&success=false&days=90' },
    { endpoint: '/notifications/log?limit=100&offset=100&success=false&days=90' },
  );
});
