import React from 'react';
import { Alert, Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArchiveDeleteDialog,
  ArchiveIngestionPanel,
  ConfirmOutcomeDialog,
  ArchivePhotoGallery,
} from '@/components/archives/ArchiveWorkflowUI';
import {
  ArchiveBatchDialog,
  ArchiveTagCatalog,
} from '@/components/archives/ArchiveBrowseControls';
import {
  ArchiveDetailTools,
  EmbeddedArchiveProjectPage,
} from '@/components/archives/ArchiveDetailTools';
import { EditArchiveModal } from '@/components/archives/EditArchiveModal';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { api } from '@/api/client';
import { pick } from '@react-native-documents/picker';
import type { Archive } from '@/types/api';

const mockToast = jest.fn();
const mockPermission = jest.fn(() => true);
jest.mock('react-native/Libraries/Modal/Modal', () => ({
  __esModule: true,
  default: (props: import('react-native').ModalProps) =>
    require('react').createElement(
      require('react-native').View,
      { ...props, testID: 'native-archive-modal' },
      props.children,
    ),
}));
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
jest.mock('react-native-webview', () => ({
  WebView: require('react-native').View,
}));
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
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
    renameTag: jest.fn(),
    deleteTag: jest.fn(),
    attach: jest.fn(),
    plates: jest.fn(),
    folders: jest.fn(),
    projectPage: jest.fn(),
    saveProjectPage: jest.fn(),
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
  jest.mocked(archiveWorkflows.plates).mockResolvedValue({ plates: [] });
  jest.mocked(archiveWorkflows.folders).mockResolvedValue([]);
  jest.mocked(archiveWorkflows.discardAll).mockResolvedValue({ discarded: 1 });
  jest
    .mocked(archiveWorkflows.impact)
    .mockResolvedValue({ related_queue_items: 3, currently_printing: false });
});

it('persists reject reason before opening configurable reprint without changing machine status or plate state', async () => {
  const onReprint = jest.fn();
  const onClose = jest.fn();
  const result = await wrap(
    <ConfirmOutcomeDialog
      archiveId={9}
      source="printer_card"
      onClose={onClose}
      onReprint={onReprint}
    />,
  );
  await waitFor(() => expect(result.getByText('Job')).toBeTruthy());
  const modal = result.getByTestId('native-archive-modal');
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
  await waitFor(() => expect(modal.props.visible).toBe(false));
  expect(onClose).not.toHaveBeenCalled();
  expect(onReprint).not.toHaveBeenCalled();
  await fireEvent(modal, 'dismiss');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onReprint).toHaveBeenCalledWith(9);
  expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(
    onReprint.mock.invocationCallOrder[0],
  );
  await fireEvent(modal, 'dismiss');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onReprint).toHaveBeenCalledTimes(1);
  expect(api.updateArchive).toHaveBeenCalledTimes(1);
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
  const modal = result.getByTestId('native-archive-modal');
  await fireEvent.press(result.getByText('Close'));
  expect(modal.props.visible).toBe(false);
  expect(close).not.toHaveBeenCalled();
  await fireEvent(modal, 'dismiss');
  expect(close).toHaveBeenCalledTimes(1);
  expect(api.updateArchive).not.toHaveBeenCalled();
});

it.each(['Good', 'Reject'])(
  'dismisses saved %s without launching a reprint',
  async verdict => {
    const onClose = jest.fn();
    const onReprint = jest.fn();
    const result = await wrap(
      <ConfirmOutcomeDialog
        archiveId={9}
        onClose={onClose}
        onReprint={onReprint}
      />,
    );
    await waitFor(() => expect(result.getByText('Job')).toBeTruthy());
    await fireEvent.press(result.getByText(verdict));
    const modal = result.getByTestId('native-archive-modal');
    await fireEvent.press(result.getByText('Save'));
    await waitFor(() => expect(modal.props.visible).toBe(false));
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent(modal, 'dismiss');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReprint).not.toHaveBeenCalled();
    expect(api.updateArchive).toHaveBeenCalledTimes(1);
    expect(api.updateArchive).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        user_verdict: verdict.toLowerCase(),
        user_verdict_source: 'dialog',
      }),
    );
  },
);

it('opens Android reprint after the hidden-modal commit without an iOS dismissal event', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const onClose = jest.fn();
    const onReprint = jest.fn();
    const result = await wrap(
      <ConfirmOutcomeDialog
        archiveId={9}
        onClose={onClose}
        onReprint={onReprint}
      />,
    );
    await waitFor(() => expect(result.getByText('Job')).toBeTruthy());
    await fireEvent.press(result.getByText('Reject'));
    const modal = result.getByTestId('native-archive-modal');
    await fireEvent.press(result.getByText('Reject and configure reprint'));
    await waitFor(() => expect(onReprint).toHaveBeenCalledWith(9));
    expect(modal.props.visible).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.updateArchive).toHaveBeenCalledTimes(1);
    await fireEvent(modal, 'dismiss');
    expect(onReprint).toHaveBeenCalledTimes(1);
  } finally {
    platform.restore();
  }
});

it('does not reopen reprint when a saved review is closed before its write finishes', async () => {
  type SavedArchive = Awaited<ReturnType<typeof api.updateArchive>>;
  let resolveSave!: (archive: SavedArchive) => void;
  const saved = new Promise<SavedArchive>(resolve => {
    resolveSave = resolve;
  });
  jest.mocked(api.updateArchive).mockReturnValueOnce(saved);
  const onClose = jest.fn();
  const onReprint = jest.fn();
  const result = await wrap(
    <ConfirmOutcomeDialog
      archiveId={9}
      onClose={onClose}
      onReprint={onReprint}
    />,
  );
  await waitFor(() => expect(result.getByText('Job')).toBeTruthy());
  await fireEvent.press(result.getByText('Reject'));
  await fireEvent.press(result.getByText('Reject and configure reprint'));
  await waitFor(() => expect(api.updateArchive).toHaveBeenCalledTimes(1));
  const modal = result.getByTestId('native-archive-modal');
  await fireEvent.press(result.getByText('Close'));
  await fireEvent(modal, 'dismiss');
  resolveSave({ id: 9, user_verdict: 'reject' });
  await waitFor(() =>
    expect(
      result.getByRole('button', { name: 'Save' }).props.accessibilityState
        .busy,
    ).toBe(false),
  );
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onReprint).not.toHaveBeenCalled();
  expect(api.updateArchive).toHaveBeenCalledTimes(1);
});

it('keeps the native outcome dialog open when its verdict write fails', async () => {
  jest.mocked(api.updateArchive).mockRejectedValueOnce(new Error('Offline'));
  const onClose = jest.fn();
  const onReprint = jest.fn();
  const result = await wrap(
    <ConfirmOutcomeDialog
      archiveId={9}
      onClose={onClose}
      onReprint={onReprint}
    />,
  );
  await waitFor(() => expect(result.getByText('Job')).toBeTruthy());
  await fireEvent.press(result.getByText('Reject'));
  await fireEvent.press(result.getByText('Reject and configure reprint'));
  await waitFor(() =>
    expect(mockToast).toHaveBeenCalledWith('Offline', 'error'),
  );
  expect(result.getByTestId('native-archive-modal').props.visible).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  expect(onReprint).not.toHaveBeenCalled();
  expect(api.updateArchive).toHaveBeenCalledTimes(1);
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
  jest.mocked(archiveWorkflows.pending).mockResolvedValue([
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

it('navigates through actual gallery photos rather than filenames alone', async () => {
  const result = await wrap(
    <ArchivePhotoGallery
      archive={{ ...sample, photos: ['first.jpg', 'second.jpg'] }}
      onClose={jest.fn()}
    />,
  );
  expect(result.getByLabelText('first.jpg')).toBeTruthy();
  await fireEvent.press(result.getByText('Next'));
  expect(result.getByLabelText('second.jpg')).toBeTruthy();
  await fireEvent.press(result.getByText('Previous'));
  expect(result.getByLabelText('first.jpg')).toBeTruthy();
});

it('renames catalog tags globally and reports affected archives', async () => {
  jest.mocked(api.getTags).mockResolvedValue([{ name: 'old', count: 4 }]);
  jest.mocked(archiveWorkflows.renameTag).mockResolvedValue({ affected: 4 });
  const result = await wrap(<ArchiveTagCatalog onClose={jest.fn()} />);
  await waitFor(() => expect(result.getByText('old (4)')).toBeTruthy());
  await fireEvent.press(result.getByText('Edit'));
  await fireEvent.changeText(result.getByLabelText('New tag name'), 'new');
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() =>
    expect(archiveWorkflows.renameTag).toHaveBeenCalledWith('old', 'new'),
  );
  await waitFor(() =>
    expect(mockToast).toHaveBeenCalledWith('4 archives updated', 'success'),
  );
});

it('uploads a real picked source document without replacing the sliced archive', async () => {
  jest.mocked(pick).mockResolvedValue([
    {
      uri: 'file:///design.3mf',
      name: 'design.3mf',
      type: 'application/octet-stream',
    },
  ] as unknown as Awaited<ReturnType<typeof pick>>);
  const result = await wrap(
    <ArchiveDetailTools
      archive={sample}
      onOutcome={jest.fn()}
      onProjectPage={jest.fn()}
      onNavigate={jest.fn()}
    />,
  );
  await fireEvent.press(result.getByText('Attach source'));
  await waitFor(() =>
    expect(archiveWorkflows.attach).toHaveBeenCalledWith(9, 'source', {
      uri: 'file:///design.3mf',
      name: 'design.3mf',
      type: 'application/octet-stream',
    }),
  );
  expect(api.uploadArchive).not.toHaveBeenCalled();
});

it('persists embedded project metadata while retaining rich descriptions and ignoring response-only fields', async () => {
  jest.mocked(archiveWorkflows.projectPage).mockResolvedValue({
    title: 'Embedded',
    description: '<p><strong>Rich text</strong></p>',
    profile_description: '<p>Profile</p>',
    model_pictures: [],
  });
  const result = await wrap(
    <EmbeddedArchiveProjectPage archive={sample} onClose={jest.fn()} />,
  );
  await waitFor(() => expect(result.getByText('Embedded')).toBeTruthy());
  await fireEvent.press(result.getByText('Edit'));
  await fireEvent.changeText(result.getByLabelText('title'), 'Revised');
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() =>
    expect(archiveWorkflows.saveProjectPage).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        title: 'Revised',
        description: '<p><strong>Rich text</strong></p>',
      }),
    ),
  );
  expect(
    jest.mocked(archiveWorkflows.saveProjectPage).mock.calls[0][1],
  ).not.toHaveProperty('model_pictures');
});
