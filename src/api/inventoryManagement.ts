import { nativeLabelTuple } from '@/i18n';
import { request, requestBlob } from './http';
import type { InventoryRecord, InventoryLabelOptions } from '@/types/api';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export const inventoryRequest = <T = InventoryRecord>(
  path: string,
  method: Method = 'GET',
  body?: unknown,
) =>
  request<T>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** The two inventory backends share UI concepts, not endpoint namespaces. */
export function inventoryBackend(spoolman: boolean) {
  const root = spoolman ? '/spoolman/inventory' : '/inventory';
  return {
    root,
    spools: () =>
      inventoryRequest<InventoryRecord[]>(
        `${root}/spools?include_archived=true`,
      ),
    spool: (id: number) => inventoryRequest(`${root}/spools/${id}`),
    create: (spool: InventoryRecord, quantity: number) =>
      quantity === 1
        ? inventoryRequest(`${root}/spools`, 'POST', spool).then(row => [row])
        : inventoryRequest<InventoryRecord[]>(`${root}/spools/bulk`, 'POST', {
            spool,
            quantity,
          }),
    update: (id: number, patch: InventoryRecord) =>
      inventoryRequest(`${root}/spools/${id}`, 'PATCH', patch),
    bulk: (operation: string, ids: number[], update?: InventoryRecord) =>
      inventoryRequest(
        `${root}/spools/${operation}`,
        'POST',
        operation === 'reset-consumed-counter-bulk'
          ? { spool_ids: ids }
          : { ids, ...(update ? { update } : {}) },
      ),
    associations: (id: number, kind: string) =>
      inventoryRequest<InventoryRecord[]>(`${root}/spools/${id}/${kind}`),
    saveAssociations: (id: number, kind: string, rows: InventoryRecord[]) =>
      inventoryRequest<InventoryRecord[]>(
        `${root}/spools/${id}/${kind}`,
        'PUT',
        rows,
      ),
    reconcile: (id: number, weight: number) =>
      spoolman
        ? inventoryRequest(`${root}/spools/${id}/weight`, 'PATCH', {
            weight_grams: weight,
          })
        : inventoryRequest('/spoolbuddy/scale/update-spool-weight', 'POST', {
            spool_id: id,
            weight_grams: weight,
          }),
    tag: (id: number, tag: InventoryRecord) =>
      inventoryRequest(
        `${root}/spools/${id}/${spoolman ? 'tag' : 'link-tag'}`,
        'PATCH',
        tag,
      ),
    labels: (options: InventoryLabelOptions) =>
      requestBlob(`${spoolman ? '/spoolman' : '/inventory'}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }),
    preview: (
      options: Omit<InventoryLabelOptions, 'spool_ids'> & { spool_id: number },
    ) =>
      requestBlob(`${spoolman ? '/spoolman' : '/inventory'}/labels/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }),
  };
}

export const inventoryManagementApi = {
  presets: async () => {
    const sources = [
      nativeLabelTuple(['local', '/local-presets/']),
      nativeLabelTuple(['cloud', '/cloud/settings']),
      nativeLabelTuple(['orca_cloud', '/orca-cloud/profiles']),
      nativeLabelTuple(['builtin', '/cloud/builtin-filaments']),
    ] as const;
    const results = await Promise.allSettled(
      sources.map(([, path]) =>
        inventoryRequest<InventoryRecord | InventoryRecord[]>(path),
      ),
    );
    const rows: InventoryRecord[] = [];
    const unavailable: string[] = [];
    results.forEach((result, index) => {
      const source = sources[index][0];
      if (result.status === 'rejected') {
        unavailable.push(source);
        return;
      }
      const data = result.value;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.filament)
        ? (data.filament as InventoryRecord[])
        : [];
      list.forEach(row =>
        rows.push({
          ...row,
          source,
          id: String(
            source === 'local'
              ? row.id
              : source === 'builtin'
              ? row.filament_id
              : row.setting_id,
          ),
        }),
      );
    });
    return { rows, unavailable };
  },
  list: (kind: 'catalog' | 'colors' | 'suppliers') =>
    inventoryRequest<InventoryRecord[]>(`/inventory/${kind}`),
  save: (
    kind: 'catalog' | 'colors' | 'suppliers',
    row: InventoryRecord,
    id?: number,
  ) =>
    inventoryRequest(
      `/inventory/${kind}${id === undefined ? '' : `/${id}`}`,
      id === undefined ? 'POST' : kind === 'suppliers' ? 'PATCH' : 'PUT',
      row,
    ),
  remove: (kind: string, id: number) =>
    inventoryRequest(`/inventory/${kind}/${id}`, 'DELETE'),
  removeMany: (kind: string, ids: number[]) =>
    inventoryRequest(`/inventory/${kind}/bulk-delete`, 'POST', { ids }),
  reset: (kind: string) => inventoryRequest(`/inventory/${kind}/reset`, 'POST'),
  syncColors: () => inventoryRequest('/inventory/colors/sync', 'POST'),
  skuSettings: () =>
    inventoryRequest<InventoryRecord[]>('/inventory/sku-settings'),
  saveSku: (row: InventoryRecord) =>
    inventoryRequest('/inventory/sku-settings', 'POST', row),
  shopping: () =>
    inventoryRequest<InventoryRecord[]>('/inventory/shopping-list'),
  addShopping: (row: InventoryRecord) =>
    inventoryRequest('/inventory/shopping-list', 'POST', row),
  shoppingStatus: (id: number, status: string) =>
    inventoryRequest(`/inventory/shopping-list/${id}/status`, 'PATCH', {
      status,
    }),
  clearShopping: () => inventoryRequest('/inventory/shopping-list', 'DELETE'),
  clearUsage: (id: number) =>
    inventoryRequest(`/inventory/spools/${id}/usage`, 'DELETE'),
  sensors: (printer = false) =>
    inventoryRequest<InventoryRecord[]>(
      `/${printer ? 'ha-sensors' : 'location-ha-sensors'}/`,
    ),
  entities: (printer = false) =>
    inventoryRequest<InventoryRecord[]>(
      `/${printer ? 'ha-sensors' : 'location-ha-sensors'}/entities`,
    ),
  readings: (id: number) =>
    inventoryRequest<InventoryRecord[]>(
      `/location-ha-sensors/by-location/${id}/readings`,
    ),
  saveSensor: (row: InventoryRecord, printer = false, id?: number) =>
    inventoryRequest(
      `/${printer ? 'ha-sensors' : 'location-ha-sensors'}/${id ?? ''}`,
      id ? 'PATCH' : 'POST',
      row,
    ),
  deleteSensor: (id: number, printer = false) =>
    inventoryRequest(
      `/${printer ? 'ha-sensors' : 'location-ha-sensors'}/${id}`,
      'DELETE',
    ),
};
