import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { pick } from '@react-native-documents/picker';
import { FileUploadModal } from '@/components/files/FileUploadModal';
import { FileItem } from '@/components/files/FileItem';
import { LibraryPolicy } from '@/components/files/LibraryPolicy';
import { LibraryFolderTree } from '@/components/files/LibraryFolderTree';
import { filesApi } from '@/api/files';

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(), types: {allFiles: '*/*'}, isErrorWithCode: () => false, errorCodes: {OPERATION_CANCELED: 'CANCEL'},
}));
jest.mock('@/api/client', () => ({api: {getLibraryFileThumbnailUrl: () => ''}}));
jest.mock('@/api/files', () => ({filesApi: {
  uploadLibraryFile: jest.fn(), getLibraryTrashSettings: jest.fn(), saveLibraryTrashSettings: jest.fn(),
}}));
jest.mock('@/contexts/AuthContext', () => ({useAuth: () => ({hasPermission: () => true})}));
jest.mock('@/contexts/ToastContext', () => ({useToast: () => ({showToast: jest.fn()})}));
jest.mock('@/theme', () => ({useTheme: () => ({colors: new Proxy({}, {get: () => '#888888'})})}));

function TestProviders({children}: {children: React.ReactNode}) {
  const [client] = React.useState(() => new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}, mutations: {retry: false, gcTime: Infinity}}}));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => jest.clearAllMocks());

test('file rename/download and folder-specific actions are reachable', async () => {
  const rename = jest.fn(), download = jest.fn(), link = jest.fn();
  const result = await render(<FileItem item={{id: 2, filename: 'part.stl'}} onPress={jest.fn()} onRename={rename} onDownload={download} />);
  await fireEvent.press(result.getByText('Rename')); await fireEvent.press(result.getByText('Download'));
  expect(rename).toHaveBeenCalledTimes(1); expect(download).toHaveBeenCalledTimes(1);
  await result.rerender(<FileItem item={{id: 2, name: 'Models', is_folder: true}} onPress={jest.fn()} onRename={rename} onLink={link} onDownload={download} />);
  expect(result.queryByText('Download')).toBeNull();
  await fireEvent.press(result.getByText('Link')); expect(link).toHaveBeenCalledTimes(1);
});

test('multi-file uploads can remove pending files and retry only failed uploads', async () => {
  jest.mocked(pick).mockResolvedValue([
    {uri: 'file:///a.stl', name: 'a.stl', type: 'model/stl', size: 10, isVirtual: false, hasRequestedType: true, nativeType: 'model/stl', error: null, convertibleToMimeTypes: null, bookmarkStatus: 'success', bookmark: 'a'},
    {uri: 'file:///b.stl', name: 'b.stl', type: 'model/stl', size: 10, isVirtual: false, hasRequestedType: true, nativeType: 'model/stl', error: null, convertibleToMimeTypes: null, bookmarkStatus: 'success', bookmark: 'b'},
    {uri: 'file:///c.stl', name: 'c.stl', type: 'model/stl', size: 10, isVirtual: false, hasRequestedType: true, nativeType: 'model/stl', error: null, convertibleToMimeTypes: null, bookmarkStatus: 'success', bookmark: 'c'},
  ]);
  jest.mocked(filesApi.uploadLibraryFile).mockResolvedValueOnce({id: 1}).mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce({id: 2});
  const result = await render(<FileUploadModal visible onClose={jest.fn()} />, {wrapper: TestProviders});
  await fireEvent.press(result.getByText('Choose files'));
  await waitFor(() => expect(result.getAllByText('Remove from upload list')).toHaveLength(3));
  await fireEvent.press(result.getAllByText('Remove from upload list')[2]);
  await fireEvent.press(result.getByText('Upload'));
  await waitFor(() => expect(result.getByText(/Network failed/)).toBeTruthy());
  expect(filesApi.uploadLibraryFile).toHaveBeenCalledTimes(2);
  await fireEvent.press(result.getByText('Upload'));
  await waitFor(() => expect(filesApi.uploadLibraryFile).toHaveBeenCalledTimes(3));
  expect(jest.mocked(filesApi.uploadLibraryFile).mock.calls[2][0].name).toBe('b.stl');
  expect(jest.mocked(filesApi.uploadLibraryFile).mock.calls.map(call => call[0].name)).not.toContain('c.stl');
});

test('saving retention preserves independent automatic purge settings', async () => {
  jest.mocked(filesApi.getLibraryTrashSettings).mockResolvedValue({retention_days: 30, auto_purge_enabled: true, auto_purge_days: 177, auto_purge_include_never_printed: false});
  const result = await render(<LibraryPolicy />, {wrapper: TestProviders});
  const field = await result.findByDisplayValue('30');
  await fireEvent.changeText(field, '47');
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() => expect(filesApi.saveLibraryTrashSettings).toHaveBeenCalledWith({retention_days: 47, auto_purge_enabled: true, auto_purge_days: 177, auto_purge_include_never_printed: false}));
});

test('expanded folder branches survive parent renders and still navigate to deeply nested destinations', async () => {
  const choose = jest.fn();
  const tree = [{id: 1, name: 'Models', children: [{id: 2, name: 'Deep', children: [{id: 3, name: 'Destination'}]}]}];
  const result = await render(<LibraryFolderTree tree={tree} sort="name" ascending collapsed wrap onChoose={choose} />);
  await fireEvent.press(result.getByLabelText('Expand or collapse Models'));
  await fireEvent.press(result.getByLabelText('Expand or collapse Deep'));
  await result.rerender(<LibraryFolderTree tree={[...tree]} sort="name" ascending collapsed wrap onChoose={choose} />);
  await fireEvent.press(result.getByText('Destination'));
  expect(choose).toHaveBeenCalledWith(3);
});
