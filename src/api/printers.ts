import type {
  CalibrationResult,
  CameraDiagnoseResult,
  DiscoveredPrinter,
  DiscoveryInfo,
  DiscoveryStatus,
  PlateDetectionStatus,
  Printer,
  PrinterDiagnosticResult,
  PrinterSensorHistoryResponse,
  PrinterStatus,
  SlotPresetMapping,
  SubnetScanStatus,
  VirtualPrinterConfig,
  VirtualPrinterListResponse,
} from '@/types/api';
import { buildMediaUrl, request, requestWithFallback } from './http';

export const printersApi = {
  getPrinters: async () => request<Record<string, unknown>[]>('/printers/'),

  getPrinter: async (id: number) => request<Printer>(`/printers/${id}`),

  createPrinter: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/printers/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePrinter: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/printers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deletePrinter: async (id: number) => request<void>(`/printers/${id}`, { method: 'DELETE' }),

  getPrinterStatus: async (id: number) =>
    request<PrinterStatus>(`/printers/${id}/status`),

  refreshPrinterStatus: async (id: number) =>
    request<Record<string, unknown>>(`/printers/${id}/refresh-status`, {
      method: 'POST',
    }),

  connectPrinter: async (id: number) =>
    request<void>(`/printers/${id}/connect`, { method: 'POST' }),

  disconnectPrinter: async (id: number) =>
    request<void>(`/printers/${id}/disconnect`, { method: 'POST' }),

  stopPrint: async (printerId: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/print/stop`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/stop`,
        options: { method: 'POST' },
      },
    ),

  pausePrint: async (printerId: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/print/pause`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/pause`,
        options: { method: 'POST' },
      },
    ),

  resumePrint: async (printerId: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/print/resume`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/resume`,
        options: { method: 'POST' },
      },
    ),

  clearPlate: async (printerId: number) =>
    request<void>(`/printers/${printerId}/clear-plate`, { method: 'POST' }),

  getPlateDetectionStatus: async (printerId: number) =>
    request<PlateDetectionStatus>(
      `/printers/${printerId}/plate-detection/status`,
    ),

  calibratePlateDetection: async (
    printerId: number,
    data?: Record<string, unknown>,
  ) =>
    request<CalibrationResult>(
      `/printers/${printerId}/plate-detection/calibrate`,
      {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      },
    ),

  setPrintSpeed: async (printerId: number, mode: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/print-speed?mode=${mode}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/speed`,
        options: {
          method: 'POST',
          body: JSON.stringify({ mode }),
        },
      },
    ),

  setNozzleTemperature: async (
    printerId: number,
    target: number,
    nozzle: number = 0,
  ) =>
    request<void>(`/printers/${printerId}/temperature/nozzle`, {
      method: 'POST',
      body: JSON.stringify({ target, nozzle }),
    }),

  setBedTemperature: async (printerId: number, target: number) =>
    request<void>(`/printers/${printerId}/temperature/bed`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),

  setChamberTemperature: async (printerId: number, target: number) =>
    request<void>(`/printers/${printerId}/temperature/chamber`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),

  setFanSpeed: async (
    printerId: number,
    fan: 'part' | 'aux' | 'chamber',
    speed: number,
  ) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/fan-speed?fan=${fan}&speed=${speed}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/fan`,
        options: {
          method: 'POST',
          body: JSON.stringify({ fan, speed }),
        },
      },
    ),

  setChamberLight: async (printerId: number, on: boolean) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/chamber-light?on=${on}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/light`,
        options: {
          method: 'POST',
          body: JSON.stringify({ on }),
        },
      },
    ),

  setAirductMode: async (printerId: number, mode: 'cooling' | 'heating') =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/airduct-mode?mode=${mode}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/airduct`,
        options: {
          method: 'POST',
          body: JSON.stringify({ mode }),
        },
      },
    ),

  bedJog: async (printerId: number, distance: number, force = false) =>
    request<void>(
      `/printers/${printerId}/bed-jog?distance=${distance}&force=${force}`,
      { method: 'POST' },
    ),

  xyJog: async (printerId: number, x: number, y: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/xy-jog?x=${x}&y=${y}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/jog/xy`,
        options: {
          method: 'POST',
          body: JSON.stringify({ x, y }),
        },
      },
    ),

  extruderJog: async (printerId: number, distance: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/extruder-jog?distance=${distance}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/jog/extruder`,
        options: {
          method: 'POST',
          body: JSON.stringify({ distance }),
        },
      },
    ),

  homeAxes: async (printerId: number, axes: 'z' | 'xy' | 'all' = 'z') =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/home-axes?axes=${axes}`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/home`,
        options: {
          method: 'POST',
          body: JSON.stringify({ axes }),
        },
      },
    ),

  startDrying: async (
    printerId: number,
    amsId: number,
    temp: number,
    duration: number,
    filament = '',
    rotateTray = false,
  ) =>
    request<void>(
      `/printers/${printerId}/drying/start?ams_id=${amsId}&temp=${temp}&duration=${duration}&filament=${encodeURIComponent(filament)}&rotate_tray=${rotateTray}`,
      { method: 'POST' },
    ),

  stopDrying: async (printerId: number, amsId: number) =>
    request<void>(`/printers/${printerId}/drying/stop?ams_id=${amsId}`, {
      method: 'POST',
    }),

  setAmsFilamentBackup: async (printerId: number, enabled: boolean) =>
    request<void>(`/printers/${printerId}/ams-backup?enabled=${enabled}`, {
      method: 'POST',
    }),

  refreshAmsSlot: async (printerId: number, amsId: number, slotId: number) =>
    request<void>(
      `/printers/${printerId}/ams/${amsId}/slot/${slotId}/refresh`,
      { method: 'POST' },
    ),

  loadAmsTray: async (printerId: number, trayId: number) =>
    request<void>(`/printers/${printerId}/ams/load`, {
      method: 'POST',
      body: JSON.stringify({ tray_id: trayId }),
    }),

  unloadAms: async (printerId: number) =>
    request<void>(`/printers/${printerId}/ams/unload`, { method: 'POST' }),

  loadFilament: async (printerId: number, amsId: number, trayId: number) => {
    const legacyTrayId = amsId === 255 ? trayId : amsId * 4 + trayId;

    return requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/filament/load`,
        options: {
          method: 'POST',
          body: JSON.stringify({ ams_id: amsId, tray_id: trayId }),
        },
      },
      {
        endpoint: `/printers/${printerId}/ams/load?tray_id=${legacyTrayId}`,
        options: { method: 'POST' },
      },
    );
  },

  unloadFilament: async (printerId: number) =>
    requestWithFallback<void>(
      {
        endpoint: `/printers/${printerId}/filament/unload`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/printers/${printerId}/ams/unload`,
        options: { method: 'POST' },
      },
    ),

  getSlotPresets: async (printerId: number) =>
    request<Record<number, SlotPresetMapping>>(
      `/printers/${printerId}/slot-presets`,
    ),

  saveSlotPreset: async (
    printerId: number,
    amsId: number,
    trayId: number,
    presetId: string,
    presetName: string,
    presetSource = 'cloud',
  ) =>
    request<SlotPresetMapping>(
      `/printers/${printerId}/slot-presets/${amsId}/${trayId}?preset_id=${encodeURIComponent(presetId)}&preset_name=${encodeURIComponent(presetName)}&preset_source=${encodeURIComponent(presetSource)}`,
      { method: 'PUT' },
    ),

  selectExtruder: async (printerId: number, extruder: number) =>
    request<void>(
      `/printers/${printerId}/select-extruder?extruder=${extruder}`,
      { method: 'POST' },
    ),

  getPrintableObjects: async (printerId: number) =>
    request<{ objects: { id: number; name: string; skipped: boolean }[] }>(
      `/printers/${printerId}/print/objects`,
    ),

  skipObjects: async (printerId: number, objectIds: number[]) =>
    request<void>(`/printers/${printerId}/print/skip-objects`, {
      method: 'POST',
      body: JSON.stringify(objectIds),
    }),

  clearHMSErrors: async (printerId: number) =>
    request<void>(`/printers/${printerId}/hms/clear`, { method: 'POST' }),

  executeHMSAction: async (
    printerId: number,
    data: { action: string; attr?: number },
  ) =>
    request<void>(`/printers/${printerId}/hms/execute-action`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDeveloperModeWarnings: async () =>
    request<{ printers: { id: number; name: string; model: string }[] }>(
      '/printers/developer-mode-warnings',
    ),

  getAvailableFilaments: async (model: string, location?: string) => {
    const params = new URLSearchParams({ model });
    if (location) params.set('location', location);
    return request<Record<string, unknown>[]>(
      `/printers/available-filaments?${params}`,
    );
  },

  getPrinterImageUrl: (printerId: number): string =>
    buildMediaUrl(`/printers/${printerId}/image`),

  getCameraSnapshotUrl: (printerId: number): string =>
    buildMediaUrl(`/printers/${printerId}/camera/snapshot`),

  getCameraStreamUrl: (printerId: number): string =>
    buildMediaUrl(`/printers/${printerId}/camera/stream`),

  diagnosePrinterCamera: async (printerId: number) =>
    request<CameraDiagnoseResult>(`/printers/${printerId}/camera/diagnose`, {
      method: 'POST',
    }),

  getPrinterFiles: async (printerId: number, path = '/') =>
    request<Record<string, unknown>[]>(
      `/printers/${printerId}/files?path=${encodeURIComponent(path)}`,
    ),

  getPrinterStorage: async (printerId: number) =>
    request<{ total: number; free: number }>(`/printers/${printerId}/storage`),

  getCurrentPrintUser: async (printerId: number) =>
    request<{ user_id: number | null; username: string | null }>(
      `/printers/${printerId}/current-print-user`,
    ),

  getPrinterSensorHistory: async (
    printerId: number,
    hours = 24,
    kinds?: string[],
  ) => {
    const params = new URLSearchParams({ hours: String(hours) });
    if (kinds && kinds.length > 0) {
      params.set('kinds', kinds.join(','));
    }
    return request<PrinterSensorHistoryResponse>(
      `/printer-sensor-history/${printerId}?${params.toString()}`,
    );
  },

  enableMQTTLogging: async (printerId: number) =>
    request<void>(`/printers/${printerId}/logging/enable`, {
      method: 'POST',
    }),

  disableMQTTLogging: async (printerId: number) =>
    request<void>(`/printers/${printerId}/logging/disable`, {
      method: 'POST',
    }),

  getMQTTLogs: async (printerId: number) =>
    request<Record<string, unknown>>(`/printers/${printerId}/logging`),

  clearMQTTLogs: async (printerId: number) =>
    request<void>(`/printers/${printerId}/logging`, {
      method: 'DELETE',
    }),

  diagnosePrinter: async (printerId: number) =>
    request<Record<string, unknown>>(`/printers/${printerId}/diagnostic`),

  diagnosePrinterByDetails: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/printers/diagnostic', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  setMaintenanceMode: async (printerId: number, enabled: boolean) =>
    request<void>(`/printers/${printerId}/maintenance-mode`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  getVirtualPrinterList: async () => {
    const response = await request<
      Record<string, unknown> | Record<string, unknown>[]
    >(
      '/virtual-printers',
    );
    if (Array.isArray(response)) {
      return { printers: response, models: {} };
    }
    return response;
  },

  getVirtualPrinters: async () => {
    const response = await printersApi.getVirtualPrinterList();
    return Array.isArray(response.printers)
      ? (response.printers as Record<string, unknown>[])
      : [];
  },

  getVirtualPrinter: async (id: number) =>
    request<Record<string, unknown>>(`/virtual-printers/${id}`),

  createVirtualPrinter: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/virtual-printers/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateVirtualPrinter: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/virtual-printers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteVirtualPrinter: async (id: number) =>
    request<void>(`/virtual-printers/${id}`, { method: 'DELETE' }),

  startVirtualPrinter: async (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/virtual-printers/${id}/start`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/virtual-printers/${id}`,
        options: { method: 'PUT', body: JSON.stringify({ enabled: true }) },
      },
    ),

  stopVirtualPrinter: async (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/virtual-printers/${id}/stop`,
        options: { method: 'POST' },
      },
      {
        endpoint: `/virtual-printers/${id}`,
        options: { method: 'PUT', body: JSON.stringify({ enabled: false }) },
      },
    ),

  discoverPrinters: async (duration: number = 10) =>
    request<DiscoveryStatus>(`/discovery/start?duration=${duration}`, {
      method: 'POST',
    }),

  getDiscoveryInfo: async () => request<DiscoveryInfo>('/discovery/info'),

  getDiscoveryStatus: async () => request<DiscoveryStatus>('/discovery/status'),

  startDiscovery: async (duration: number = 10) =>
    request<DiscoveryStatus>(`/discovery/start?duration=${duration}`, {
      method: 'POST',
    }),

  stopDiscovery: async () =>
    request<DiscoveryStatus>('/discovery/stop', { method: 'POST' }),

  getDiscoveredPrinters: async () =>
    request<DiscoveredPrinter[]>('/discovery/printers'),

  startSubnetScan: async (subnet: string, timeout: number = 1.0) =>
    request<SubnetScanStatus>('/discovery/scan', {
      method: 'POST',
      body: JSON.stringify({ subnet, timeout }),
    }),

  stopSubnetScan: async () =>
    request<SubnetScanStatus>('/discovery/scan/stop', { method: 'POST' }),

  getSubnetScanStatus: async () =>
    request<SubnetScanStatus>('/discovery/scan/status'),

  diagnoseConnection: async (data: {
    ip_address: string;
    serial_number?: string;
    access_code?: string;
  }) =>
    request<PrinterDiagnosticResult>('/printers/diagnostic', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
