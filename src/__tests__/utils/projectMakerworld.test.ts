import { completeProjectSets, eligibleParents, projectTree } from '@/utils/projectHierarchy';
import { makerworldDestinations, makerworldImportRequest } from '@/utils/makerworld';
import { openLibrary } from '@/utils/libraryNavigation';
import { StackActions } from '@react-navigation/native';

const projects = [
  { id: 1, name: 'Root', parent_id: null },
  { id: 2, name: 'Child', parent_id: 1 },
  { id: 3, name: 'Grandchild', parent_id: 2 },
  { id: 4, name: 'Other', parent_id: null },
  { id: 5, name: 'Template', is_template: true },
];

describe('project hierarchy and production', () => {
  it('excludes self and every descendant from eligible parents, retaining ancestors and unrelated branches', () => {
    expect(eligibleParents(projects, 1).map(project => project.id)).toEqual([4]);
    expect(eligibleParents(projects, 2).map(project => project.id)).toEqual([1, 4]);
    expect(eligibleParents(projects).map(project => project.id)).toEqual([1, 2, 3, 4]);
  });

  it('expands branches recursively and reveals matching descendants with ancestors during search', () => {
    expect(projectTree(projects, new Set()).map(row => row.project.id)).toEqual([1, 4, 5]);
    expect(projectTree(projects, new Set([1, 2])).map(row => [row.project.id, row.depth])).toEqual([[1, 0], [2, 1], [3, 2], [4, 0], [5, 0]]);
    expect(projectTree(projects, new Set(), new Set([3]), true).map(row => row.project.id)).toEqual([1, 2, 3]);
  });

  it('uses the limiting sliced file, counts missing progress as zero, excludes source models, and caps sets at target', () => {
    const files = [{ id: 1, file_type: 'gcode' }, { id: 2, filename: 'part.gcode.3mf' }, { id: 3, file_type: '3mf', filename: 'source.3mf' }];
    expect(completeProjectSets(files, [{ file_id: 1, completed_count: 7 }], 5)).toBe(0);
    expect(completeProjectSets(files, [{ file_id: 1, completed_count: 7 }, { file_id: 2, completed_count: 3 }], 5)).toBe(3);
    expect(completeProjectSets(files, [{ file_id: 1, completed_count: 7 }, { file_id: 2, completed_count: 9 }], 5)).toBe(5);
    expect(completeProjectSets([files[2]], [], 5)).toBeNull();
  });

  it('opens the actual native Files tab with precise location and association params', () => {
    const dispatch = jest.fn();
    openLibrary({ dispatch }, { folderId: 3, fileId: 9, projectId: 4 });
    expect(dispatch).toHaveBeenCalledWith(StackActions.popTo('Main', { screen: 'Files', params: { folderId: 3, fileId: 9, projectId: 4 } }));
  });
});

describe('MakerWorld import source and destination', () => {
  it('requires current resolved identity, allows surrounding whitespace and sends upstream identifiers, not URL or plate offsets', () => {
    const resolved = { model_id: 100 };
    expect(makerworldImportRequest(resolved, 'url-a', ' url-a ', { id: 7, profileId: 8 }, 42)).toEqual({
      model_id: 100, instance_id: 7, profile_id: 8, folder_id: 42,
    });
    expect(() => makerworldImportRequest(resolved, 'url-a', 'url-b', { id: 7 }, null)).toThrow('Resolve the current');
    expect(() => makerworldImportRequest(null, '', 'url-a', { id: 7 }, null)).toThrow();
    expect(makerworldImportRequest(resolved, 'url-a', 'url-a', {}, null)).toEqual({
      model_id: 100, instance_id: null, profile_id: null, folder_id: null,
    });
  });

  it('flattens all nested eligible destinations and excludes entire read-only external subtrees', () => {
    expect(makerworldDestinations([
      { id: 1, children: [{ id: 2, children: [{ id: 3 }] }] },
      { id: 4, is_external: true, external_readonly: true, children: [{ id: 5 }] },
      { id: 6, is_external: true, external_readonly: false },
    ]).map(row => [row.folder.id, row.depth])).toEqual([[1, 0], [2, 1], [3, 2], [6, 0]]);
  });
});
