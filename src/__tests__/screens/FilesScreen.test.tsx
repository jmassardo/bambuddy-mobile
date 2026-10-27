import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FilesScreen from '@/screens/FilesScreen';
import { api } from '@/api/client';
import { filesApi } from '@/api/files';

type LibraryDestination = {folderId?: number; fileId?: number; projectId?: number};
const mockNavigation = {setOptions: jest.fn(), dispatch: jest.fn()};
const mockRoute: {key: string; params?: LibraryDestination} = {key: 'files'};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation, useRoute: () => mockRoute,
  CommonActions: {setParams: (params: Record<string, number | undefined>) => ({type: 'SET_PARAMS', payload: {params}})},
}));
jest.mock('@/api/client', () => ({api: {
  getLibraryFiles: jest.fn(async () => [{id: 7, filename: 'widget.stl', file_type: 'stl', created_by_username: 'Alex'}, {id: 10, filename: 'another.stl', file_type: 'stl', created_by_username: 'Bea'}]),
  getLibraryFolders: jest.fn(async () => [{id: 1, name: 'Models', parent_id: null, file_count: 2, children: [{id: 2, name: 'Deep', parent_id: 1, children: []}]}]),
  getLibraryTrash: jest.fn(async () => ({items: [{id: 8, filename: 'deleted.stl', deleted_at: '2026-01-01', auto_purge_at: '2026-02-01'}, {id: 9, filename: 'other.stl'}], total: 2, retention_days: 31})),
  getLibraryTags: jest.fn(async () => [{id: 2, name: 'red'}]), getExternalFolders: jest.fn(async () => []),
  getPendingUploads: jest.fn(async () => []), getLibraryFileThumbnailUrl: () => '',
  restoreLibraryItem: jest.fn(async () => {}), permanentDeleteLibraryItem: jest.fn(async () => {}),
  emptyLibraryTrash: jest.fn(async () => {}), renameLibraryItem: jest.fn(async () => ({})),
  bulkAssignLibraryTags: jest.fn(async () => ({})), getLibraryFilePlates: jest.fn(async () => ({plates: []})),
}}));
jest.mock('@/api/files', () => ({filesApi: {
  updateLibraryFolder: jest.fn(async () => ({})),
  getLibraryFolderReadme: jest.fn(async () => null),
  getLibraryFile: jest.fn(async (id: number) => ({id, filename: 'widget.stl', file_type: 'stl'})),
}}));
jest.mock('@/contexts/AuthContext', () => ({useAuth: () => ({hasPermission: () => true, hasAnyPermission: () => true, authEnabled: false})}));
jest.mock('@/contexts/ToastContext', () => ({useToast: () => ({showToast: jest.fn()})}));
jest.mock('@/theme', () => ({useTheme: () => ({colors: new Proxy({}, {get: () => '#888888'})})}));
jest.mock('@/components/files/FileUploadModal', () => ({FileUploadModal: () => null}));
jest.mock('@/components/files/SliceModal', () => ({SliceModal: () => null}));
jest.mock('@/components/printers/PrintModal', () => ({PrintModal: () => null}));
jest.mock('@/components/files/LibraryPolicy', () => ({LibraryPolicy: () => null}));
jest.mock('@/components/files/LibraryFileDetails', () => ({LibraryFileDetails: () => null}));
jest.mock('@/components/files/FolderAssociation', () => ({FolderAssociation: () => null}));
jest.mock('@/components/files/FolderReadme', () => ({FolderReadme: () => null}));
jest.mock('@/components/files/AssetPreviewModal', () => ({AssetPreviewModal: () => null, inferPreviewMode: () => 'model'}));
jest.mock('@/components/common/ConfirmModal', () => {
  const {Pressable, Text, View} = require('react-native');
  return {ConfirmModal: ({visible, title, onClose, onConfirm}: {visible: boolean; title: string; onClose: () => void; onConfirm: () => void}) => visible ? <View><Text>{title}</Text><Pressable onPress={onClose}><Text>Cancel confirmation</Text></Pressable><Pressable onPress={onConfirm}><Text>Confirm irreversible action</Text></Pressable></View> : null};
});
function TestProviders({children}: {children: React.ReactNode}) {
  const [client] = React.useState(() => new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}, mutations: {retry: false, gcTime: Infinity}}}));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.params = undefined;
  mockNavigation.dispatch.mockImplementation((action: {type: string; payload?: {params: LibraryDestination}}) => {
    if (action.type === 'SET_PARAMS') mockRoute.params = {...mockRoute.params, ...action.payload?.params};
  });
});

test('trash displays envelope items and requires confirmation before permanent deletion', async () => {
  const result = await render(<FilesScreen />, {wrapper: TestProviders});
  await result.findByText('Open trash');
  await fireEvent.press(result.getByText('Open trash'));
  await result.findByText('deleted.stl');
  expect(result.getByText('31 days retention')).toBeTruthy();
  await fireEvent.press(result.getAllByText('Delete')[0]);
  expect(api.permanentDeleteLibraryItem).not.toHaveBeenCalled();
  await fireEvent.press(result.getByText('Cancel confirmation'));
  expect(api.permanentDeleteLibraryItem).not.toHaveBeenCalled();
  await fireEvent.press(result.getAllByText('Delete')[0]);
  await fireEvent.press(result.getByText('Confirm irreversible action'));
  await waitFor(() => expect(api.permanentDeleteLibraryItem).toHaveBeenCalledWith(8));
});

test('selected trash subset can be restored without emptying all trash', async () => {
  const result = await render(<FilesScreen />, {wrapper: TestProviders});
  await result.findByText('Open trash');
  await fireEvent.press(result.getByText('Open trash'));
  await result.findByText('deleted.stl');
  await fireEvent.press(result.getByText('Select deleted.stl'));
  await fireEvent.press(result.getByText('Restore selected (1)'));
  await waitFor(() => expect(api.restoreLibraryItem).toHaveBeenCalledWith(8));
  expect(api.restoreLibraryItem).not.toHaveBeenCalledWith(9);
  expect(api.emptyLibraryTrash).not.toHaveBeenCalled();
});

test('folder rename calls its folder endpoint rather than file rename', async () => {
  const result = await render(<FilesScreen />, {wrapper: TestProviders});
  await result.findByText('widget.stl');
  await fireEvent.press(result.getAllByText('Rename')[0]);
  const field = result.getByDisplayValue('Models');
  await fireEvent.changeText(field, 'Renamed folder');
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() => expect(filesApi.updateLibraryFolder).toHaveBeenCalledWith(1, {name: 'Renamed folder'}));
  expect(api.renameLibraryItem).not.toHaveBeenCalled();
});

test('bulk tag Add and Remove never silently replace other selected-file tags', async () => {
  const result = await render(<FilesScreen />, {wrapper: TestProviders});
  await result.findByText('widget.stl');
  await fireEvent(result.getByText('widget.stl'), 'longPress');
  await fireEvent(result.getByText('another.stl'), 'longPress');
  const tags = result.getAllByText('Tags');
  await fireEvent.press(tags[tags.length - 1]);
  await fireEvent.press(result.getByText('red'));
  await fireEvent.press(result.getByText('Save tags'));
  await waitFor(() => expect(api.bulkAssignLibraryTags).toHaveBeenCalledWith([7, 10], [2], 'add'));
  const tagsAgain = result.getAllByText('Tags');
  await fireEvent.press(tagsAgain[tagsAgain.length - 1]);
  await fireEvent.press(result.getByText('Remove selected tags'));
  await fireEvent.press(result.getByText('red'));
  await fireEvent.press(result.getByText('Save tags'));
  await waitFor(() => expect(api.bulkAssignLibraryTags).toHaveBeenCalledWith([7, 10], [2], 'remove'));
});

test('the same linked folder can be opened again after browsing elsewhere on the persistent Files tab', async () => {
  mockRoute.params = {folderId: 2};
  const result = await render(<FilesScreen />, {wrapper: TestProviders});
  await result.findByText('Deep');
  await fireEvent.press(result.getByText('Library'));
  await waitFor(() => expect(result.queryByText('Deep')).toBeNull());

  mockRoute.params = {folderId: 2};
  await result.rerender(<FilesScreen />);
  await result.findByText('Deep');
  expect(mockNavigation.dispatch).toHaveBeenLastCalledWith({
    type: 'SET_PARAMS', source: 'files',
    payload: {params: {folderId: undefined, fileId: undefined, projectId: undefined}},
  });
});

test('the same linked file can be reopened after closing its details on the persistent Files tab', async () => {
  mockRoute.params = {fileId: 7};
  const result = await render(<FilesScreen />, {wrapper: TestProviders});
  await result.findByText('File details');
  await fireEvent.press(result.getByText('Close'));
  expect(result.queryByText('File details')).toBeNull();

  mockRoute.params = {fileId: 7};
  await result.rerender(<FilesScreen />);
  await result.findByText('File details');
  expect(filesApi.getLibraryFile).toHaveBeenCalledTimes(2);
  expect(filesApi.getLibraryFile).toHaveBeenLastCalledWith(7);
});
