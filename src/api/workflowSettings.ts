import { request } from './http';
import type {
  ArchiveRetentionSettings,
  WorkflowObicoStatus,
  WorkflowPrinterAiStatus,
  WorkflowObicoTestResult,
} from '@/types/api';

export const workflowSettingsApi = {
  getArchiveRetention: () =>
    request<ArchiveRetentionSettings>('/archives/purge/settings'),
  saveArchiveRetention: (settings: ArchiveRetentionSettings) =>
    request<ArchiveRetentionSettings>('/archives/purge/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getDetectionStatus: () => request<WorkflowObicoStatus>('/obico/status'),
  getPrinterAiStatus: () =>
    request<WorkflowPrinterAiStatus>('/obico/printer-status'),
  testDetection: (url: string, token: string) =>
    request<WorkflowObicoTestResult>('/obico/test-connection', {
      method: 'POST',
      body: JSON.stringify({ url, token }),
    }),
};
