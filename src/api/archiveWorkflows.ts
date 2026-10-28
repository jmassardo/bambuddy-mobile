import { apiUrl, useServerStore } from './server';
import {
  ApiError,
  buildMediaUrl,
  getAuthToken,
  request,
  requestBlob,
  uploadFile,
  type UploadableFile,
} from './http';
import type {
  Archive,
  ArchiveComparison,
  ArchiveProjectPage,
  ArchivePrinterMedia,
  PendingArchiveUpload,
  TimelapseInfo,
} from '@/types/api';

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});

export const archiveWorkflows = {
  async allArchives(): Promise<Archive[]> {
    const result: Archive[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await request<Archive[]>(
        `/archives/?limit=200&offset=${offset}`,
      );
      result.push(...page);
      if (page.length < 200) return result;
    }
  },
  favorite: (id: number) =>
    request<Archive>(`/archives/${id}/favorite`, json('POST')),
  pending: () => request<PendingArchiveUpload[]>('/pending-uploads/'),
  accept: (
    id: number,
    data: { tags?: string; notes?: string; project_id?: number },
  ) =>
    request<{ id: number }>(
      `/pending-uploads/${id}/archive`,
      json('POST', data),
    ),
  discard: (id: number) => request(`/pending-uploads/${id}`, json('DELETE')),
  acceptAll: () =>
    request<{ archived: number; failed: number }>(
      '/pending-uploads/archive-all',
      json('POST'),
    ),
  discardAll: () =>
    request<{ discarded: number }>(
      '/pending-uploads/discard-all',
      json('DELETE'),
    ),
  renameTag: (name: string, newName: string) =>
    request<{ affected: number }>(
      `/archives/tags/${encodeURIComponent(name)}`,
      json('PUT', { new_name: newName }),
    ),
  deleteTag: (name: string) =>
    request<{ affected: number }>(
      `/archives/tags/${encodeURIComponent(name)}`,
      json('DELETE'),
    ),
  impact: (id: number) =>
    request<{ related_queue_items: number; currently_printing: boolean }>(
      `/archives/${id}/delete-impact`,
    ),
  compare: (ids: number[]) =>
    request<ArchiveComparison>(
      `/archives/compare?archive_ids=${ids.join(',')}`,
    ),
  download: (
    id: number,
    kind: 'download' | 'source' | 'f3d' | 'timelapse' | 'qrcode' = 'download',
  ) => requestBlob(`/archives/${id}/${kind}`),
  downloadUrl: (id: number) =>
    apiUrl(useServerStore.getState().serverUrl!, `/archives/${id}/download`),
  attach: (
    id: number,
    kind: 'source' | 'f3d' | 'timelapse/upload',
    file: UploadableFile,
  ) => uploadFile(`/archives/${id}/${kind}`, file),
  remove: (id: number, kind: 'source' | 'f3d' | 'timelapse') =>
    request(`/archives/${id}/${kind}`, json('DELETE')),
  scan: (id: number) =>
    request<{
      available_files?: Array<{
        name: string;
        path?: string;
        size?: number;
        mtime?: string;
      }>;
      status?: string;
      message?: string;
    }>(`/archives/${id}/timelapse/scan`, json('POST')),
  selectTimelapse: (id: number, filename: string) =>
    request(
      `/archives/${id}/timelapse/select?filename=${encodeURIComponent(
        filename,
      )}`,
      json('POST'),
    ),
  printerMedia: (id: number) =>
    request<ArchivePrinterMedia>(`/archives/${id}/printer-media`),
  projectPage: (id: number) =>
    request<ArchiveProjectPage>(`/archives/${id}/project-page`),
  saveProjectPage: (id: number, data: Partial<ArchiveProjectPage>) =>
    request<ArchiveProjectPage>(
      `/archives/${id}/project-page`,
      json('PATCH', data),
    ),
  projectImage: (id: number, path: string) =>
    buildMediaUrl(
      `/archives/${id}/project-image/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
    ),
  plates: (id: number) =>
    request<{
      plates: Array<{ index: number; name?: string; thumbnail?: string }>;
    }>(`/archives/${id}/plates`),
  folders: (id: number) =>
    request<Array<{ id: number; name: string }>>(
      `/library/folders/by-archive/${id}`,
    ),
  plateThumbnail: (id: number, index: number) =>
    buildMediaUrl(`/archives/${id}/plate-thumbnail/${index}`),
  timelapseInfo: (id: number) =>
    request<TimelapseInfo>(`/archives/${id}/timelapse/info`),
  timelapseThumbnails: (id: number) =>
    request<{ thumbnails: string[]; timestamps: number[] }>(
      `/archives/${id}/timelapse/thumbnails?count=12`,
    ),
  async processTimelapse(
    id: number,
    params: { trimStart: number; trimEnd: number; speed: number },
    audio?: UploadableFile,
  ) {
    const form = new FormData();
    form.append('trim_start', String(params.trimStart));
    form.append('trim_end', String(params.trimEnd));
    form.append('speed', String(params.speed));
    form.append('save_mode', 'replace');
    if (audio) form.append('audio', audio as unknown as Blob);
    const token = getAuthToken();
    const response = await fetch(
      apiUrl(
        useServerStore.getState().serverUrl!,
        `/archives/${id}/timelapse/process`,
      ),
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        String(data.detail ?? `HTTP ${response.status}`),
        response.status,
      );
    return data as {
      status: string;
      message: string;
      output_path: string | null;
    };
  },
  updateRun: (
    id: number,
    data: { status: string; failure_reason: string | null },
  ) => request(`/print-log/${id}`, json('PATCH', data)),
  deleteRun: (id: number) => request(`/print-log/${id}`, json('DELETE')),
  clearRuns: () => request('/print-log/', json('DELETE')),
};
