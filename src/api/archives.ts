import type { ApiEntity, Archive, EnergyStats, FailureAnalysis, PrintLogResponse } from '@/types/api';
import { buildMediaUrl, ApiError, request, requestBlob, uploadFile, type UploadableFile } from './http';

export const archivesApi = {
  getArchives: async (params?: {
    printerId?: number;
    projectId?: number;
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
    createdById?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.printerId) searchParams.set('printer_id', String(params.printerId));
    if (params?.projectId) searchParams.set('project_id', String(params.projectId));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.dateFrom) searchParams.set('date_from', params.dateFrom);
    if (params?.dateTo) searchParams.set('date_to', params.dateTo);
    if (params?.createdById !== undefined) {
      searchParams.set('created_by_id', String(params.createdById));
    }
    return request<Array<ApiEntity<Archive>>>(`/archives/?${searchParams}`);
  },

  getArchive: async (id: number) => request<ApiEntity<Archive>>(`/archives/${id}`),

  getArchiveRuns: async (id: number): Promise<Record<string, unknown>[]> => {
    const response = await request<
      Record<string, unknown> | Record<string, unknown>[] | null
    >(`/archives/${id}/runs`);
    if (Array.isArray(response)) return response;
    return response && Array.isArray(response.items)
      ? (response.items as Record<string, unknown>[])
      : [];
  },

  searchArchives: async (
    query: string,
    options?: {
      printerId?: number;
      projectId?: number;
      status?: string;
      limit?: number;
      offset?: number;
    },
  ) => {
    const searchParams = new URLSearchParams({ q: query });
    if (options?.printerId) searchParams.set('printer_id', String(options.printerId));
    if (options?.projectId) searchParams.set('project_id', String(options.projectId));
    if (options?.status) searchParams.set('status', options.status);
    if (options?.limit) searchParams.set('limit', String(options.limit));
    if (options?.offset) searchParams.set('offset', String(options.offset));
    return request<Array<ApiEntity<Archive>>>(`/archives/search?${searchParams}`);
  },

  updateArchive: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/archives/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteArchive: async (id: number, purgeStats = false) =>
    request<void>(`/archives/${id}${purgeStats ? '?purge_stats=true' : ''}`, {
      method: 'DELETE',
    }),

  uploadArchive: async (file: UploadableFile, printerId?: number) =>
    uploadFile<Record<string, unknown>>(
      `/archives/upload${printerId !== undefined ? `?printer_id=${printerId}` : ''}`,
      file,
    ),

  getArchiveStats: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    createdById?: number;
    printerId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.dateFrom) searchParams.set('date_from', params.dateFrom);
    if (params?.dateTo) searchParams.set('date_to', params.dateTo);
    if (params?.createdById !== undefined) {
      searchParams.set('created_by_id', String(params.createdById));
    }
    if (params?.printerId) searchParams.set('printer_id', String(params.printerId));
    return request<Record<string, unknown>>(`/archives/stats?${searchParams}`);
  },

  getArchiveEnergyStats: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    printerId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.dateFrom) searchParams.set('date_from', params.dateFrom);
    if (params?.dateTo) searchParams.set('date_to', params.dateTo);
    if (params?.printerId) searchParams.set('printer_id', String(params.printerId));
    return request<ApiEntity<EnergyStats>>(`/archives/stats/energy?${searchParams}`);
  },

  getTags: async () => request<{ name: string; count: number }[]>('/archives/tags'),

  getArchiveSimilar: async (id: number, limit = 10) =>
    request<Array<ApiEntity<Archive>>>(`/archives/${id}/similar?limit=${limit}`),

  exportArchives: async (options?: {
    format?: 'csv' | 'xlsx';
    fields?: string[];
    printerId?: number;
    projectId?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (options?.format) searchParams.set('format', options.format);
    if (options?.fields) searchParams.set('fields', options.fields.join(','));
    if (options?.printerId) searchParams.set('printer_id', String(options.printerId));
    if (options?.projectId) searchParams.set('project_id', String(options.projectId));
    if (options?.status) searchParams.set('status', options.status);
    if (options?.dateFrom) searchParams.set('date_from', options.dateFrom);
    if (options?.dateTo) searchParams.set('date_to', options.dateTo);
    if (options?.search) searchParams.set('search', options.search);
    return requestBlob(`/archives/export?${searchParams.toString()}`);
  },

  exportArchiveStats: async (options?: {
    format?: 'csv' | 'xlsx';
    days?: number;
    printerId?: number;
    projectId?: number;
    dateFrom?: string;
    dateTo?: string;
    createdById?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (options?.format) searchParams.set('format', options.format);
    if (options?.days) searchParams.set('days', String(options.days));
    if (options?.printerId) searchParams.set('printer_id', String(options.printerId));
    if (options?.projectId) searchParams.set('project_id', String(options.projectId));
    if (options?.dateFrom) searchParams.set('date_from', options.dateFrom);
    if (options?.dateTo) searchParams.set('date_to', options.dateTo);
    if (options?.createdById !== undefined) {
      searchParams.set('created_by_id', String(options.createdById));
    }
    return requestBlob(`/archives/stats/export?${searchParams.toString()}`);
  },

  getArchivePlateThumbnail: (id: number, plateIndex: number): string =>
    buildMediaUrl(`/archives/${id}/plates/${plateIndex}/thumbnail`),

  getArchiveThumbnail: (id: number): string =>
    buildMediaUrl(`/archives/${id}/thumbnail`),

  getArchiveTimelapse: (id: number): string =>
    buildMediaUrl(`/archives/${id}/timelapse`),

  getArchiveTimelapseThumbnail: (id: number): string =>
    buildMediaUrl(`/archives/${id}/timelapse/thumbnail`),

  updateArchiveTimelapse: async (
    id: number,
    data: {
      start_offset?: number;
      end_offset?: number;
      speed?: number;
    },
  ) =>
    request<Record<string, unknown>>(`/archives/${id}/timelapse`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  uploadTimelapseMusic: async (archiveId: number, file: UploadableFile) =>
    uploadFile<Record<string, unknown>>(
      `/archives/${archiveId}/timelapse/music`,
      file,
    ),

  removeTimelapseMusic: async (archiveId: number) =>
    request<Record<string, unknown>>(`/archives/${archiveId}/timelapse/music`, {
      method: 'DELETE',
    }),

  getArchivePhotoUrl: (archiveId: number, filename: string): string =>
    buildMediaUrl(
      `/archives/${archiveId}/photos/${encodeURIComponent(filename)}`,
    ),

  getArchivePhotos: async (archiveId: number) => {
    const archive = await request<{ photos?: string[] | null }>(`/archives/${archiveId}`);
    return archive.photos ?? [];
  },

  getArchivePrintLog: async (archiveId: number) => {
    try {
      const response = await request<Record<string, unknown> | Record<string, unknown>[]>(
        `/archives/${archiveId}/print-log`,
      );
      if (Array.isArray(response)) return response;
      return Array.isArray(response.items)
        ? (response.items as Record<string, unknown>[])
        : [];
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const response = await request<ApiEntity<PrintLogResponse>>('/print-log/?limit=250');
      const items = Array.isArray(response.items) ? response.items : [];
      return items.filter(item => Number(item.archive_id ?? 0) === archiveId);
    }
  },

  getPrintLogs: async (params?: {
    printName?: string;
    printerName?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.printName) searchParams.set('print_name', params.printName);
    if (params?.printerName) searchParams.set('printer_name', params.printerName);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.dateFrom) searchParams.set('date_from', params.dateFrom);
    if (params?.dateTo) searchParams.set('date_to', params.dateTo);
    if (params?.search) searchParams.set('q', params.search);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    return request<ApiEntity<PrintLogResponse>>(`/print-log/?${searchParams}`);
  },

  restoreArchive: async (archiveId: number) =>
    request<Record<string, unknown>>(`/archives/${archiveId}/restore`, {
      method: 'POST',
    }),

  previewArchivePurge: async (olderThanDays: number, purgeStats = false) =>
    request<Record<string, unknown>>(
      `/archives/purge/preview?older_than_days=${olderThanDays}&purge_stats=${purgeStats}`,
    ),

  purgeArchives: async (data: { older_than_days: number; purge_stats?: boolean }) =>
    request<Record<string, unknown>>('/archives/purge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  uploadArchivePhoto: async (archiveId: number, file: UploadableFile) =>
    uploadFile<Record<string, unknown>>(`/archives/${archiveId}/photos`, file),

  deleteArchivePhoto: async (archiveId: number, filename: string) =>
    request<Record<string, unknown>>(
      `/archives/${archiveId}/photos/${encodeURIComponent(filename)}`,
      { method: 'DELETE' },
    ),

  getArchiveQRCode: (archiveId: number, size = 200): string => {
    const params = new URLSearchParams({ size: String(size) });
    return buildMediaUrl(`/archives/${archiveId}/qrcode`, params);
  },

  recalculateCosts: async () =>
    request<{ message: string }>('/archives/recalculate-costs', {
      method: 'POST',
    }),

  getStats: async (params?: {
    dateFrom?: string;
    dateTo?: string;
    createdById?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.dateFrom) searchParams.set('date_from', params.dateFrom);
    if (params?.dateTo) searchParams.set('date_to', params.dateTo);
    if (params?.createdById !== undefined) {
      searchParams.set('created_by_id', String(params.createdById));
    }
    return request<Record<string, unknown>>(`/archives/stats?${searchParams}`);
  },

  sliceArchive: async (id: number) =>
    request<Record<string, unknown>>(`/archives/${id}/slice`, {
      method: 'POST',
    }),

  getFailureAnalysis: async (params?: {
    periodDays?: number;
    printerId?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.periodDays) searchParams.set('period_days', String(params.periodDays));
    if (params?.printerId) searchParams.set('printer_id', String(params.printerId));
    return request<FailureAnalysis>(`/archives/failure-analysis?${searchParams}`);
  },
};
