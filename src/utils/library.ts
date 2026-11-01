import { isRecord, pickArray, pickNumber, pickString, type ApiRecord } from './data';

export interface FolderDestination {
  id: number | null;
  name: string;
  readonly?: boolean;
}

export function folderDestinations(tree: ApiRecord[], prefix = ''): FolderDestination[] {
  return tree.flatMap(node => {
    const name = `${prefix}${pickString(node, ['name'])}`;
    return [
      { id: pickNumber(node, ['id']), name, readonly: Boolean(node.external_readonly) },
      ...folderDestinations(pickArray(node, ['children']).filter(isRecord), `${name} / `),
    ];
  });
}

export function folderPath(tree: ApiRecord[], id: number): Array<{id: number; name: string}> | null {
  for (const node of tree) {
    const segment = { id: pickNumber(node, ['id']), name: pickString(node, ['name']) };
    if (segment.id === id) return [segment];
    const child = folderPath(pickArray(node, ['children']).filter(isRecord), id);
    if (child) return [segment, ...child];
  }
  return null;
}

export function validDays(value: string, min = 1, max = 3650): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

export function canGroupVersions(files: ApiRecord[]): boolean {
  if (files.length < 2) return false;
  const models = new Set<string>();
  return files.every(file => {
    const type = pickString(file, ['file_type']);
    const model = pickString(file, ['sliced_for_model']).trim().toLowerCase();
    if (!['gcode', 'gcode.3mf'].includes(type) || file.variant_group_id || !model || models.has(model)) return false;
    models.add(model);
    return true;
  });
}
