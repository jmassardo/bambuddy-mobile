import type {
  PrintBatch,
  PrintBatchUngroupResponse,
  PrintQueueBulkUpdate,
  PrintQueueBulkUpdateResponse,
  PrintQueueItem,
  PrintQueueItemCreate,
  PrintQueueItemUpdate,
} from '@/types/api';
import { request } from './http';

async function addToQueueRequest(
  data: PrintQueueItemCreate | Record<string, unknown>,
): Promise<PrintQueueItem> {
  return request<PrintQueueItem>('/queue/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export const queueApi = {
  getQueue: async (
    printerId?: number,
    status?: string,
    targetModel?: string,
  ) => {
    const params = new URLSearchParams();
    if (printerId !== undefined) params.set('printer_id', String(printerId));
    if (status) params.set('status', status);
    if (targetModel) params.set('target_model', targetModel);
    return request<PrintQueueItem[]>(`/queue/?${params}`);
  },

  getQueueHistory: async (params?: { limit?: number; offset?: number }) => {
    const offset = params?.offset ?? 0;
    const limit = params?.limit;
    const items = await queueApi.getQueue();
    const history = items
      .filter(item =>
        ['completed', 'failed', 'skipped', 'cancelled'].includes(item.status),
      )
      .sort((a, b) => {
        const aTime =
          new Date(
            a.completed_at ?? a.started_at ?? a.created_at ?? 0,
          ).getTime() || 0;
        const bTime =
          new Date(
            b.completed_at ?? b.started_at ?? b.created_at ?? 0,
          ).getTime() || 0;
        return bTime - aTime;
      });
    return typeof limit === 'number'
      ? history.slice(offset, offset + limit)
      : history.slice(offset);
  },

  addToQueue: async (data: PrintQueueItemCreate | Record<string, unknown>) =>
    addToQueueRequest(data),

  updateQueueItem: async (id: number, data: PrintQueueItemUpdate) =>
    request<PrintQueueItem>(`/queue/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteQueueItem: async (id: number) =>
    request<{ message: string; deleted: boolean }>(`/queue/${id}`, {
      method: 'DELETE',
    }),

  reorderQueue: async (itemIds: number[]) =>
    request<{ message: string }>('/queue/reorder', {
      method: 'POST',
      body: JSON.stringify({
        items: itemIds.map((itemId, index) => ({
          id: itemId,
          position: index + 1,
        })),
      }),
    }),

  startQueueItem: async (
    id: number,
    options?: { skipFilamentCheck?: boolean },
  ) =>
    request<PrintQueueItem>(
      `/queue/${id}/start${
        options?.skipFilamentCheck ? '?skip_filament_check=true' : ''
      }`,
      { method: 'POST' },
    ),

  stopQueueItem: async (id: number) =>
    request<{ message: string }>(`/queue/${id}/stop`, { method: 'POST' }),

  resumeQueueAfterFailure: async (printerId: number) =>
    request<{ acknowledged: number; restored: number }>(
      `/queue/printer/${printerId}/resume`,
      { method: 'POST' },
    ),

  createBatch: async (data: import('@/types/api').PrintBatchCreate) =>
    request<PrintBatch>('/queue/batches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  dispatchBatch: async (
    id: number,
    data: { only_plate?: boolean; plate_id?: number | null } = {},
  ) =>
    request<PrintBatch>(`/queue/batches/${id}/dispatch`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cancelBatch: async (id: number) =>
    request<{ message: string }>(`/queue/batches/${id}`, { method: 'DELETE' }),

  cancelQueueItem: async (id: number) =>
    request<{ message: string }>(`/queue/${id}/cancel`, { method: 'POST' }),

  retryQueueItem: async (id: number) => {
    const item = await request<PrintQueueItem>(`/queue/${id}`);
    if (item.status === 'pending') {
      return request<PrintQueueItem>(`/queue/${id}/start`, { method: 'POST' });
    }

    if (!item.archive_id && !item.library_file_id && !item.variants?.length) {
      throw new Error('Queue item cannot be retried');
    }

    return addToQueueRequest({
      printer_id: item.printer_id,
      target_model: item.target_model,
      target_location: item.target_location,
      filament_overrides: item.filament_overrides,
      archive_id: item.archive_id,
      library_file_id: item.library_file_id,
      scheduled_time: item.scheduled_time,
      require_previous_success: item.require_previous_success,
      auto_off_after: item.auto_off_after,
      manual_start: item.manual_start,
      skip_filament_check: item.skip_filament_check,
      ams_mapping: item.ams_mapping,
      plate_id: item.plate_id,
      bed_levelling: item.bed_levelling,
      flow_cali: item.flow_cali,
      vibration_cali: item.vibration_cali,
      layer_inspect: item.layer_inspect,
      timelapse: item.timelapse,
      use_ams: item.use_ams,
      nozzle_offset_cali: item.nozzle_offset_cali,
      confirm_outcome: item.confirm_outcome,
      cost_center_id: item.cost_center_id,
      estimated_cost: item.estimated_cost,
      nozzle_rack_choice: item.nozzle_rack_choice,
      variants:
        item.archive_id || item.library_file_id ? undefined : item.variants,
      preheat_override: item.preheat_override,
      preheat_chamber_target_override: item.preheat_chamber_target_override,
      gcode_injection: item.gcode_injection,
      cleanup_library_after_dispatch: item.cleanup_library_after_dispatch,
    });
  },

  getQueueTimeline: async () => {
    const items = await queueApi.getQueue();
    return [...items].sort((a, b) => {
      const aTime =
        new Date(
          a.completed_at ?? a.started_at ?? a.created_at ?? 0,
        ).getTime() || 0;
      const bTime =
        new Date(
          b.completed_at ?? b.started_at ?? b.created_at ?? 0,
        ).getTime() || 0;
      return bTime - aTime;
    });
  },

  bulkUpdateQueue: async (
    data:
      | PrintQueueBulkUpdate
      | {
          item_ids: number[];
          update: Partial<Omit<PrintQueueBulkUpdate, 'item_ids'>>;
        },
  ) => {
    const normalized =
      'update' in data ? { item_ids: data.item_ids, ...data.update } : data;

    return request<PrintQueueBulkUpdateResponse>('/queue/bulk', {
      method: 'PATCH',
      body: JSON.stringify(normalized),
    });
  },

  getQueueBatches: async (status?: string) => {
    const params = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<PrintBatch[]>(`/queue/batches${params}`);
  },

  getQueueBatch: async (id: number) =>
    request<PrintBatch>(`/queue/batches/${id}`),

  ungroupBatch: async (id: number) =>
    request<PrintBatchUngroupResponse>(`/queue/batches/${id}/ungroup`, {
      method: 'POST',
    }),

  printArchive: async (archiveId: number, data: Record<string, unknown>) =>
    addToQueueRequest({
      archive_id: archiveId,
      ...data,
    }),

  printLibraryFile: async (fileId: number, data: Record<string, unknown>) =>
    addToQueueRequest({
      library_file_id: fileId,
      ...data,
    }),

  printPrinterFile: async (printerId: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/printers/${printerId}/print`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  startPrint: async (
    printerId: number,
    fileId: number,
    options: Record<string, unknown> = {},
  ) =>
    addToQueueRequest({
      printer_id: printerId,
      library_file_id: fileId,
      ...options,
    }),
};
