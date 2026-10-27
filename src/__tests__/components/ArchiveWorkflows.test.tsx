import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArchiveDeleteDialog,
  ArchiveIngestionPanel,
  ConfirmOutcomeDialog,
} from '@/components/archives/ArchiveWorkflowUI';
import { ArchiveBatchDialog } from '@/components/archives/ArchiveBrowseControls';
import { EditArchiveModal } from '@/components/archives/EditArchiveModal';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { api } from '@/api/client';
import { pick } from '@react-native-documents/picker';
import type { Archive } from '@/types/api';

const mockToast = jest.fn();
const mockPermission = jest.fn(() => true);
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1 },
    hasPermission: mockPermission,
    hasAnyPermission: mockPermission,
  }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: { allFiles: '*/*' },
  isErrorWithCode: () => false,
  errorCodes: { OPERATION_CANCELED: 'cancelled' },
}));
jest.mock('@/api/client', () => ({
  api: {
    getArchive: jest.fn(),
    updateArchive: jest.fn(),
    deleteArchive: jest.fn(),
    uploadArchive: jest.fn(),
    getArchivePhotoUrl: () => 'https://farm.test/photo',
    getArchiveThumbnail: () => 'https://farm.test/thumbnail',
    getProjects: jest.fn(),
    getTags: jest.fn(),
    getPrinters: jest.fn(),
  },
}));
jest.mock('@/api/archiveWorkflows', () => ({
  archiveWorkflows: {
    impact: jest.fn(),
    pending: jest.fn(),
    accept: jest.fn(),
    discard: jest.fn(),
    acceptAll: jest.fn(),
    discardAll: jest.fn(),
    favorite: jest.fn(),
  },
}));

const sample = {
  id: 9,
  filename: 'job.3mf',
  print_name: 'Job',
  status: 'completed',
  created_by_id: 1,
  photos: ['finish.jpg'],
  tags: 'unrelated',
  user_verdict: null,
  failure_reason: null,
} as Archive;
const wrap = (element: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
            mutations: { retry: false, gcTime: Infinity },
          },
        })
      }
    >
      {element}
    </QueryClientProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockReturnValue(true);
  jest
    .mocked(api.getArchive)
    .mockResolvedValue(sample as Awaited<ReturnType<typeof api.getArchive>>);
  jest.mocked(api.getProjects).mockResolvedValue([]);
  jest.mocked(api.getPrinters).mockResolvedValue([]);
  jest.mocked(api.getTags).mockResolvedValue([]);
  jest.mocked(archiveWorkflows.pending).mockResolvedValue([]);
  jest.mocked(archiveWorkflows.discardAll).mockResolvedValue({ discarded: 1 });
  jest
    .mocked(archiveWorkflows.impact)
    .mockResolvedValue({ related_queue_items: 3, currently_printing: false });
});

it('persists reject reason before opening configurable reprint without changing machine status or plate state', async () => {
  const onReprint = jest.fn();
  const result = await wrap(
    <ConfirmOutcomeDialog
      archiveId={9}
      source="printer_card"
      onClose={jest.fn()}
      onReprint={onReprint}
    />,
  );
  await waitFor(() => expect(result.getByText('Job')).toBeTruthy());
  await fireEvent.press(result.getByText('Reject'));
  await fireEvent.changeText(
    result.getByLabelText('Rejection reason (optional)'),
    'surface damage',
  );
  await fireEvent.press(result.getByText('Reject and configure reprint'));
  await waitFor(() =>
    expect(api.updateArchive).toHaveBeenCalledWith(9, {
      user_verdict: 'reject',
      user_verdict_source: 'printer_card',
      failure_reason: 'surface damage',
    }),
  );
  await waitFor(() => expect(onReprint).toHaveBeenCalledWith(9));
});

it('leaves stored outcome untouched when the review is closed', async () => {
  const close = jest.fn();
  const result = await wrap(
    <ConfirmOutcomeDialog
      archiveId={9}
      onClose={close}
      onReprint={jest.fn()}
    />,
  );
  await waitFor(() => expect(result.getByText('Job')).toBeTruthy());
  await fireEvent.press(result.getByText('Reject'));
  await fireEvent.press(result.getByText('Close'));
  expect(close).toHaveBeenCalled();
  expect(api.updateArchive).not.toHaveBeenCalled();
});

it('shows deletion impact, preserves statistics by default and blocks printing archives', async () => {
  const result = await wrap(
    <ArchiveDeleteDialog archives={[sample]} onClose={jest.fn()} />,
  );
  await waitFor(() =>
    expect(result.getByText(/3 linked queue items/)).toBeTruthy(),
  );
  await fireEvent.press(result.getByText('Delete'));
  await waitFor(() => expect(api.deleteArchive).toHaveBeenCalledWith(9, false));
  await result.unmount();
  jest.mocked(api.deleteArchive).mockClear();
  const blocked = await wrap(
    <ArchiveDeleteDialog
      archives={[{ ...sample, status: 'printing' }]}
      onClose={jest.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      blocked.getByText('A currently printing archive cannot be deleted.'),
    ).toBeTruthy(),
  );
  await fireEvent.press(blocked.getByText('Delete'));
  expect(api.deleteArchive).not.toHaveBeenCalled();
});

it('submits pending metadata only upon acceptance and refreshes the staging query', async () => {
  jest
    .mocked(archiveWorkflows.pending)
    .mockResolvedValue([
      {
        id: 4,
        filename: 'incoming.3mf',
        uploaded_at: '2026-10-27',
        tags: 'original',
        notes: 'old note',
      },
    ]);
  const result = await wrap(<ArchiveIngestionPanel />);
  await waitFor(() => expect(result.getByText('incoming.3mf')).toBeTruthy());
  await fireEvent.press(result.getByText('Tags, notes and project'));
  await fireEvent.changeText(
    result.getByLabelText('Tags'),
    'original, checked',
  );
  await fireEvent.changeText(result.getByLabelText('Notes'), 'ready');
  expect(archiveWorkflows.accept).not.toHaveBeenCalled();
  await fireEvent.press(result.getByText('Archive'));
  await waitFor(() =>
    expect(archiveWorkflows.accept).toHaveBeenCalledWith(4, {
      tags: 'original, checked',
      notes: 'ready',
    }),
  );
});

it('reports mixed archive upload results per file and continues after one failure', async () => {
  jest.mocked(pick).mockResolvedValue([
    {
      uri: 'file:///bad.3mf',
      name: 'bad.3mf',
      type: 'application/octet-stream',
    },
    {
      uri: 'file:///good.3mf',
      name: 'good.3mf',
      type: 'application/octet-stream',
    },
  ] as unknown as Awaited<ReturnType<typeof pick>>);
  jest
    .mocked(api.uploadArchive)
    .mockRejectedValueOnce(new Error('Invalid 3MF'))
    .mockResolvedValueOnce({ id: 4 });
  const result = await wrap(<ArchiveIngestionPanel />);
  await fireEvent.press(result.getByText('Upload 3MF archives'));
  await waitFor(() =>
    expect(result.getByText('bad.3mf: Invalid 3MF')).toBeTruthy(),
  );
  await waitFor(() =>
    expect(result.getByText('good.3mf: Imported')).toBeTruthy(),
  );
});

it('merges bulk tags separately for each archive instead of replacing their tag lists', async () => {
  const result = await wrap(
    <ArchiveBatchDialog
      archives={[sample, { ...sample, id: 10, tags: 'different' }]}
      onClose={jest.fn()}
    />,
  );
  await fireEvent.changeText(
    result.getByLabelText('Tags (comma separated)'),
    'new',
  );
  await fireEvent.press(
    result.getByText('Apply tags, preserving unrelated tags'),
  );
  await waitFor(() =>
    expect(api.updateArchive).toHaveBeenCalledWith(9, {
      tags: 'unrelated, new',
    }),
  );
  expect(api.updateArchive).toHaveBeenCalledWith(10, {
    tags: 'different, new',
  });
});

it('does not execute bulk discard until native confirmation is accepted', async () => {
  jest
    .mocked(archiveWorkflows.pending)
    .mockResolvedValue([
      { id: 4, filename: 'incoming.3mf', uploaded_at: '2026-10-27' },
    ]);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const result = await wrap(<ArchiveIngestionPanel />);
  await waitFor(() => expect(result.getByText('Discard all')).toBeTruthy());
  await fireEvent.press(result.getByText('Discard all'));
  expect(archiveWorkflows.discardAll).not.toHaveBeenCalled();
  const buttons = alert.mock.calls.at(-1)?.[2];
  await buttons?.[1].onPress?.();
  await waitFor(() =>
    expect(archiveWorkflows.discardAll).toHaveBeenCalledTimes(1),
  );
  alert.mockRestore();
});

it('saves zero produced parts, clears filament and keeps an unchanged verdict provenance', async () => {
  const result = await wrap(
    <EditArchiveModal
      visible
      archive={{
        ...sample,
        user_verdict: 'reject',
        user_verdict_source: 'plate_clear',
        filament_used_grams: 12,
        quantity: 3,
      }}
      onClose={jest.fn()}
    />,
  );
  await fireEvent.changeText(result.getByLabelText('Quantity'), '0');
  await fireEvent.changeText(
    result.getByLabelText('Filament used (g); leave empty to clear'),
    '',
  );
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() =>
    expect(api.updateArchive).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        quantity: 0,
        filament_used_grams: null,
        status: 'completed',
      }),
    ),
  );
  expect(jest.mocked(api.updateArchive).mock.calls[0][1]).not.toHaveProperty(
    'user_verdict_source',
  );
});

it('changes or clears a completed quality verdict without changing its machine status', async () => {
  const result = await wrap(
    <EditArchiveModal
      visible
      archive={{
        ...sample,
        user_verdict: 'reject',
        failure_reason: 'surface damage',
      }}
      onClose={jest.fn()}
    />,
  );
  await fireEvent.press(result.getByText('None / clear'));
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() =>
    expect(api.updateArchive).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        user_verdict: null,
        status: 'completed',
        failure_reason: null,
      }),
    ),
  );
});
