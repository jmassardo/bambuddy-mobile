import { filesApi } from '@/api/files';
import { request, uploadFileWithProgress } from '@/api/http';

jest.mock('@/api/http', () => ({
  ApiError: class ApiError extends Error {},
  request: jest.fn(), uploadFileWithProgress: jest.fn(),
  uploadFile: jest.fn(), requestBlob: jest.fn(), requestTextWithFallback: jest.fn(),
  requestWithFallback: jest.fn(), buildMediaUrl: (path: string) => path,
}));
const mockedRequest = jest.mocked(request);
beforeEach(() => jest.clearAllMocks());

test('renames files with filename and uses folder identity for folder changes', async () => {
  await filesApi.renameLibraryItem(5, 'part.stl');
  await filesApi.updateLibraryFolder(5, {name: 'Parts', project_id: 8, archive_id: 0});
  await filesApi.deleteLibraryFolder(5);
  expect(mockedRequest).toHaveBeenNthCalledWith(1, '/library/files/5', {method: 'PUT', body: JSON.stringify({filename: 'part.stl'})});
  expect(mockedRequest).toHaveBeenNthCalledWith(2, '/library/folders/5', {method: 'PUT', body: JSON.stringify({name: 'Parts', project_id: 8, archive_id: 0})});
  expect(mockedRequest).toHaveBeenNthCalledWith(3, '/library/folders/5', {method: 'DELETE'});
});

test('search sends recursive and repeated tag IDs without dropping folder scope', async () => {
  await filesApi.getLibraryFiles(12, true, undefined, {recursive: true, tagIds: [2, 8]});
  expect(mockedRequest).toHaveBeenCalledWith('/library/files?folder_id=12&recursive=true&tag_ids=2&tag_ids=8');
});

test('ZIP upload applies hierarchy, folder and thumbnail options to the extract route', async () => {
  const file = {uri: 'file:///models.zip', name: 'models.zip', type: 'application/zip'};
  const progress = jest.fn();
  await filesApi.uploadLibraryFile(file, 8, progress, {preserveStructure: false, createFolderFromZip: true, generateThumbnails: false});
  expect(uploadFileWithProgress).toHaveBeenCalledWith('/library/files/extract-zip?folder_id=8&generate_stl_thumbnails=false&preserve_structure=false&create_folder_from_zip=true', file, progress);
});

test('trash consumes the envelope and continues past the server page limit', async () => {
  mockedRequest.mockResolvedValueOnce({items: [{id: 1}], total: 3, retention_days: 14})
    .mockResolvedValueOnce({items: [{id: 2}, {id: 3}], total: 3, retention_days: 14});
  await expect(filesApi.getLibraryTrash()).resolves.toEqual({items: [{id: 1}, {id: 2}, {id: 3}], total: 3, retention_days: 14});
  expect(mockedRequest).toHaveBeenNthCalledWith(2, '/library/trash?limit=500&offset=1');
});

test('combining and version grouping use real request envelopes', async () => {
  await filesApi.combineLibraryFiles({items: [{file_id: 7, copies: 3}], filename: 'three.3mf', folder_id: null});
  await filesApi.groupLibraryVersions([2, 4], 'Same job');
  expect(mockedRequest).toHaveBeenNthCalledWith(1, '/library/files/combine', {method: 'POST', body: JSON.stringify({items: [{file_id: 7, copies: 3}], filename: 'three.3mf', folder_id: null})});
  expect(mockedRequest).toHaveBeenNthCalledWith(2, '/library/variant-groups', {method: 'POST', body: JSON.stringify({name: 'Same job', members: [{library_file_id: 2}, {library_file_id: 4}]})});
});
