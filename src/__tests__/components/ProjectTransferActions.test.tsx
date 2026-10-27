import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { pick } from '@react-native-documents/picker';
import { ProjectTransferActions, importProjectDocument } from '@/components/projects/ProjectTransferActions';
import { projectsApi } from '@/api/projects';
import { shareBlob } from '@/utils/share';

const mockToast = jest.fn();
let mockDocument = '';
const originalFetch = globalThis.fetch;
const originalReader = globalThis.FileReader;
const originalBlob = globalThis.Blob;
const mockBlobParts: unknown[][] = [];

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(), types: { allFiles: '*/*' }, errorCodes: { OPERATION_CANCELED: 'CANCEL' },
  isErrorWithCode: (error: { code?: string }) => typeof error?.code === 'string',
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/api/projects', () => ({
  projectsApi: {
    importProject: jest.fn(), importProjectFile: jest.fn(), getProjects: jest.fn(),
    exportProjectJson: jest.fn(), exportProjectZip: jest.fn(),
  },
}));
jest.mock('@/utils/share', () => ({ shareBlob: jest.fn() }));

beforeAll(() => {
  globalThis.fetch = jest.fn().mockResolvedValue({ blob: async () => ({}) });
  globalThis.FileReader = class {
    result: string | null = null;
    onload: (() => void) | null = null;
    readAsText() { this.result = mockDocument; this.onload?.(); }
  } as unknown as typeof FileReader;
  globalThis.Blob = class {
    constructor(parts: unknown[]) { mockBlobParts.push(parts); }
  } as unknown as typeof Blob;
});

afterAll(() => { globalThis.fetch = originalFetch; globalThis.FileReader = originalReader; globalThis.Blob = originalBlob; });

beforeEach(() => {
  jest.clearAllMocks();
  mockBlobParts.length = 0;
  mockDocument = '';
  jest.mocked(projectsApi.importProject).mockResolvedValue({ id: 1 } as never);
  jest.mocked(projectsApi.importProjectFile).mockResolvedValue({ id: 2 } as never);
  jest.mocked(shareBlob).mockResolvedValue(undefined);
});

async function setup(projectId?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const screen = await render(<QueryClientProvider client={client}><ProjectTransferActions projectId={projectId} /></QueryClientProvider>);
  return { ...screen, invalidate };
}

it('uses the native document picker for ZIP packages and refreshes the project list', async () => {
  jest.mocked(pick).mockResolvedValue([{ uri: 'content://documents/build.zip', name: 'build.zip', type: 'application/zip' }] as never);
  const screen = await setup();
  await fireEvent.press(screen.getByText('Import project package'));
  await waitFor(() => expect(projectsApi.importProjectFile).toHaveBeenCalledWith({ uri: 'content://documents/build.zip', name: 'build.zip', type: 'application/zip' }));
  await waitFor(() => expect(screen.invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] }));
});

it('restores all records from exported JSON without discarding notes/BOM/sets and validates the whole array before creating anything', async () => {
  const records = [{ name: 'One', notes: '<strong>Keep</strong>', target_sets: 3, bom_items: [{ name: 'Bolt' }] }, { name: 'Two', color: '#123456' }];
  mockDocument = JSON.stringify(records);
  await importProjectDocument({ uri: 'file:///projects.json', name: 'projects.json', type: 'application/json' });
  expect(projectsApi.importProject).toHaveBeenNthCalledWith(1, records[0]);
  expect(projectsApi.importProject).toHaveBeenNthCalledWith(2, records[1]);
  jest.mocked(projectsApi.importProject).mockClear();
  mockDocument = JSON.stringify([records[0], { invalid: true }]);
  await expect(importProjectDocument({ uri: 'file:///projects.json', name: 'projects.json', type: null })).rejects.toThrow('Invalid project JSON');
  expect(projectsApi.importProject).not.toHaveBeenCalled();
});

it('shares a valid metadata-only bulk package and individual project ZIP bytes rather than a URL', async () => {
  const records = [{ name: 'One', target_sets: 3 }, { name: 'Two', notes: '<p>Keep</p>' }];
  jest.mocked(projectsApi.getProjects).mockResolvedValue([{ id: 1 }, { id: 2 }] as never);
  jest.mocked(projectsApi.exportProjectJson).mockResolvedValueOnce(records[0]).mockResolvedValueOnce(records[1]);
  const all = await setup();
  await fireEvent.press(all.getByText('Export all projects'));
  await waitFor(() => expect(shareBlob).toHaveBeenCalled());
  expect(JSON.parse(String(mockBlobParts[0][0]))).toEqual(records);
  expect(projectsApi.exportProjectJson).toHaveBeenNthCalledWith(1, 1);
  expect(projectsApi.exportProjectJson).toHaveBeenNthCalledWith(2, 2);
  await all.unmount();
  const zip = { bytes: 'zip data' } as unknown as Blob;
  jest.mocked(projectsApi.exportProjectZip).mockResolvedValue(zip);
  const single = await setup(9);
  await fireEvent.press(single.getByText('Export project'));
  await waitFor(() => expect(shareBlob).toHaveBeenLastCalledWith(zip, 'project_9.zip'));
});

it('reports import failures and refreshes after partial import, while treating picker cancellation as cancellation', async () => {
  jest.mocked(pick).mockResolvedValue([{ uri: 'content://documents/build.json', name: 'build.json', type: 'application/json' }] as never);
  mockDocument = JSON.stringify([{ name: 'One' }, { name: 'Two' }]);
  jest.mocked(projectsApi.importProject).mockResolvedValueOnce({ id: 1 } as never).mockRejectedValueOnce(new Error('Server import rejected'));
  const screen = await setup();
  await fireEvent.press(screen.getByText('Import project package'));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Server import rejected', 'error'));
  expect(screen.invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import project package' })).toBeEnabled());
  jest.mocked(pick).mockRejectedValueOnce({ code: 'CANCEL' });
  mockToast.mockClear();
  await fireEvent.press(screen.getByText('Import project package'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import project package' })).toBeEnabled());
  expect(mockToast).not.toHaveBeenCalled();
});
