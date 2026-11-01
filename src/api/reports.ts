import { request } from './http';
import type { PurchasingReportRow } from '@/types/api';
import type { ReportScope } from '@/utils/reports';
import type { ApiRecord } from '@/utils/data';

function scopeQuery(scope: ReportScope) {
  const params = new URLSearchParams();
  if (scope.dateFrom) params.set('date_from', scope.dateFrom);
  if (scope.dateTo) params.set('date_to', scope.dateTo);
  return params;
}

export const reportsApi = {
  events: async (scope: ReportScope) => {
    const params = scopeQuery(scope);
    if (scope.createdById !== undefined)
      params.set('created_by_id', String(scope.createdById));
    const items: ApiRecord[] = [];
    let offset = 0;
    while (true) {
      params.set('limit', '10000');
      params.set('offset', String(offset));
      const batch = await request<ApiRecord[]>(`/archives/slim?${params}`);
      items.push(...batch);
      if (batch.length < 10000) break;
      offset += batch.length;
    }
    // /slim has no printer_id parameter; filter after the complete event fetch.
    return scope.printerId === undefined
      ? items
      : items.filter(item => item.printer_id === scope.printerId);
  },
  purchasing: (kind: 'suppliers' | 'material-numbers', scope: ReportScope) =>
    request<PurchasingReportRow[]>(
      `/inventory/stats/${kind}?${scopeQuery(scope)}`,
    ),
  flags: () =>
    request<{ billing_enabled: boolean; currency: string }>(
      '/settings/ui-flags',
    ),
  inventoryMode: async (settingsRead: boolean) => {
    if (settingsRead) {
      const settings = await request<{
        spoolman_enabled: boolean;
        spoolman_url: string;
      }>('/settings/');
      return settings.spoolman_enabled && !!settings.spoolman_url;
    }
    const status = await request<{ enabled: boolean; url: string | null }>(
      '/spoolman/status',
    );
    return status.enabled && !!status.url;
  },
};
