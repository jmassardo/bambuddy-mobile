import { buildMediaUrl, request } from './http';
import type {
  CalibrationResult,
  CameraIntegrationToken,
  CameraTokenScope,
  ExternalCameraConnectionResult,
  PlateDetectionResult,
  PlateDetectionStatus,
  PlateReference,
} from '@/types/api';

const platePath = (id: number) => `/printers/${id}/camera/plate-detection`;

export const camerasApi = {
  checkPlate: (id: number) =>
    request<PlateDetectionResult>(`/printers/${id}/camera/check-plate?include_debug_image=true`),
  plateStatus: (id: number) => request<PlateDetectionStatus>(`${platePath(id)}/status`),
  references: (id: number) =>
    request<{ references: PlateReference[]; max_references: number }>(`${platePath(id)}/references`),
  calibrate: (id: number, label = '') =>
    request<CalibrationResult>(`${platePath(id)}/calibrate?label=${encodeURIComponent(label)}`, { method: 'POST' }),
  renameReference: (id: number, index: number, label: string) =>
    request(`${platePath(id)}/references/${index}?label=${encodeURIComponent(label)}`, { method: 'PUT' }),
  deleteReference: (id: number, index: number) =>
    request(`${platePath(id)}/references/${index}`, { method: 'DELETE' }),
  referenceImage: (id: number, index: number) =>
    buildMediaUrl(`${platePath(id)}/references/${index}/thumbnail`),
  snapshot: (id: number, seed: number) =>
    buildMediaUrl(`/printers/${id}/camera/snapshot`, new URLSearchParams({ t: String(seed) })),
  testExternal: (id: number, url: string, type: string) =>
    request<ExternalCameraConnectionResult>(
      `/printers/${id}/camera/external/test?url=${encodeURIComponent(url)}&camera_type=${encodeURIComponent(type)}`,
      { method: 'POST' },
    ),
  tokens: (all = false) => request<CameraIntegrationToken[]>(`/auth/tokens${all ? '/all' : ''}`),
  createToken: (name: string, days: number, scope: CameraTokenScope) =>
    request<CameraIntegrationToken>('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify({ name, expires_in_days: days, scope }),
    }),
  revokeToken: (id: number) => request<void>(`/auth/tokens/${id}`, { method: 'DELETE' }),
};
