import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectBatchPrintModal, ProjectPipelineModal, ProjectSliceModal } from '@/components/projects/ProjectActionModals';
import { api } from '@/api/client';
import { projectsApi } from '@/api/projects';

const mockPipeline = jest.fn();
const mockSlice = jest.fn();
const mockPrint = jest.fn();
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return { __esModule: true, default: ({ visible, children, onDismiss }: {
    visible: boolean; children: React.ReactNode; onDismiss: () => void;
  }) => ReactModule.createElement(MockView, { testID: 'project-source-modal', onDismiss }, visible ? children : null) };
});
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/api/client', () => ({ api: { getLibraryFiles: jest.fn(), runPipeline: jest.fn(), sliceProject: jest.fn(), addToQueue: jest.fn() } }));
jest.mock('@/api/projects', () => ({ projectsApi: { getAllProjectArchives: jest.fn() } }));
jest.mock('@/components/slicing/RunWithPipelineModal', () => {
  const ReactModule = require('react');
  const { Text: MockText } = require('react-native');
  return { RunWithPipelineModal: (props: Record<string, unknown>) => {
    mockPipeline(props);
    return ReactModule.createElement(MockText, null, `Pipeline source ${props.sourceType}:${props.sourceId}`);
  } };
});
jest.mock('@/components/files/SliceModal', () => {
  const ReactModule = require('react');
  const { Text: MockText } = require('react-native');
  return { SliceModal: (props: Record<string, unknown>) => {
    mockSlice(props);
    return ReactModule.createElement(MockText, null, `Slice source ${props.sourceType}:${props.sourceId}`);
  } };
});
jest.mock('@/components/printers/PrintModal', () => {
  const ReactModule = require('react');
  const { Text: MockText } = require('react-native');
  return { PrintModal: (props: Record<string, unknown>) => {
    mockPrint(props);
    return ReactModule.createElement(MockText, null, `Print file ${props.initialFileId ?? '—'}, archive ${props.initialArchiveId ?? '—'}`);
  } };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.getLibraryFiles).mockResolvedValue([
    { id: 7, filename: 'model.stl', file_type: 'stl' },
    { id: 8, filename: 'design.3mf', file_type: '3mf' },
    { id: 9, filename: 'sliced.gcode', file_type: 'gcode' },
    { id: 10, filename: 'unsupported.step', file_type: 'step' },
  ] as never);
  jest.mocked(projectsApi.getAllProjectArchives).mockResolvedValue([{ id: 22, filename: 'archived.3mf', print_name: 'Archived part' }] as never);
});

async function setup(action: 'pipeline' | 'slice' | 'print') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const Component = action === 'pipeline' ? ProjectPipelineModal : action === 'slice' ? ProjectSliceModal : ProjectBatchPrintModal;
  const screen = await render(<QueryClientProvider client={client}><Component visible onClose={jest.fn()} projectId={5} projectName="Assembly" /></QueryClientProvider>);
  await screen.findByText('Archive: Archived part');
  return screen;
}

it('runs pipelines only after choosing a real linked model and waits for iOS picker dismissal', async () => {
  const screen = await setup('pipeline');
  expect(screen.queryByText('Library: sliced.gcode')).toBeNull();
  await fireEvent.press(screen.getByText('Library: model.stl'));
  if (Platform.OS === 'ios') {
    expect(mockPipeline).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('project-source-modal'), 'dismiss');
  }
  await screen.findByText('Pipeline source file:7');
  expect(mockPipeline).toHaveBeenLastCalledWith(expect.objectContaining({ sourceType: 'file', sourceId: 7, sourceName: 'model.stl' }));
  expect(api.runPipeline).not.toHaveBeenCalled();
  expect(screen.queryByText('Options JSON')).toBeNull();
});

it('forwards a real project archive to the reusable slicer, not a project-level synthetic source', async () => {
  const screen = await setup('slice');
  expect(screen.queryByText('Library: unsupported.step')).toBeNull();
  await fireEvent.press(screen.getByText('Archive: Archived part'));
  if (Platform.OS === 'ios') await fireEvent(screen.getByTestId('project-source-modal'), 'dismiss');
  await screen.findByText('Slice source archive:22');
  expect(mockSlice).toHaveBeenLastCalledWith(expect.objectContaining({ sourceType: 'archive', sourceId: 22, sourceName: 'Archived part' }));
  expect(screen.queryByText('Additional options JSON')).toBeNull();
});

it('launches configured multi-printer queue printing from a sliced source and preserves project association', async () => {
  const screen = await setup('print');
  expect(screen.queryByText('Library: model.stl')).toBeNull();
  expect(screen.queryByText('Library: design.3mf')).toBeNull();
  await fireEvent.press(screen.getByText('Library: sliced.gcode'));
  if (Platform.OS === 'ios') await fireEvent(screen.getByTestId('project-source-modal'), 'dismiss');
  await screen.findByText('Print file 9, archive —');
  expect(mockPrint).toHaveBeenLastCalledWith(expect.objectContaining({ initialFileId: 9, initialArchiveId: undefined, projectId: 5, initialMode: 'queue' }));
  expect(api.addToQueue).not.toHaveBeenCalled();
});

it('keeps archive sources usable when the linked-library query fails instead of masking the error', async () => {
  jest.mocked(api.getLibraryFiles).mockRejectedValue(new Error('Library unavailable'));
  const screen = await setup('pipeline');
  await screen.findByText('Unable to load linked files.');
  await fireEvent.press(screen.getByText('Archive: Archived part'));
  if (Platform.OS === 'ios') await fireEvent(screen.getByTestId('project-source-modal'), 'dismiss');
  await waitFor(() => expect(mockPipeline).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'archive', sourceId: 22 })));
});
