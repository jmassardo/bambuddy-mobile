import { request } from './http';
import type {
  InventorySpool,
  SpoolBuddyDevice,
  SpoolBuddyDiagnostic,
  SpoolBuddyDiagnosticResult,
  SpoolBuddySystemCommand,
  SpoolBuddyUpdateCheck,
} from '@/types/api';

const devicePath = (id: string) =>
  `/spoolbuddy/devices/${encodeURIComponent(id)}`;
const post = (body: object = {}) => ({
  method: 'POST',
  body: JSON.stringify(body),
});
const inventoryPath = (spoolman: boolean) =>
  spoolman ? '/spoolman/inventory/spools' : '/inventory/spools';

export const spoolbuddyApi = {
  devices: () => request<SpoolBuddyDevice[]>('/spoolbuddy/devices'),
  tare: (id: string) =>
    request<{ status: string }>(`${devicePath(id)}/calibration/tare`, post()),
  calibrate: (id: string, grams: number, raw: number, zero: number) =>
    request<{ tare_offset: number; calibration_factor: number }>(
      `${devicePath(id)}/calibration/set-factor`,
      post({
        known_weight_grams: grams,
        raw_adc: raw,
        tare_raw_adc: zero,
      }),
    ),
  write: (id: string, spoolId: number) =>
    request<{ status: string; warnings?: string[] }>(
      '/spoolbuddy/nfc/write-tag',
      post({ device_id: id, spool_id: spoolId }),
    ),
  cancelWrite: (id: string) =>
    request<{ status: string }>(`${devicePath(id)}/cancel-write`, post()),
  command: (id: string, command: SpoolBuddySystemCommand) =>
    request<{ status: string; command: string }>(
      `${devicePath(id)}/system/command`,
      post({ command }),
    ),
  diagnose: (id: string, diagnostic: SpoolBuddyDiagnostic) =>
    request<{ status: string }>(
      `/spoolbuddy/diagnostics/${encodeURIComponent(
        id,
      )}/run?diagnostic=${diagnostic}`,
      post(),
    ),
  diagnosticResult: (id: string, diagnostic: SpoolBuddyDiagnostic) =>
    request<SpoolBuddyDiagnosticResult>(
      `/spoolbuddy/diagnostics/${encodeURIComponent(
        id,
      )}/result?diagnostic=${diagnostic}`,
    ),
  checkUpdate: (id: string) =>
    request<SpoolBuddyUpdateCheck>(`${devicePath(id)}/update-check`),
  update: (id: string) =>
    request<{ status: string; message: string }>(
      `${devicePath(id)}/update`,
      post(),
    ),
  sshKey: () => request<{ public_key: string }>('/spoolbuddy/ssh/public-key'),
  inventoryMode: () => request<{ enabled: boolean }>('/spoolman/status'),
  spools: (spoolman: boolean) =>
    request<InventorySpool[]>(inventoryPath(spoolman)),
  createSpool: (spoolman: boolean, data: Record<string, unknown>) =>
    request<InventorySpool>(inventoryPath(spoolman), post(data)),
  link: (
    spoolman: boolean,
    spoolId: number,
    tag: { tag_uid?: string; tray_uuid?: string; data_origin?: string },
  ) =>
    request<InventorySpool>(
      `${inventoryPath(spoolman)}/${spoolId}/${spoolman ? 'tag' : 'link-tag'}`,
      {
        method: 'PATCH',
        body: JSON.stringify(
          spoolman ? { tag_uid: tag.tag_uid, tray_uuid: tag.tray_uuid } : tag,
        ),
      },
    ),
  weighSpoolman: (spoolId: number, weight: number) =>
    request<{ status: string; weight_used: number }>(
      `/spoolman/inventory/spools/${spoolId}/weight`,
      {
        method: 'PATCH',
        body: JSON.stringify({ weight_grams: weight }),
      },
    ),
  untag: (spoolman: boolean, spoolId: number) =>
    request<InventorySpool>(
      `${inventoryPath(spoolman)}/${spoolId}${spoolman ? '' : '/link-tag'}`,
      {
        method: 'PATCH',
        body: JSON.stringify(
          spoolman
            ? { tag_uid: null, tray_uuid: null }
            : { tag_uid: '', tray_uuid: '', data_origin: 'manual' },
        ),
      },
    ),
};
