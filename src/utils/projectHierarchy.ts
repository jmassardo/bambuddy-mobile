import { pickNumber, pickString, type ApiRecord } from '@/utils/data';
import type { ProjectFileProgress } from '@/types/api';

export function eligibleParents(projects: ApiRecord[], projectId?: number) {
  const excluded = new Set<number>(projectId === undefined ? [] : [projectId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const project of projects) {
      const id = pickNumber(project, ['id']);
      if (project.parent_id != null && excluded.has(Number(project.parent_id)) && !excluded.has(id)) {
        excluded.add(id);
        changed = true;
      }
    }
  }
  return projects.filter(project => !excluded.has(pickNumber(project, ['id'])) && !project.is_template);
}

export function projectTree(
  projects: ApiRecord[],
  expanded: Set<number>,
  matches: Set<number> = new Set(projects.map(project => pickNumber(project, ['id']))),
  searching = false,
) {
  const byId = new Map(projects.map(project => [pickNumber(project, ['id']), project]));
  const included = new Set(matches);
  for (const id of matches) {
    const seen = new Set<number>();
    let node = byId.get(id);
    while (node?.parent_id != null && !seen.has(Number(node.parent_id))) {
      const parentId = Number(node.parent_id);
      seen.add(parentId);
      if (!byId.has(parentId)) break;
      included.add(parentId);
      node = byId.get(parentId);
    }
  }
  const rows: Array<{ project: ApiRecord; depth: number; hasChildren: boolean }> = [];
  const visited = new Set<number>();
  const walk = (project: ApiRecord, depth: number) => {
    const id = pickNumber(project, ['id']);
    if (visited.has(id) || !included.has(id)) return;
    visited.add(id);
    const children = projects.filter(child => child.parent_id != null && Number(child.parent_id) === id);
    rows.push({ project, depth, hasChildren: children.length > 0 });
    if (searching || expanded.has(id)) children.forEach(child => walk(child, depth + 1));
  };
  projects.filter(project => project.parent_id == null || !byId.has(Number(project.parent_id)))
    .forEach(project => walk(project, 0));
  return rows;
}

export function isPrintableProjectFile(file: ApiRecord) {
  const type = pickString(file, ['file_type']).toLowerCase();
  return ['gcode', 'gcode.3mf', 'gcode_3mf'].includes(type) ||
    /\.gcode(?:\.3mf)?$/i.test(pickString(file, ['filename']));
}

export function completeProjectSets(files: ApiRecord[], progress: ProjectFileProgress[], target: number) {
  const counts = new Map(progress.map(row => [row.file_id, row.completed_count]));
  const printable = files.filter(isPrintableProjectFile);
  if (!target || !printable.length) return null;
  return printable.reduce((minimum, file) =>
    Math.min(minimum, counts.get(pickNumber(file, ['id'])) ?? 0), target);
}
