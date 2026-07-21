import type {
  DebugLoggingState,
  InventorySpool,
  LinkedSpoolsMap,
  ObicoStatus,
  SpoolBuddyDevice,
  SpoolmanStatus,
  StorageUsageResponse,
  SystemHealthResult,
  SystemInfo,
  UnlinkedSpool,
} from '@/types/api';
import { request, requestBlob, requestWithFallback } from './http';

export const systemApi = {
  getSystemInfo: async () => request<SystemInfo>('/system/info'),

  getSystemHealth: async () => request<SystemHealthResult>('/system/health'),

  getStorageUsage: async (options?: { refresh?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.refresh) params.set('refresh', 'true');
    const query = params.toString() ? `?${params}` : '';
    return requestWithFallback<Record<string, unknown>>(
      { endpoint: `/system/storage${query}` },
      { endpoint: `/system/storage-usage${query}` },
    );
  },

  getUpdateInfo: async () => request<Record<string, unknown>>('/updates/check'),

  getFirmwareVersions: async (model: string) =>
    request<Record<string, unknown>[]>(
      `/firmware/versions?model=${encodeURIComponent(model)}`,
    ),

  getApplicationLogs: async (params?: { level?: string; lines?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.level) searchParams.set('level', params.level);
    if (params?.lines) searchParams.set('lines', String(params.lines));
    const query = searchParams.toString();
    return requestWithFallback<Record<string, unknown>>(
      { endpoint: `/system/logs?${query}` },
      { endpoint: `/support/logs?${query.replace('lines=', 'limit=')}` },
    );
  },

  getDebugLoggingState: async () =>
    requestWithFallback<DebugLoggingState>(
      { endpoint: '/system/debug-logging' },
      { endpoint: '/support/debug-logging' },
    ),

  setDebugLogging: async (enabled: boolean) =>
    requestWithFallback<DebugLoggingState>(
      {
        endpoint: '/system/debug-logging',
        options: {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        },
      },
      {
        endpoint: '/support/debug-logging',
        options: {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        },
      },
    ),

  downloadSupportBundle: async () => requestBlob('/support/bundle'),

  getSupportLogs: async (params?: { limit?: number; level?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.level) searchParams.set('level', params.level);
    if (params?.search) searchParams.set('search', params.search);
    return request<Record<string, unknown>>(
      `/support/logs${searchParams.toString() ? `?${searchParams}` : ''}`,
    );
  },

  clearSupportLogs: async () => request<void>('/support/logs', { method: 'DELETE' }),

  submitBugReport: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/bug-report/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  startBugReportLogging: async () =>
    request<Record<string, unknown>>('/bug-report/start-logging', {
      method: 'POST',
    }),

  stopBugReportLogging: async (wasDebug: boolean) =>
    request<Record<string, unknown>>(`/bug-report/stop-logging?was_debug=${wasDebug}`, {
      method: 'POST',
    }),

  getFilamentPresets: async () =>
    request<Record<string, unknown>[]>('/cloud/filaments'),

  getAmsHistory: async (printerId: number, amsId?: number, hours = 24) =>
    request<Record<string, unknown>[]>(
      `/ams-history/${printerId}${amsId != null ? `/${amsId}` : ''}?hours=${hours}`,
    ),

  getSpoolmanStatus: async () => request<SpoolmanStatus>('/spoolman/status'),

  connectSpoolman: async () =>
    request<Record<string, unknown>>('/spoolman/connect', { method: 'POST' }),

  disconnectSpoolman: async () =>
    request<Record<string, unknown>>('/spoolman/disconnect', { method: 'POST' }),

  getSpoolmanSpools: async () =>
    request<Record<string, unknown>[]>('/spoolman/spools'),

  getUnlinkedSpools: async () => request<UnlinkedSpool[]>('/spoolman/spools/unlinked'),

  getLinkedSpools: async () => request<LinkedSpoolsMap>('/spoolman/spools/linked'),

  assignSpoolmanSlot: async (data: {
    spoolman_spool_id: number;
    printer_id: number;
    ams_id: number;
    tray_id: number;
  }) =>
    request<InventorySpool>('/spoolman/inventory/slot-assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  unassignSpoolmanSlot: async (spoolmanSpoolId: number) =>
    request<InventorySpool>(
      `/spoolman/inventory/slot-assignments/${spoolmanSpoolId}`,
      { method: 'DELETE' },
    ),

  getSpoolmanSlotAssignment: async (
    printerId: number,
    amsId: number,
    trayId: number,
  ) =>
    request<InventorySpool | null>(
      `/spoolman/inventory/slot-assignments?printer_id=${printerId}&ams_id=${amsId}&tray_id=${trayId}`,
    ),

  getSpoolmanSlotAssignments: async (printerId?: number) =>
    request<
      Array<{
        printer_id: number;
        printer_name: string | null;
        ams_id: number;
        tray_id: number;
        spoolman_spool_id: number;
        ams_label: string | null;
      }>
    >(
      printerId !== undefined
        ? `/spoolman/inventory/slot-assignments/all?printer_id=${printerId}`
        : '/spoolman/inventory/slot-assignments/all',
    ),

  linkSpool: async (
    spoolId: number,
    context: {
      spoolTag: string;
      printerId: number;
      amsId: number;
      trayId: number;
    },
  ) =>
    request<void>(`/spoolman/spools/${spoolId}/link`, {
      method: 'POST',
      body: JSON.stringify({
        spool_tag: context.spoolTag,
        printer_id: context.printerId,
        ams_id: context.amsId,
        tray_id: context.trayId,
      }),
    }),

  unlinkSpool: async (spoolId: number) =>
    request<void>(`/spoolman/spools/${spoolId}/unlink`, {
      method: 'POST',
    }),

  getSpoolBuddyDevices: async () =>
    request<Record<string, unknown>[]>('/spoolbuddy/devices'),

  getSpoolBuddyDevice: async (id: string) =>
    request<Record<string, unknown>>(`/spoolbuddy/devices/${id}`),

  writeSpoolBuddyTag: async (deviceId: string, data: Record<string, unknown>) =>
    request<void>('/spoolbuddy/nfc/write-tag', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, ...data }),
    }),

  calibrateSpoolBuddy: async (deviceId: string) =>
    request<void>(`/spoolbuddy/devices/${deviceId}/calibration/tare`, {
      method: 'POST',
    }),

  getObicoStatus: async () => request<ObicoStatus>('/obico/status'),

  testObicoConnection: async (url: string) =>
    request<Record<string, unknown>>('/obico/test-connection', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  updateObicoSettings: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/obico/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
