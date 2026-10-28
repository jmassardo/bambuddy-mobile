import { translateNative } from '@/i18n';
import { pickNumber, type ApiRecord } from '@/utils/data';
import type { MakerworldImportRequest } from '@/types/api';

export function makerworldImportRequest(
  resolved: ApiRecord | null,
  resolvedForUrl: string,
  currentUrl: string,
  instance: ApiRecord,
  folderId: number | null,
): MakerworldImportRequest {
  const modelId = pickNumber(resolved, ['model_id'], NaN);
  if (!resolved || !resolvedForUrl.trim() || resolvedForUrl.trim() !== currentUrl.trim() || !Number.isInteger(modelId) || modelId <= 0) {
    throw new Error(translateNative('native.f6b5f31ef47f184f'));
  }
  const instanceId = pickNumber(instance, ['id'], NaN);
  const profileId = pickNumber(instance, ['profileId'], NaN);
  return {
    model_id: modelId,
    instance_id: Number.isFinite(instanceId) ? instanceId : null,
    profile_id: Number.isFinite(profileId) ? profileId : null,
    folder_id: folderId,
  };
}

export function makerworldDestinations(nodes: ApiRecord[], depth = 0): Array<{ folder: ApiRecord; depth: number }> {
  return nodes.flatMap(folder => {
    if (folder.is_external && folder.external_readonly) return [];
    const children = Array.isArray(folder.children) ? folder.children as ApiRecord[] : [];
    return [{ folder, depth }, ...makerworldDestinations(children, depth + 1)];
  });
}
