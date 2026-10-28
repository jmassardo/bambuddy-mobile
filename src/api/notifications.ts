import { request } from './http';
import type {
  EventVariablesResponse, NotificationTestRequest, NotificationTestResponse,
  TemplatePreviewRequest, TemplatePreviewResponse, NotificationTestAllResponse,
} from '@/types/api';

export const notificationsApi = {
  testDraft: (data: NotificationTestRequest) =>
    request<NotificationTestResponse>('/notifications/test-config', { method: 'POST', body: JSON.stringify(data) }),
  testAll: () => request<NotificationTestAllResponse>('/notifications/test-all', { method: 'POST' }),
  variables: () => request<EventVariablesResponse[]>('/notification-templates/variables'),
  preview: (data: TemplatePreviewRequest) =>
    request<TemplatePreviewResponse>('/notification-templates/preview', { method: 'POST', body: JSON.stringify(data) }),
};
