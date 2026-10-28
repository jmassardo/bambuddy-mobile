import { projectsApi } from '@/api/projects';
import { makerworldApi } from '@/api/makerworld';
import { request, requestBlob, uploadFile } from '@/api/http';

jest.mock('@/api/http', () => ({
  request: jest.fn().mockResolvedValue({}),
  requestBlob: jest.fn().mockResolvedValue({}),
  uploadFile: jest.fn().mockResolvedValue({}),
}));

describe('current project and MakerWorld server contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('patches explicit parent removal and complete-set targets without losing nulls', async () => {
    await projectsApi.updateProject(3, { parent_id: null, target_sets: 5 });
    expect(request).toHaveBeenCalledWith('/projects/3', { method: 'PATCH', body: JSON.stringify({ parent_id: null, target_sets: 5 }) });
    await projectsApi.getProjectFileProgress(3);
    expect(request).toHaveBeenLastCalledWith('/projects/3/file-progress');
  });

  it('uses supported package, JSON and template endpoints', async () => {
    const file = { uri: 'file:///project.zip', name: 'project.zip', type: 'application/zip' };
    await projectsApi.importProjectFile(file);
    expect(uploadFile).toHaveBeenCalledWith('/projects/import/file', file);
    await projectsApi.exportProjectZip(9);
    expect(requestBlob).toHaveBeenCalledWith('/projects/9/export');
    await projectsApi.exportProjectJson(9);
    expect(request).toHaveBeenLastCalledWith('/projects/9/export?format=json');
    await projectsApi.importProject({ name: 'Restored', notes: '<b>Important</b>', bom_items: [{ name: 'Bolt' }] });
    expect(request).toHaveBeenLastCalledWith('/projects/import', { method: 'POST', body: JSON.stringify({ name: 'Restored', notes: '<b>Important</b>', bom_items: [{ name: 'Bolt' }] }) });
    await projectsApi.createTemplateFromProject(9);
    expect(request).toHaveBeenLastCalledWith('/projects/9/create-template', { method: 'POST' });
  });

  it('loads every archive page for project source selection without hiding sources after the first page', async () => {
    jest.mocked(request).mockResolvedValueOnce(Array.from({ length: 100 }, (_, id) => ({ id }))).mockResolvedValueOnce([{ id: 100 }]);
    const archives = await projectsApi.getAllProjectArchives(9);
    expect(archives).toHaveLength(101);
    expect(request).toHaveBeenNthCalledWith(1, '/projects/9/archives?limit=100&offset=0');
    expect(request).toHaveBeenNthCalledWith(2, '/projects/9/archives?limit=100&offset=100');
  });

  it('imports resolved model identity and deletes the resulting library file', async () => {
    const payload = { model_id: 23, instance_id: 45, profile_id: 67, folder_id: 89 };
    await makerworldApi.importInstance(payload);
    expect(request).toHaveBeenCalledWith('/makerworld/import', { method: 'POST', body: JSON.stringify(payload) });
    await makerworldApi.deleteImport(91);
    expect(request).toHaveBeenLastCalledWith('/library/files/91', { method: 'DELETE' });
  });
});
