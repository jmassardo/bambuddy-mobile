import type {
  InventorySpool,
  SpoolAssignment,
  SpoolKProfile,
  SpoolLabelTemplate,
  SpoolUsageRecord,
} from '@/types/api';
import { ApiError, request, requestBlob, uploadFile, type UploadableFile } from './http';

interface InventoryLabelTemplateOption {
  value?: string;
  id?: string;
  label?: string;
  name?: string;
  hint?: string;
}

export const inventoryApi = {
  getSpools: async (includeArchived = false) =>
    request<InventorySpool[]>(`/inventory/spools?include_archived=${includeArchived}`),

  getSpool: async (id: number) => request<InventorySpool>(`/inventory/spools/${id}`),

  createSpool: async (data: Record<string, unknown>) =>
    request<InventorySpool>('/inventory/spools', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSpool: async (id: number, data: Record<string, unknown>) =>
    request<InventorySpool>(`/inventory/spools/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSpool: async (id: number) =>
    request<void>(`/inventory/spools/${id}`, { method: 'DELETE' }),

  archiveSpool: async (id: number) =>
    request<void>(`/inventory/spools/${id}/archive`, { method: 'POST' }),

  restoreSpool: async (id: number) =>
    request<void>(`/inventory/spools/${id}/restore`, { method: 'POST' }),

  assignSpool: async (
    spoolId: number,
    printerId: number,
    amsId: number,
    trayId: number,
  ) =>
    request<void>('/inventory/assignments', {
      method: 'POST',
      body: JSON.stringify({
        spool_id: spoolId,
        printer_id: printerId,
        ams_id: amsId,
        tray_id: trayId,
      }),
    }),

  unassignSpool: async (printerId: number, amsId: number, trayId: number) =>
    request<void>(`/inventory/assignments/${printerId}/${amsId}/${trayId}`, {
      method: 'DELETE',
    }),

  getSpoolAssignments: async () =>
    request<SpoolAssignment[]>('/inventory/assignments'),

  getSpoolCatalog: async () =>
    request<Record<string, unknown>[]>('/inventory/catalog'),

  createSpoolCatalogEntry: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/catalog', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSpoolCatalogEntry: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/catalog/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSpoolCatalogEntry: async (id: number) =>
    request<void>(`/inventory/catalog/${id}`, { method: 'DELETE' }),

  getColorCatalog: async () =>
    request<Record<string, unknown>[]>('/inventory/colors'),

  createColorCatalogEntry: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/colors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateColorCatalogEntry: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/colors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteColorCatalogEntry: async (id: number) =>
    request<void>(`/inventory/colors/${id}`, { method: 'DELETE' }),

  getLocations: async () => request<Record<string, unknown>[]>('/inventory/locations'),

  createLocation: async (data: { name: string; identifier?: string | null }) =>
    request<Record<string, unknown>>('/inventory/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateLocation: async (
    id: number,
    data: { name?: string; identifier?: string | null },
  ) =>
    request<Record<string, unknown>>(`/inventory/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteLocation: async (id: number) =>
    request<Record<string, unknown>>(`/inventory/locations/${id}`, {
      method: 'DELETE' },
    ),

  getInventoryLabelTemplates: async () => {
    try {
      return await request<InventoryLabelTemplateOption[]>('/inventory/label-templates');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      return [
        { value: 'ams_holder_74x33', label: 'AMS holder small (74 × 33 mm)' },
        { value: 'ams_holder_75x55', label: 'AMS holder large (75 × 55 mm)' },
        { value: 'box_40x30', label: 'Box label (40 × 30 mm)' },
        { value: 'box_62x29', label: 'Box label (62 × 29 mm)' },
        { value: 'avery_5160', label: 'Avery 5160 US Letter sheet' },
        { value: 'avery_l7160', label: 'Avery L7160 A4 sheet' },
      ];
    }
  },

  printSpoolLabels: async (data: {
    spool_ids: number[];
    template: SpoolLabelTemplate;
    monochrome?: boolean;
  }) =>
    requestBlob('/inventory/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  printInventoryLabel: async (
    spoolId: number,
    data: {
      template: SpoolLabelTemplate;
      monochrome?: boolean;
    },
  ) =>
    requestBlob('/inventory/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spool_ids: [spoolId], ...data }),
    }),

  importSpoolsCsvPreview: async (file: UploadableFile) =>
    uploadFile<Record<string, unknown>>('/inventory/spools/import?dry_run=true', file),

  importSpoolsCsv: async (file: UploadableFile) =>
    uploadFile<Record<string, unknown>>('/inventory/spools/import', file),

  exportSpoolsCsv: async () => requestBlob('/inventory/spools/export'),

  resetSpoolConsumedCounter: async (id: number) =>
    request<Record<string, unknown>>(`/inventory/spools/${id}/reset-consumed-counter`, {
      method: 'POST',
    }),

  bulkResetSpoolConsumedCounter: async (spoolIds: number[]) =>
    request<Record<string, unknown>>('/inventory/spools/reset-consumed-counter-bulk', {
      method: 'POST',
      body: JSON.stringify({ spool_ids: spoolIds }),
    }),

  bulkUpdateSpools: async (ids: number[], update: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/spools/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, update }),
    }),

  bulkDeleteSpools: async (ids: number[]) =>
    request<Record<string, unknown>>('/inventory/spools/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkArchiveSpools: async (ids: number[]) =>
    request<Record<string, unknown>>('/inventory/spools/bulk-archive', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkRestoreSpools: async (ids: number[]) =>
    request<Record<string, unknown>>('/inventory/spools/bulk-restore', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  getSpoolKProfiles: async (spoolId: number) =>
    request<SpoolKProfile[]>(`/inventory/spools/${spoolId}/k-profiles`),

  getSpoolUsageHistory: async (spoolId: number, limit = 50) =>
    request<SpoolUsageRecord[]>(`/inventory/spools/${spoolId}/usage?limit=${limit}`),

  getAllUsageHistory: async (limit = 5000, printerId?: number) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (printerId !== undefined) params.set('printer_id', String(printerId));
    return request<SpoolUsageRecord[]>(`/inventory/usage?${params.toString()}`);
  },

  getAssignments: async (printerId?: number) =>
    request<SpoolAssignment[]>(
      `/inventory/assignments${printerId ? `?printer_id=${printerId}` : ''}`,
    ),

  getShoppingList: async () =>
    request<Record<string, unknown>[]>('/inventory/shopping-list'),

  addShoppingListItem: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/inventory/shopping-list', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateShoppingListItem: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/inventory/shopping-list/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteShoppingListItem: async (id: number) =>
    request<void>(`/inventory/shopping-list/${id}`, { method: 'DELETE' }),

  createSpoolFromSlot: async (printerId: number, amsId: number, trayId: number) =>
    request<Record<string, unknown>>('/inventory/from-slot', {
      method: 'POST',
      body: JSON.stringify({ printer_id: printerId, ams_id: amsId, tray_id: trayId }),
    }),

  syncAmsWeights: async (printerId: number) =>
    request<void>(`/inventory/sync-ams/${printerId}`, { method: 'POST' }),
};
