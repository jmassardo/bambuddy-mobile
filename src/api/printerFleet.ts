import { request } from './http';
import type {
  FleetFirmwareInfo,
  FleetFirmwarePrepare,
  FleetFirmwareStatus,
  FleetMQTTLogs,
} from '@/types/api';

const versionQuery = (version: string) =>
  `?version=${encodeURIComponent(version)}`;

export const printerFleetApi = {
  firmware: (id: number) =>
    request<FleetFirmwareInfo>(`/firmware/updates/${id}`),
  prepareFirmware: (id: number, version: string) =>
    request<FleetFirmwarePrepare>(
      `/firmware/updates/${id}/prepare${versionQuery(version)}`,
    ),
  uploadFirmware: (id: number, version: string) =>
    request<{ started: boolean; message: string }>(
      `/firmware/updates/${id}/upload${versionQuery(version)}`,
      { method: 'POST' },
    ),
  firmwareStatus: (id: number) =>
    request<FleetFirmwareStatus>(`/firmware/updates/${id}/upload/status`),
  logs: (id: number) => request<FleetMQTTLogs>(`/printers/${id}/logging`),
};
