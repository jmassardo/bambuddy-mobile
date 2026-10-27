import { buildMediaUrl, request } from './http';
import type {
  PrintLaunchCostCenter,
  PrintLaunchInventory,
  PrintLaunchPlate,
  PrintLaunchRequirement,
} from '@/types/api';

export type PrintSource = { kind: 'library' | 'archive'; id: number };
function path(source: PrintSource) {
  return source.kind === 'library'
    ? `/library/files/${source.id}`
    : `/archives/${source.id}`;
}

export const printLaunchApi = {
  metadata: (source: PrintSource) =>
    request<Record<string, unknown>>(path(source)),
  plates: (source: PrintSource) =>
    request<{ is_multi_plate: boolean; plates: PrintLaunchPlate[] }>(
      `${path(source)}/plates`,
    ),
  requirements: (source: PrintSource, plateId?: number | null) =>
    request<{ filaments: PrintLaunchRequirement[] }>(
      `${path(source)}/filament-requirements${
        plateId != null ? `?plate_id=${plateId}` : ''
      }`,
    ),
  plateThumbnail: (source: PrintSource, plate: number) =>
    buildMediaUrl(
      source.kind === 'library'
        ? `${path(source)}/plate-thumbnail/${plate}`
        : `${path(source)}/plates/${plate}/thumbnail`,
    ),
  inventory: (printerId: number) =>
    request<PrintLaunchInventory>(`/printers/${printerId}/inventory-remain`),
  costCenters: () =>
    request<PrintLaunchCostCenter[]>('/finance/cost-centers/mine'),
  availableFilaments: (model: string, location?: string) =>
    request<Array<{ type: string; color: string; tray_info_idx?: string }>>(
      `/printers/available-filaments?${new URLSearchParams({
        model,
        ...(location ? { location } : {}),
      })}`,
    ),
};
