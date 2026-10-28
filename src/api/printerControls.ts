import { request, requestBlob } from './http';
import type {
  AMSHistoryResponse, DeviceSlotConfiguration, DeviceSlotResult, PrinterHASensorReading,
  PrinterSDListing, ScheduledDrying, ScheduledDryingCreate, SpoolmanSlotBinding,
  SpoolmanSlotSpool, SmartPlug,
} from '@/types/api';

const query = (values: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(Object.entries(values)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => [key, String(value)])).toString();

export const printerControlsApi = {
  presets: () => request<{
    nozzle_temp_presets?: string; bed_temp_presets?: string; chamber_temp_presets?: string; fan_speed_presets?: string;
  }>('/settings/ui-preferences'),
  builtinFilaments: () => request<{ filament_id: string; name: string; type?: string }[]>('/cloud/builtin-filaments'),
  localPreset: (id: string) => request<{
    filament_type: string | null; nozzle_temp_min: number | null; nozzle_temp_max: number | null;
  }>(`/local-presets/${encodeURIComponent(id.replace(/^local_/, ''))}`),
  heater: (id: number, heater: 'nozzle' | 'bed' | 'chamber', target: number, nozzle?: number) =>
    request(`/printers/${id}/temperature/${heater}?${query({ target, nozzle })}`, { method: 'POST' }),
  fan: (id: number, fan: 'part' | 'aux' | 'aux2' | 'chamber', speed: number) =>
    request(`/printers/${id}/fan-speed?${query({ fan, speed })}`, { method: 'POST' }),
  extruder: (id: number, extruder: number) =>
    request(`/printers/${id}/select-extruder?${query({ extruder })}`, { method: 'POST' }),
  airduct: (id: number, mode: 'cooling' | 'heating') =>
    request(`/printers/${id}/airduct-mode?${query({ mode })}`, { method: 'POST' }),
  labels: (id: number) => request<Record<string, string>>(`/printers/${id}/ams-labels`),
  label: (id: number, amsId: number, label: string, serial: string) =>
    request(`/printers/${id}/ams-labels/${amsId}`, {
      method: 'PUT', body: JSON.stringify({ label, ams_serial: serial }),
    }),
  resetLabel: (id: number, amsId: number, serial: string) =>
    request(`/printers/${id}/ams-labels/${amsId}?${query({ ams_serial: serial })}`, { method: 'DELETE' }),
  history: (id: number, amsId: number, hours: number) =>
    request<AMSHistoryResponse>(`/ams-history/${id}/${amsId}?hours=${hours}`),
  configure: (id: number, amsId: number, trayId: number, configuration: DeviceSlotConfiguration) =>
    request<DeviceSlotResult>(`/printers/${id}/slots/${amsId}/${trayId}/configure?${query({ ...configuration })}`, { method: 'POST' }),
  resetSlot: (id: number, amsId: number, trayId: number) =>
    request(`/printers/${id}/ams/${amsId}/tray/${trayId}/reset`, { method: 'POST' }),
  saveMapping: (id: number, amsId: number, trayId: number, presetId: string, presetName: string, source: string, filamentId?: string) =>
    request(`/printers/${id}/slot-presets/${amsId}/${trayId}?${query({
      preset_id: presetId, preset_name: presetName, preset_source: source, tray_info_idx: filamentId,
    })}`, { method: 'PUT' }),
  load: (id: number, trayId: number, extruderId?: number) =>
    request(`/printers/${id}/ams/load?${query({ tray_id: trayId, extruder_id: extruderId })}`, { method: 'POST' }),
  unload: (id: number, trayId?: number) =>
    request(`/printers/${id}/ams/unload?${query({ tray_id: trayId })}`, { method: 'POST' }),
  scheduled: (id: number) => request<ScheduledDrying[]>(`/scheduled-dryings?printer_id=${id}`),
  schedule: (data: ScheduledDryingCreate) =>
    request<ScheduledDrying>('/scheduled-dryings', { method: 'POST', body: JSON.stringify(data) }),
  cancelScheduled: (id: number) => request(`/scheduled-dryings/${id}`, { method: 'DELETE' }),
  haReadings: (id: number) =>
    request<PrinterHASensorReading[]>(`/ha-sensors/by-printer/${id}/readings`),
  haActions: (id: number) => request<SmartPlug[]>(`/smart-plugs/by-printer/${id}/scripts`),
  spoolmanSpools: () => request<SpoolmanSlotSpool[]>('/spoolman/inventory/spools?include_archived=false'),
  spoolmanBindings: () => request<SpoolmanSlotBinding[]>('/spoolman/inventory/slot-assignments/all'),
  assignSpoolman: (id: number, amsId: number, trayId: number, spoolId: number) =>
    request('/spoolman/inventory/slot-assignments', {
      method: 'POST',
      body: JSON.stringify({ printer_id: id, ams_id: amsId, tray_id: trayId, spoolman_spool_id: spoolId }),
    }),
  files: (id: number, path: string) =>
    request<PrinterSDListing>(`/printers/${id}/files?${query({ path })}`),
  deleteFile: (id: number, path: string) =>
    request(`/printers/${id}/files?${query({ path })}`, { method: 'DELETE' }),
  download: (id: number, path: string) =>
    requestBlob(`/printers/${id}/files/download?${query({ path })}`),
  thumbnail: (id: number, path: string, plate: number) =>
    requestBlob(`/printers/${id}/files/plate-thumbnail/${plate}?${query({ path })}`),
};
