import type {
  ApiEntity,
  KProfilesResponse,
  MakerworldRecentImport,
  MakerworldResolvedModel,
  SmartPlug,
  SmartPlugCreate,
  SmartPlugStatus,
  SmartPlugTestResult,
  SmartPlugUpdate,
  UnifiedPresetsResponse,
} from '@/types/api';
import { request } from './http';

export const profilesApi = {
  getCloudStatus: async () => request<Record<string, unknown>>('/cloud/status'),

  cloudLogin: async (email: string, password: string, region = 'global') =>
    request<Record<string, unknown>>('/cloud/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, region }),
    }),

  cloudVerify: async (
    email: string,
    code: string,
    tfaKey?: string,
    region = 'global',
  ) =>
    request<Record<string, unknown>>('/cloud/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, tfa_key: tfaKey, region }),
    }),

  cloudSetToken: async (accessToken: string, region = 'global') =>
    request<Record<string, unknown>>('/cloud/token', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken, region }),
    }),

  cloudLogout: async () =>
    request<Record<string, unknown>>('/cloud/logout', { method: 'POST' }),

  getCloudProfiles: async () => request<Record<string, unknown>[]>('/cloud/settings'),

  orcaCloudStartAuth: async (
    provider: 'google' | 'apple' | 'github' = 'google',
  ) =>
    request<Record<string, unknown>>('/orca-cloud/auth/start', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    }),

  orcaCloudFinishAuth: async (callbackUrl: string) =>
    request<Record<string, unknown>>('/orca-cloud/auth/finish', {
      method: 'POST',
      body: JSON.stringify({ callback_url: callbackUrl }),
    }),

  orcaCloudPasswordLogin: async (email: string, password: string) =>
    request<Record<string, unknown>>('/orca-cloud/auth/password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  orcaCloudStatus: async () => request<Record<string, unknown>>('/orca-cloud/status'),

  orcaCloudLogout: async () =>
    request<Record<string, unknown>>('/orca-cloud/logout', {
      method: 'POST',
    }),

  getOrcaCloudProfiles: async () =>
    request<Record<string, unknown>>('/orca-cloud/profiles'),

  getLocalPresets: async () => request<Record<string, unknown>[]>('/local-presets/'),

  getKProfiles: async (printerId?: number, nozzleDiameter = '0.4') => {
    let resolvedPrinterId = printerId;
    if (resolvedPrinterId === undefined) {
      const printers = await request<Array<Record<string, unknown>>>('/printers/');
      const firstPrinter = printers.find(
        (printer): printer is Record<string, unknown> & { id: number } =>
          typeof printer.id === 'number',
      );
      resolvedPrinterId = firstPrinter?.id;
    }
    if (resolvedPrinterId === undefined) {
      throw new Error('No printer available for K profiles');
    }
    return request<ApiEntity<KProfilesResponse>>(
      `/printers/${resolvedPrinterId}/kprofiles/?nozzle_diameter=${nozzleDiameter}`,
    );
  },

  createKProfile: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/kprofiles/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateKProfile: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/kprofiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteKProfile: async (id: number) =>
    request<void>(`/kprofiles/${id}`, { method: 'DELETE' }),

  getMakerworldStatus: async () => request<Record<string, unknown>>('/makerworld/status'),

  resolveMakerworldUrl: async (url: string) =>
    request<ApiEntity<MakerworldResolvedModel>>('/makerworld/resolve', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  importMakerworldPlate: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/makerworld/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMakerworldRecentImports: async () =>
    request<Array<ApiEntity<MakerworldRecentImport>>>(
      '/makerworld/recent-imports',
    ),

  getSlicerPresets: async (options?: { refresh?: boolean }) =>
    request<UnifiedPresetsResponse>(
      options?.refresh ? '/slicer/presets?refresh=true' : '/slicer/presets',
    ),

  startSliceJob: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/slicer/slice', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSliceJobProgress: async (requestId: string) =>
    request<Record<string, unknown> | null>(`/slicer/progress/${requestId}`),

  getSlicerBundles: async () => request<Record<string, unknown>[]>('/slicer/bundles'),

  getPipelines: async () => request<Record<string, unknown>[]>('/slicer-pipelines/'),

  getPipeline: async (id: number) =>
    request<Record<string, unknown>>(`/slicer-pipelines/${id}`),

  createPipeline: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/slicer-pipelines/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePipeline: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/slicer-pipelines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePipeline: async (id: number) =>
    request<void>(`/slicer-pipelines/${id}`, { method: 'DELETE' }),

  runPipeline: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/slicer-pipelines/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPipelineRuns: async (pipelineId?: number) => {
    const query = pipelineId ? `?pipeline_id=${pipelineId}` : '';
    const response = await request<
      Record<string, unknown> | Record<string, unknown>[]
    >(`/pipeline-runs${query}`);
    if (Array.isArray(response)) return response;
    return Array.isArray(response.runs) ? response.runs : [];
  },

  cancelPipelineRun: async (runId: number) =>
    request<void>(`/pipeline-runs/${runId}/cancel`, { method: 'POST' }),

  retryPipelineRun: async (runId: number) =>
    request<void>(`/pipeline-runs/${runId}/retry-failed`, {
      method: 'POST',
    }),

  getSmartPlugs: async () => request<SmartPlug[]>('/smart-plugs/'),

  createSmartPlug: async (data: SmartPlugCreate) =>
    request<SmartPlug>('/smart-plugs/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSmartPlug: async (id: number, data: SmartPlugUpdate) =>
    request<SmartPlug>(`/smart-plugs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSmartPlug: async (id: number) =>
    request<void>(`/smart-plugs/${id}`, { method: 'DELETE' }),

  controlSmartPlug: async (id: number, action: 'on' | 'off' | 'toggle') =>
    request<{ success: boolean; action: string }>(`/smart-plugs/${id}/control`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  toggleSmartPlug: async (id: number, state: boolean) =>
    request<{ success: boolean; action: string }>(`/smart-plugs/${id}/control`, {
      method: 'POST',
      body: JSON.stringify({ action: state ? 'on' : 'off' }),
    }),

  getSmartPlugStatus: async (id: number) =>
    request<SmartPlugStatus>(`/smart-plugs/${id}/status`),

  testSmartPlugConnection: async (
    ipAddress: string,
    username?: string | null,
    password?: string | null,
  ) =>
    request<SmartPlugTestResult>('/smart-plugs/test-connection', {
      method: 'POST',
      body: JSON.stringify({
        ip_address: ipAddress,
        username,
        password,
      }),
    }),
};
