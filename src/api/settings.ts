import type {
  ApiEntity,
  AppSettings,
  ExternalLink,
  NotificationProvider,
  NotificationTemplate,
  NotificationTestRequest,
  NotificationTestResponse,
} from '@/types/api';
import { request, requestWithFallback } from './http';

export const settingsApi = {
  getSettings: async () => request<ApiEntity<AppSettings>>('/settings/'),

  updateSettings: async (data: Record<string, unknown>) =>
    request<ApiEntity<AppSettings>>('/settings/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getNotificationProviders: async () =>
    request<Array<ApiEntity<NotificationProvider>>>('/notifications/'),

  createNotificationProvider: async (data: Record<string, unknown>) =>
    request<ApiEntity<NotificationProvider>>('/notifications/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateNotificationProvider: async (id: number, data: Record<string, unknown>) =>
    request<ApiEntity<NotificationProvider>>(`/notifications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteNotificationProvider: async (id: number) =>
    request<void>(`/notifications/${id}`, { method: 'DELETE' }),

  testNotificationProvider: async (id: number) =>
    request<NotificationTestResponse>(`/notifications/${id}/test`, { method: 'POST' }),

  testNotificationConfig: async (data: NotificationTestRequest) =>
    request<NotificationTestResponse>('/notifications/test-config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getNotificationLog: async (params?: {
    limit?: number;
    offset?: number;
    provider_id?: number;
    event_type?: string;
    success?: boolean;
    days?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.provider_id) searchParams.set('provider_id', String(params.provider_id));
    if (params?.event_type) searchParams.set('event_type', params.event_type);
    if (params?.success !== undefined) searchParams.set('success', String(params.success));
    if (params?.days) searchParams.set('days', String(params.days));
    return requestWithFallback<Record<string, unknown>[]>(
      { endpoint: `/notifications/logs?${searchParams}` },
      { endpoint: `/notifications/log?${searchParams}` },
    );
  },

  getNotificationLogStats: async (days = 7) =>
    request<Record<string, unknown>>(`/notifications/logs/stats?days=${days}`),

  clearNotificationLogs: async (olderThanDays = 30) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/notifications/logs?older_than_days=${olderThanDays}`,
        options: { method: 'DELETE' },
      },
      {
        endpoint: `/notifications/log?older_than_days=${olderThanDays}`,
        options: { method: 'DELETE' },
      },
    ),

  registerPushToken: async (data: {
    token: string;
    platform: 'ios' | 'android';
    device_name?: string;
  }) =>
    request<void>('/notifications/push/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  unregisterPushToken: async (token: string) =>
    request<void>('/notifications/push/unregister', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  getExternalLinks: async () =>
    request<Array<ApiEntity<ExternalLink>>>('/external-links/'),

  createExternalLink: async (data: Record<string, unknown>) =>
    request<ApiEntity<ExternalLink>>('/external-links/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateExternalLink: async (id: number, data: Record<string, unknown>) =>
    request<ApiEntity<ExternalLink>>(`/external-links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteExternalLink: async (id: number) =>
    request<void>(`/external-links/${id}`, { method: 'DELETE' }),

  reorderExternalLinks: async (ids: number[]) =>
    request<Array<ApiEntity<ExternalLink>>>('/external-links/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),

  getNotificationTemplates: async () =>
    requestWithFallback<Array<ApiEntity<NotificationTemplate>>>(
      { endpoint: '/notification-templates' },
      { endpoint: '/notifications/templates' },
    ),

  updateNotificationTemplate: async (id: string, data: Record<string, unknown>) =>
    requestWithFallback<ApiEntity<NotificationTemplate>>(
      {
        endpoint: `/notification-templates/${id}`,
        options: {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      },
      {
        endpoint: `/notifications/templates/${id}`,
        options: {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      },
    ),

  resetNotificationTemplate: async (id: string) =>
    requestWithFallback<ApiEntity<NotificationTemplate>>(
      {
        endpoint: `/notification-templates/${id}/reset`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/notifications/templates/${id}/reset`,
        options: { method: 'POST' },
      },
    ),

  getLabelTemplates: async () =>
    request<Record<string, unknown>[]>('/labels/templates'),

  renderLabel: async (templateId: string, data: Record<string, unknown>) =>
    request<{ image_url: string }>('/labels/render', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, ...data }),
    }),
};
