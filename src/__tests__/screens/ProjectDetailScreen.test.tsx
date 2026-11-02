import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectDetailScreen from '@/screens/ProjectDetailScreen';
import { api } from '@/api/client';
import { projectsApi } from '@/api/projects';

const mockNavigation = { setOptions: jest.fn(), dispatch: jest.fn(), navigate: jest.fn(), push: jest.fn() };
const mockInject = jest.fn();
let mockPermissions: Set<string> | null = null;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { id: 5 } }),
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: (permission: string) => mockPermissions === null || mockPermissions.has(permission) }) }));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@react-native-documents/picker', () => ({ pick: jest.fn(), types: { allFiles: '*/*' }, isErrorWithCode: () => false }));
jest.mock('@/components/projects/ProjectActionModals', () => ({
  ProjectBatchPrintModal: () => null, ProjectPipelineModal: () => null, ProjectSliceModal: () => null,
}));
jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return {
    WebView: ReactModule.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      ReactModule.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
      return ReactModule.createElement(MockView, { ...props, testID: 'notes-webview' });
    }),
  };
});
jest.mock('@/api/client', () => ({
  api: {
    getProject: jest.fn(), getProjectArchives: jest.fn(), getProjectBOM: jest.fn(), getProjectTimeline: jest.fn(),
    getLibraryFoldersByProject: jest.fn(), getLibraryFiles: jest.fn(), updateProject: jest.fn(),
    deleteBOMItem: jest.fn(), updateBOMItem: jest.fn(), getLibraryFileThumbnailUrl: jest.fn(),
  },
}));
jest.mock('@/api/projects', () => ({
  projectsApi: { getProjectFileProgress: jest.fn(), createTemplateFromProject: jest.fn(), exportProjectZip: jest.fn() },
}));

const initialNotes = '<p style="text-align:center"><strong>Assembly</strong> <u>instructions</u></p><ol><li><a href="https://example.com">Step one</a></li></ol>';
const project = {
  id: 5, name: 'Assembly', parent_id: 1, parent_name: 'Programme', target_sets: 5, notes: initialNotes,
  stats: { total_archives: 3 }, rollup_stats: { total_archives: 10 }, descendant_count: 2,
  children: [{ id: 6, name: 'Subassembly', descendant_count: 1, total_archives: 7 }],
};

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><ProjectDetailScreen /></QueryClientProvider>);
  await screen.findByText('Assembly');
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = null;
  jest.mocked(api.getProject).mockResolvedValue(project as never);
  jest.mocked(api.getProjectArchives).mockResolvedValue([]);
  jest.mocked(api.getProjectTimeline).mockResolvedValue([]);
  jest.mocked(api.getProjectBOM).mockResolvedValue([
    { id: 1, name: 'Bolts', quantity_needed: 2, quantity_acquired: 2, is_complete: true },
    { id: 2, name: 'Nuts', quantity_needed: 4, quantity_acquired: 0, is_complete: false },
  ] as never);
  jest.mocked(api.getLibraryFoldersByProject).mockResolvedValue([{ id: 77, name: 'Nested assembly', file_count: 2 }] as never);
  jest.mocked(api.getLibraryFiles).mockResolvedValue([
    { id: 11, folder_id: 77, filename: 'bracket.gcode', file_type: 'gcode' },
    { id: 12, folder_id: 77, filename: 'hinge.gcode.3mf', file_type: 'gcode.3mf' },
  ] as never);
  jest.mocked(projectsApi.getProjectFileProgress).mockResolvedValue([{ file_id: 11, completed_count: 3 }, { file_id: 12, completed_count: 2 }]);
  jest.mocked(projectsApi.createTemplateFromProject).mockResolvedValue({ id: 90 } as never);
  jest.mocked(api.updateProject).mockResolvedValue({});
  jest.mocked(api.deleteBOMItem).mockResolvedValue(undefined);
});

it('shows own and descendant totals separately, navigates both directions, and saves templates using the backend copy operation', async () => {
  const screen = await setup();
  await screen.findByText('This project only (excludes descendants)');
  await screen.findByText('Combined totals — this project and 2 descendants');
  await fireEvent.press(screen.getByText('Parent: Programme'));
  expect(mockNavigation.push).toHaveBeenCalledWith('ProjectDetail', { id: 1 });
  await fireEvent.press(screen.getByText('Subassembly'));
  expect(mockNavigation.push).toHaveBeenCalledWith('ProjectDetail', { id: 6 });
  await fireEvent.press(screen.getByText('Save as template'));
  await waitFor(() => expect(projectsApi.createTemplateFromProject).toHaveBeenCalledWith(5));
  await screen.findByText('2 / 5 complete sets · 3 remaining');
});

it('does not offer template creation for existing templates or users without project creation permission', async () => {
  jest.mocked(api.getProject).mockResolvedValueOnce({ ...project, is_template: true } as never);
  const template = await setup();
  expect(template.queryByText('Save as template')).toBeNull();
  await template.unmount();
  mockPermissions = new Set(['projects:read']);
  const readOnly = await setup();
  expect(readOnly.queryByText('Save as template')).toBeNull();
  expect(readOnly.queryByText('Edit notes')).toBeNull();
  expect(projectsApi.createTemplateFromProject).not.toHaveBeenCalled();
});

it('filters completed BOM items without mutating and requires named confirmation before deletion', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await setup();
  await fireEvent.press(screen.getByText('BOM'));
  await screen.findByText('Bolts × 2');
  await fireEvent.press(screen.getByText('Hide completed items'));
  expect(screen.queryByText('Bolts × 2')).toBeNull();
  expect(api.updateBOMItem).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Delete'));
  expect(api.deleteBOMItem).not.toHaveBeenCalled();
  expect(alert.mock.calls.at(-1)?.[1]).toContain('Nuts');
  const confirm = alert.mock.calls.at(-1)?.[2]?.find(button => button.style === 'destructive');
  await act(async () => confirm?.onPress?.());
  await waitFor(() => expect(api.deleteBOMItem).toHaveBeenCalledWith(5, 2));
  await fireEvent.press(screen.getByText('Show all items'));
  await screen.findByText('Bolts × 2');
  alert.mockRestore();
});

it('opens exact linked folders and the native project association workflow and displays per-file deficits', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByText('Files'));
  await screen.findByText('3 printed · target 5 · 2 remaining');
  await screen.findByText('2 printed · target 5 · 3 remaining');
  await fireEvent.press(screen.getByText('Open folder in Library'));
  expect(mockNavigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ params: { screen: 'Files', params: { folderId: 77 } } }),
  }));
  await fireEvent.press(screen.getByText('Link library files or folders'));
  expect(mockNavigation.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
    payload: expect.objectContaining({ params: { screen: 'Files', params: { projectId: 5 } } }),
  }));
});

it('preserves formatted HTML through edit/save, dispatches formatting controls, and cancels without a write', async () => {
  const screen = await setup();
  const displayed = screen.getByTestId('notes-webview').props.source.html as string;
  expect(displayed).toContain('Assembly');
  const editorScript = displayed.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  expect(editorScript).toBeTruthy();
  expect(() => require('@babel/parser').parse(editorScript)).not.toThrow();
  await fireEvent.press(screen.getByText('Edit notes'));
  await fireEvent.press(screen.getByText('Bold'));
  expect(mockInject).toHaveBeenCalledWith(expect.stringContaining('window.noteCommand("bold",null)'));
  await fireEvent.press(screen.getByText('Numbered list'));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('"insertOrderedList"'));
  await fireEvent.press(screen.getByText('Underline'));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('"underline"'));
  await fireEvent.press(screen.getByText('Align right'));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('"justifyRight"'));
  await fireEvent.press(screen.getByText('Add link'));
  await fireEvent.changeText(screen.getByLabelText('Link URL (https://, mailto:, tel:)'), 'https://example.com/instructions');
  await fireEvent.press(screen.getAllByRole('button', { name: 'Save' })[0]);
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('window.noteCommand("createLink","https://example.com/instructions")'));
  await fireEvent.press(screen.getByText('Remove link'));
  expect(mockInject).toHaveBeenLastCalledWith(expect.stringContaining('"unlink"'));
  const updated = '<p style="text-align:right"><em>Updated</em> <u>note</u></p><ul><li>Part one</li></ul>';
  await fireEvent(screen.getByTestId('notes-webview'), 'message', { nativeEvent: { data: JSON.stringify({ type: 'change', html: updated }) } });
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith(5, { notes: updated }));
  await waitFor(() => expect(screen.queryByText('Bold')).toBeNull());
  jest.mocked(api.updateProject).mockClear();
  await fireEvent.press(screen.getByText('Edit notes'));
  await fireEvent(screen.getByTestId('notes-webview'), 'message', { nativeEvent: { data: JSON.stringify({ type: 'change', html: '<p>Discard</p>' }) } });
  await fireEvent.press(screen.getByText('Cancel'));
  expect(api.updateProject).not.toHaveBeenCalled();
  expect(screen.getByTestId('notes-webview').props.source.html).toContain('Assembly');
});
