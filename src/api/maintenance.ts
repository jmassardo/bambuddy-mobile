import type {
  MaintenanceHistory,
  MaintenanceStatus,
  MaintenanceType,
  MaintenanceTypeCreate,
  PrinterMaintenanceOverview,
} from '@/types/api';
import { ApiError, request, requestWithFallback } from './http';

export const maintenanceApi = {
  getMaintenanceTasks: async () => {
    const overview = await request<PrinterMaintenanceOverview[]>('/maintenance/overview');
    return overview.flatMap(item => item.maintenance_items ?? []);
  },

  getMaintenanceTask: async (id: number) => {
    const items = await maintenanceApi.getMaintenanceTasks();
    const item = items.find(candidate => candidate.id === id);
    if (!item) {
      throw new ApiError('Maintenance item not found', 404);
    }
    return item;
  },

  createMaintenanceTask: async (data: Record<string, unknown>) => {
    const printerId = Number(data.printer_id);
    const typeId = Number(data.maintenance_type_id);
    if (!Number.isFinite(printerId) || !Number.isFinite(typeId)) {
      throw new Error('printer_id and maintenance_type_id are required');
    }
    return request<Record<string, unknown>>(
      `/maintenance/printers/${printerId}/assign/${typeId}`,
      { method: 'POST' },
    );
  },

  updateMaintenanceTask: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/maintenance/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteMaintenanceTask: async (id: number) =>
    request<void>(`/maintenance/items/${id}`, { method: 'DELETE' }),

  completeMaintenanceTask: async (id: number) =>
    request<Record<string, unknown>>(`/maintenance/items/${id}/perform`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getMaintenanceTypes: async () => request<MaintenanceType[]>('/maintenance/types'),

  createMaintenanceType: async (data: MaintenanceTypeCreate) =>
    request<MaintenanceType>('/maintenance/types', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMaintenanceType: async (
    id: number,
    data: Partial<MaintenanceTypeCreate>,
  ) =>
    request<MaintenanceType>(`/maintenance/types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteMaintenanceType: async (id: number) =>
    request<void>(`/maintenance/types/${id}`, { method: 'DELETE' }),

  getMaintenanceOverview: async () =>
    request<PrinterMaintenanceOverview[]>('/maintenance/overview'),

  getPrinterMaintenance: async (printerId: number) =>
    request<PrinterMaintenanceOverview>(`/maintenance/printers/${printerId}`),

  updateMaintenanceItem: async (
    itemId: number,
    data: {
      custom_interval_hours?: number | null;
      custom_interval_type?: 'hours' | 'days' | null;
      enabled?: boolean;
    },
  ) =>
    request<MaintenanceStatus>(`/maintenance/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  performMaintenance: async (itemId: number, notes?: string) =>
    request<MaintenanceStatus>(`/maintenance/items/${itemId}/perform`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  assignMaintenanceType: async (printerId: number, typeId: number) =>
    requestWithFallback<MaintenanceStatus>(
      {
        endpoint: '/maintenance/assignments',
        options: {
          method: 'POST',
          body: JSON.stringify({ printer_id: printerId, type_id: typeId }),
        },
      },
      {
        endpoint: `/maintenance/printers/${printerId}/assign/${typeId}`,
        options: { method: 'POST' },
      },
    ),

  removeMaintenanceItem: async (itemId: number) =>
    request<void>(`/maintenance/items/${itemId}`, { method: 'DELETE' }),

  setPrinterHours: async (printerId: number, totalHours: number) =>
    request<Record<string, unknown>>(
      `/maintenance/printers/${printerId}/hours?total_hours=${totalHours}`,
      { method: 'PATCH' },
    ),

  getMaintenanceHistory: async (itemId: number) =>
    request<MaintenanceHistory[]>(`/maintenance/items/${itemId}/history`),
};
