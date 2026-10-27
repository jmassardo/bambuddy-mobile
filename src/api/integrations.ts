import { request } from './http';
import type {
  DiscoveredTasmotaDevice, HAEntity, HASensorEntity, HATestConnectionResult,
  SmartPlug, SmartPlugCreate, SmartPlugStatus, SmartPlugTestResult, SmartPlugUpdate,
  TasmotaScanStatus, VPDiagnosticResult, VPCaCertificate, NetworkInterface, PrinterDiagnosticResult,
} from '@/types/api';

const json = (body: unknown, method = 'POST') => ({ method, body: JSON.stringify(body) });

export const integrationsApi = {
  startScan: () => request<TasmotaScanStatus>('/smart-plugs/discover/scan', json({})),
  stopScan: () => request<TasmotaScanStatus>('/smart-plugs/discover/stop', { method: 'POST' }),
  scanStatus: () => request<TasmotaScanStatus>('/smart-plugs/discover/status'),
  discoveredDevices: () => request<DiscoveredTasmotaDevice[]>('/smart-plugs/discover/devices'),
  haEntities: (search = '') => request<HAEntity[]>(`/smart-plugs/ha/entities?search=${encodeURIComponent(search)}`),
  haSensors: () => request<HASensorEntity[]>('/smart-plugs/ha/sensors'),
  testHA: (url: string, token: string) => request<HATestConnectionResult>('/smart-plugs/ha/test-connection', json({ url, token })),
  testREST: (url: string, method: string, headers: string | null) =>
    request<{ success: boolean; error: string | null }>('/smart-plugs/rest/test-connection', json({ url, method, headers })),
  testTasmota: (ip_address: string, username: string | null, password: string | null) =>
    request<SmartPlugTestResult>('/smart-plugs/test-connection', json({ ip_address, username, password })),
  savePlug: async (data: SmartPlugCreate, id?: number) => {
    if (id != null) return request<SmartPlug>(`/smart-plugs/${id}`, json(data, 'PATCH'));
    const plug = await request<SmartPlug>('/smart-plugs/', json(data));
    return plug;
  },
  updatePlug: (id: number, data: SmartPlugUpdate) =>
    request<SmartPlug>(`/smart-plugs/${id}`, json(data, 'PATCH')),
  linkedPlug: (printerId: number) => request<SmartPlug | null>(`/smart-plugs/by-printer/${printerId}`),
  plugStatus: (id: number) => request<SmartPlugStatus>(`/smart-plugs/${id}/status`),
  control: async (id: number, action: 'on' | 'off') => {
    const result = await request<{ success: boolean; action: string }>(`/smart-plugs/${id}/control`, json({ action }));
    if (!result.success) throw new Error('Device did not confirm the power command.');
    return result;
  },
  interfaces: () => request<{ interfaces: NetworkInterface[] }>('/settings/network-interfaces'),
  diagnoseVP: (id: number) => request<VPDiagnosticResult>(`/virtual-printers/${id}/diagnostic`),
  diagnoseTarget: (id: number) => request<PrinterDiagnosticResult>(`/printers/${id}/diagnostic`),
  certificate: () => request<VPCaCertificate>('/virtual-printers/ca-certificate'),
  tailscale: () => request<{ available: boolean; fqdn: string; error: string | null }>('/virtual-printers/tailscale-status'),
  vpSettings: () => request<{ archive_name_source: 'metadata' | 'filename' }>('/settings/virtual-printer'),
  saveArchiveNaming: (source: 'metadata' | 'filename') =>
    request<unknown>(`/settings/virtual-printer?archive_name_source=${source}`, { method: 'PUT' }),
};
