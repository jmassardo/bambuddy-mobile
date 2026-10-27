import { request } from './http';
import type {
  PresetRef, UnifiedPresetsResponse, SliceRequest, SliceJobEnqueueResponse,
  SliceJobState, SliceJobProgress, SlicerPipeline, SlicerPipelineCreateRequest,
  SlicerPipelineUpdateRequest, SlicerPipelinesListResponse, PipelineEligibilityReport,
  PipelineRun, PipelineRunListResponse,
  SliceSourceProps, SourcePlates, SourceFilament, PresetValues,
} from '@/types/api';
export type { SliceSourceProps, DesignOverride, SourceFilament, SourcePlates, PresetValues } from '@/types/api';
const sourcePath = (s: SliceSourceProps) =>
  s.sourceType === 'file' ? `/library/files/${s.sourceId}` : `/archives/${s.sourceId}`;
export const sourceIdentity = (s: SliceSourceProps) =>
  s.sourceType === 'file' ? { source_library_file_id: s.sourceId } : { source_archive_id: s.sourceId };
const post = (body?: unknown): RequestInit => ({ method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const slicingApi = {
  presets: (refresh = false) => request<UnifiedPresetsResponse>(`/slicer/presets${refresh ? '?refresh=true' : ''}`),
  models: () => request<Record<string, string>>('/slicer/printer-models'),
  presetValues: (ref: PresetRef) => request<PresetValues>(`/slicer/preset-values?source=${ref.source}&id=${encodeURIComponent(ref.id)}`),
  plates: (source: SliceSourceProps) => request<SourcePlates>(`${sourcePath(source)}/plates`),
  requirements: (source: SliceSourceProps, plate: number, requestId: string) =>
    request<{ filaments: SourceFilament[] }>(`${sourcePath(source)}/filament-requirements?plate_id=${plate}&full_slots=true&request_id=${encodeURIComponent(requestId)}`),
  previewProgress: (id: string) => request<SliceJobProgress | null>(`/slicer/preview-progress/${encodeURIComponent(id)}`),
  slice: (source: SliceSourceProps, body: SliceRequest) => request<SliceJobEnqueueResponse>(`${sourcePath(source)}/slice`, post(body)),
  job: (id: number) => request<SliceJobState>(`/slice-jobs/${id}`),
  pipelines: () => request<SlicerPipelinesListResponse>('/slicer-pipelines/'),
  create: (body: SlicerPipelineCreateRequest) => request<SlicerPipeline>('/slicer-pipelines/', post(body)),
  update: (id: number, body: SlicerPipelineUpdateRequest) =>
    request<SlicerPipeline>(`/slicer-pipelines/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number) => request<void>(`/slicer-pipelines/${id}`, { method: 'DELETE' }),
  eligibility: (id: number, source: SliceSourceProps) =>
    request<PipelineEligibilityReport>(`/slicer-pipelines/${id}/check-eligibility`, post(sourceIdentity(source))),
  run: (id: number, source: SliceSourceProps, copies: number, force = false) =>
    request<PipelineRun>(`/slicer-pipelines/${id}/run`, post({ ...sourceIdentity(source), copies, force })),
  runs: (params: { limit?: number; offset?: number; pipeline_id?: number; status?: string; target_printer_id?: number; target_model_class?: string } = {}) => {
    const query = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return request<PipelineRunListResponse>(`/pipeline-runs${query ? `?${query}` : ''}`);
  },
  latestRun: (id: number) => request<PipelineRunListResponse>(`/slicer-pipelines/${id}/runs?limit=1`),
  cancel: (id: number) => request<PipelineRun>(`/pipeline-runs/${id}/cancel`, post()),
  retry: (id: number) => request<PipelineRun>(`/pipeline-runs/${id}/retry-failed`, post()),
  clear: () => request<{ deleted: number }>('/pipeline-runs/clear', post()),
};
