import { request, uploadFile, type UploadableFile } from './http';
import type {
  KProfile,
  KProfileCreate,
  KProfileDelete,
  KProfilesResponse,
  PresetDetail,
  PresetMutation,
  PresetImportResult,
  PresetFields,
  OrcaDeviceAuthorization,
  OrcaDevicePoll,
  PresetGroups,
} from '@/types/api';

const cloudPath = (id: string) => `/cloud/settings/${encodeURIComponent(id)}`;
const kPath = (printer: number) => `/printers/${printer}/kprofiles`;

export const profileManagementApi = {
  create: (data: PresetMutation) =>
    request<PresetDetail>('/cloud/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Pick<PresetMutation, 'name' | 'setting'>) =>
    request<PresetDetail>(cloudPath(id), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (id: string) => request(cloudPath(id), { method: 'DELETE' }),
  detail: (id: string) => request<PresetDetail>(cloudPath(id)),
  fields: (type: string) => request<PresetFields>(`/cloud/fields/${type}`),
  localList: () => request<PresetGroups>('/local-presets/'),
  localDetail: (id: number) => request<PresetDetail>(`/local-presets/${id}`),
  localRemove: (id: number) =>
    request(`/local-presets/${id}`, { method: 'DELETE' }),
  localImport: (file: UploadableFile) =>
    uploadFile<PresetImportResult>('/local-presets/import', file),
  orcaStart: () =>
    request<OrcaDeviceAuthorization>('/orca-cloud/device/start', {
      method: 'POST',
    }),
  orcaPoll: () =>
    request<OrcaDevicePoll>('/orca-cloud/device/poll', { method: 'POST' }),
  orcaDetail: (id: string) =>
    request<PresetDetail>(`/orca-cloud/profiles/${encodeURIComponent(id)}`),
  kList: (printer: number, nozzle: string) =>
    request<KProfilesResponse>(
      `${kPath(printer)}/?nozzle_diameter=${encodeURIComponent(nozzle)}`,
    ),
  kSave: (printer: number, profile: KProfileCreate) =>
    request<{ success: boolean }>(`${kPath(printer)}/`, {
      method: 'POST',
      body: JSON.stringify(profile),
    }),
  kBatch: (printer: number, profiles: KProfileCreate[]) =>
    request<{ success: boolean }>(`${kPath(printer)}/batch`, {
      method: 'POST',
      body: JSON.stringify(profiles),
    }),
  kRemove: (printer: number, profile: KProfileDelete) =>
    request<{ success: boolean }>(`${kPath(printer)}/`, {
      method: 'DELETE',
      body: JSON.stringify({
        slot_id: profile.slot_id,
        extruder_id: profile.extruder_id,
        nozzle_id: profile.nozzle_id,
        nozzle_diameter: profile.nozzle_diameter,
        filament_id: profile.filament_id,
        setting_id: profile.setting_id,
      }),
    }),
  kNotes: (printer: number) =>
    request<{ notes: Record<string, string> }>(`${kPath(printer)}/notes`),
  kNote: (printer: number, setting_id: string, note: string) =>
    request(`${kPath(printer)}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ setting_id, note }),
    }),
};

export function kProfileIdentity(profile: KProfile): string {
  return [
    profile.slot_id,
    profile.extruder_id,
    profile.nozzle_id,
    profile.nozzle_diameter,
    profile.filament_id,
    profile.setting_id ?? '',
  ].join(':');
}
