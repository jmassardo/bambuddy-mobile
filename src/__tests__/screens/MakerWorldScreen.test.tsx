import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MakerWorldScreen from '@/screens/MakerWorldScreen';
import { api } from '@/api/client';
import { makerworldApi } from '@/api/makerworld';

const mockNavigation = { setOptions: jest.fn(), dispatch: jest.fn(), navigate: jest.fn() };
const mockToast = jest.fn();
let mockPermissions: Set<string> | null = null;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('@/api/client', () => ({
  api: {
    getMakerworldStatus: jest.fn(),
    getMakerworldRecentImports: jest.fn(),
    resolveMakerworldUrl: jest.fn(),
    getLibraryFolders: jest.fn(),
    getLibraryFileThumbnailUrl: jest.fn(() => 'https://server/thumbnail'),
  },
}));
jest.mock('@/api/makerworld', () => ({ makerworldApi: { importInstance: jest.fn(), deleteImport: jest.fn() } }));
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: { openURL: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: (permission: string) => mockPermissions === null || mockPermissions.has(permission) }) }));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/components/files/SliceModal', () => {
  const ReactModule = require('react');
  const { Text: MockText } = require('react-native');
  return {
    SliceModal: ({ sourceId, sourceName }: { sourceId: number; sourceName: string }) => ReactModule.createElement(MockText, null, `Slicer ${sourceId}: ${sourceName}`),
  };
});

const resolvedModel = {
  model_id: 123,
  design: { title: 'Current model' },
  instances: [
    { id: 11, profileId: 21, title: 'First plate' },
    { id: 12, profileId: 22, title: 'Second plate' },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><MakerWorldScreen /></QueryClientProvider>);
  return { ...screen, client };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = null;
  jest.mocked(api.getMakerworldStatus).mockResolvedValue({ can_download: true, has_cloud_token: true });
  jest.mocked(api.getMakerworldRecentImports).mockResolvedValue([]);
  jest.mocked(api.getLibraryFolders).mockResolvedValue([{ id: 7, name: 'Root', children: [{ id: 8, name: 'Nested', children: [] }] }] as never);
  jest.mocked(api.resolveMakerworldUrl).mockResolvedValue(resolvedModel as never);
  jest.mocked(makerworldApi.importInstance).mockImplementation(async payload => ({
    library_file_id: payload.profile_id ?? 1, filename: `plate-${payload.profile_id}.3mf`,
    folder_id: payload.folder_id, profile_id: payload.profile_id, was_existing: false,
  }));
  jest.mocked(makerworldApi.deleteImport).mockResolvedValue(undefined);
});

it('clears stale previews immediately and discards a late resolve after input changes', async () => {
  const screen = await setup();
  const input = screen.getByPlaceholderText('https://makerworld.com/models/...');
  await fireEvent.changeText(input, 'https://makerworld.com/models/123');
  await fireEvent.press(screen.getByText('Resolve model'));
  await screen.findByText('Current model');
  await fireEvent.changeText(input, 'https://makerworld.com/models/456');
  expect(screen.queryByText('Current model')).toBeNull();
  expect(screen.queryByText('Import')).toBeNull();

  const late = deferred<typeof resolvedModel>();
  jest.mocked(api.resolveMakerworldUrl).mockReturnValueOnce(late.promise as never);
  await fireEvent.press(screen.getByText('Resolve model'));
  await fireEvent.changeText(input, 'https://makerworld.com/models/789');
  await act(async () => late.resolve(resolvedModel));
  expect(screen.queryByText('Current model')).toBeNull();
  expect(makerworldApi.importInstance).not.toHaveBeenCalled();
});

it('imports the current model to a nested destination and exposes library, slicer, source and confirmed undo actions', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await setup();
  await fireEvent.changeText(screen.getByPlaceholderText('https://makerworld.com/models/...'), 'https://makerworld.com/models/123');
  await fireEvent.press(screen.getByText('Resolve model'));
  await screen.findByText('Current model');
  await fireEvent.press(screen.getByText('Destination: Auto (MakerWorld folder)'));
  await fireEvent.press(await screen.findByText('— Nested'));
  await fireEvent.press(screen.getAllByText('Import and slice')[0]);
  await screen.findByText('Slicer 21: plate-21.3mf');
  expect(makerworldApi.importInstance).toHaveBeenCalledWith({ model_id: 123, instance_id: 11, profile_id: 21, folder_id: 8 });
  await fireEvent.press(screen.getByText('View in Library'));
  expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({
    type: 'POP_TO', payload: expect.objectContaining({ name: 'Main', params: { screen: 'Files', params: { fileId: 21, folderId: 8 } } }),
  }));
  await fireEvent.press(screen.getByText('Open source'));
  expect(Linking.openURL).toHaveBeenCalledWith('https://makerworld.com/models/123#profileId-21');
  await fireEvent.press(screen.getByText('Undo / delete import'));
  expect(makerworldApi.deleteImport).not.toHaveBeenCalled();
  const buttons = alert.mock.calls.at(-1)?.[2];
  expect(alert.mock.calls.at(-1)?.[1]).toContain('plate-21.3mf');
  await act(async () => buttons?.find(button => button.style === 'destructive')?.onPress?.());
  await waitFor(() => expect(makerworldApi.deleteImport).toHaveBeenCalledWith(21));
  await waitFor(() => expect(screen.queryByText('Imported successfully')).toBeNull());
  alert.mockRestore();
});

it('bulk imports sequentially, continues after failure, blocks competing imports and retries only failures', async () => {
  const first = deferred<Awaited<ReturnType<typeof makerworldApi.importInstance>>>();
  jest.mocked(makerworldApi.importInstance)
    .mockReturnValueOnce(first.promise)
    .mockRejectedValueOnce(new Error('Cloud unavailable'));
  const screen = await setup();
  await fireEvent.changeText(screen.getByPlaceholderText('https://makerworld.com/models/...'), 'https://makerworld.com/models/123');
  await fireEvent.press(screen.getByText('Resolve model'));
  await screen.findByText('Current model');
  await fireEvent.press(screen.getByText('Import all / retry failed'));
  await screen.findByText('Importing 0 / 2');
  expect(makerworldApi.importInstance).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getAllByLabelText('Importing…')[0]);
  expect(makerworldApi.importInstance).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve({ library_file_id: 21, filename: 'first.3mf', profile_id: 21, folder_id: null, was_existing: true }));
  await screen.findByText('Profile 22: Cloud unavailable');
  await screen.findByText('Already in Library — existing file reused');
  expect(makerworldApi.importInstance).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import all / retry failed' })).toBeEnabled());
  await fireEvent.press(screen.getByText('Import all / retry failed'));
  await screen.findByText('plate-22.3mf');
  expect(makerworldApi.importInstance).toHaveBeenCalledTimes(3);
  expect(jest.mocked(makerworldApi.importInstance).mock.calls[2][0].profile_id).toBe(22);
});

it('gives recent imported assets working native library and slice actions without resolving again', async () => {
  jest.mocked(api.getMakerworldRecentImports).mockResolvedValue([{
    library_file_id: 99, filename: 'recent.3mf', folder_id: 8, source_url: 'https://makerworld.com/models/123',
  }] as never);
  const screen = await setup();
  await screen.findByText('recent.3mf');
  await fireEvent.press(screen.getByText('Slice'));
  await screen.findByText('Slicer 99: recent.3mf');
  await fireEvent.press(screen.getByText('View in Library'));
  expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ params: { screen: 'Files', params: { fileId: 99, folderId: 8 } } }),
  }));
  expect(api.resolveMakerworldUrl).not.toHaveBeenCalled();
});

it('keeps browsing available but blocks individual and bulk imports without import permission', async () => {
  mockPermissions = new Set(['makerworld:view', 'library:read']);
  const screen = await setup();
  await fireEvent.changeText(screen.getByPlaceholderText('https://makerworld.com/models/...'), 'https://makerworld.com/models/123');
  await fireEvent.press(screen.getByText('Resolve model'));
  await screen.findByText('Current model');
  expect(screen.getAllByRole('button', { name: 'Import' })[0]).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Import all / retry failed' })).toBeDisabled();
  expect(screen.queryByText('Import and slice')).toBeNull();
  expect(makerworldApi.importInstance).not.toHaveBeenCalled();
});
