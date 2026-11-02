import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PipelineRunsScreen } from '@/screens/PipelineRunsScreen';
import { SlicerPipelinesScreen } from '@/screens/SlicerPipelinesScreen';
import { translateNative } from '@/i18n';
import { slicingApi } from '@/api/slicing';
import { printersApi } from '@/api/printers';
import type {
  PipelineRun,
  SlicerPipeline,
  UnifiedPresetsResponse,
} from '@/types/api';
const mockToast = jest.fn();
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock('@/api/printers', () => ({
  printersApi: { getPrinters: jest.fn() },
}));
jest.mock('@/api/slicing', () => ({
  slicingApi: Object.fromEntries(
    [
      'pipelines',
      'presets',
      'runs',
      'latestRun',
      'update',
      'remove',
      'cancel',
      'retry',
      'clear',
    ].map(key => [key, jest.fn()]),
  ),
}));
const pipeline = {
  id: 1,
  name: 'PLA bundle',
  description: null,
  target_kind: 'specific_printer',
  target_printer_id: null,
  target_model_class: null,
  fanout_strategy: 'max_parallel',
  updated_at: '2026-10-27',
  printer_preset: { source: 'local', id: 'printer' },
  process_preset: { source: 'local', id: 'process' },
  filament_presets: [{ source: 'local', id: 'filament' }],
  bed_type: null,
} as SlicerPipeline;

it('shows a filtered-empty result instead of a blank pipeline list', async () => {
  const result = await render(wrap(<SlicerPipelinesScreen />));
  await waitFor(() => expect(result.getByText('PLA bundle')).toBeTruthy());
  await fireEvent.changeText(result.getByLabelText('Search pipelines'), 'missing');
  expect(result.getByText(translateNative('pipelineManagement.noMatchingPipelines'))).toBeTruthy();
  expect(result.queryByText('PLA bundle')).toBeNull();
});
const failed: PipelineRun = {
  id: 5,
  pipeline_id: 1,
  pipeline_name: 'PLA bundle',
  source_library_file_id: 3,
  source_archive_id: null,
  source_filename: 'object.3mf',
  status: 'partial_failure',
  parent_run_id: 2,
  copies: 3,
  copies_completed: 2,
  copies_failed: 1,
  copies_cancelled: 0,
  copies_in_progress: 0,
  created_at: '2026-10-27',
  target_kind: 'specific_printer',
  target_printer_id: 2,
  slice_job_id: 1,
  sliced_library_file_id: 4,
  eligibility_overridden: false,
  error_message: null,
  created_by: 1,
  started_at: null,
  completed_at: null,
  target_model_class: null,
  fanout_strategy: 'max_parallel',
  jobs: [
    {
      id: 6,
      pipeline_run_id: 5,
      copy_index: 1,
      status: 'completed',
      assigned_printer_name: 'Farm printer',
      assigned_printer_id: 2,
      queue_entry_id: 1,
      error_message: null,
      dispatched_at: null,
      completed_at: null,
    },
    {
      id: 7,
      pipeline_run_id: 5,
      copy_index: 2,
      status: 'failed',
      assigned_printer_name: null,
      assigned_printer_id: null,
      queue_entry_id: null,
      error_message: 'Printer disconnected',
      dispatched_at: null,
      completed_at: null,
    },
  ],
};
const active = {
  ...failed,
  id: 8,
  status: 'slicing',
  copies_completed: 0,
  copies_failed: 0,
} as PipelineRun;
const clients: QueryClient[] = [];
function wrap(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(slicingApi.pipelines)
    .mockResolvedValue({ pipelines: [pipeline] });
  const empty = { printer: [], process: [], filament: [] };
  jest.mocked(slicingApi.presets).mockResolvedValue({
    local: empty,
    cloud: empty,
    orca_cloud: empty,
    standard: empty,
    cloud_status: 'ok',
    orca_cloud_status: 'ok',
  } as UnifiedPresetsResponse);
  jest
    .mocked(slicingApi.latestRun)
    .mockResolvedValue({ runs: [failed], total: 1 });
  jest
    .mocked(printersApi.getPrinters)
    .mockResolvedValue([
      { id: 2, name: 'Farm printer', model: 'P1S' },
    ] as Awaited<ReturnType<typeof printersApi.getPrinters>>);
  jest
    .mocked(slicingApi.runs)
    .mockResolvedValue({ runs: [failed, active], total: 21 });
});
afterEach(() => {
  clients.forEach(c => c.clear());
  clients.length = 0;
  jest.restoreAllMocks();
});
describe('Pipeline operations', () => {
  it.each(['specific_printer', 'printer_class'] as const)(
    'clears an existing %s binding using the server clearing sentinels',
    async targetKind => {
      const bound = {
        ...pipeline,
        target_kind: targetKind,
        target_printer_id: targetKind === 'specific_printer' ? 2 : null,
        target_model_class: targetKind === 'printer_class' ? 'P1S' : null,
      };
      jest
        .mocked(slicingApi.pipelines)
        .mockResolvedValue({ pipelines: [bound] });
      jest.mocked(slicingApi.update).mockImplementation(async (_id, body) => {
        const updated = {
          ...bound,
          target_printer_id:
            body.target_printer_id == null
              ? bound.target_printer_id
              : body.target_printer_id || null,
          target_model_class:
            body.target_model_class == null
              ? bound.target_model_class
              : body.target_model_class || null,
          updated_at: '2026-10-28',
        };
        jest
          .mocked(slicingApi.pipelines)
          .mockResolvedValue({ pipelines: [updated] });
        return updated;
      });
      const ui = await render(wrap(<SlicerPipelinesScreen />));
      await ui.findByText('Edit');
      await fireEvent.press(ui.getByText('Edit'));
      await fireEvent.press(
        ui.getByText(
          targetKind === 'specific_printer'
            ? 'Target printer: Farm printer'
            : 'Model class: P1S',
        ),
      );
      await fireEvent.press(
        ui.getByText(
          targetKind === 'specific_printer' ? 'No target' : 'No class',
        ),
      );
      await fireEvent.press(ui.getByText('Save'));
      await waitFor(() =>
        expect(slicingApi.update).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            target_printer_id: 0,
            target_model_class: '',
          }),
        ),
      );
      await ui.findByText(
        'No target — this pipeline cannot run until a target is configured.',
      );
      await ui.unmount();
    },
  );
  it('filters and pages all runs, expands provenance/copy errors, retries only failed copies and confirms clear/cancel', async () => {
    jest
      .mocked(slicingApi.retry)
      .mockResolvedValue({ ...failed, id: 9, parent_run_id: 5 });
    jest
      .mocked(slicingApi.cancel)
      .mockResolvedValue({ ...active, status: 'cancelled' });
    jest.mocked(slicingApi.clear).mockResolvedValue({ deleted: 1 });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const ui = await render(wrap(<PipelineRunsScreen />));
    await ui.findByText('#5 PLA bundle · partial_failure');
    await fireEvent.press(ui.getByRole('button', { name: '#5 PLA bundle · partial_failure', expanded: false }));
    expect(ui.getByRole('button', { name: '#5 PLA bundle · partial_failure', expanded: true })).toBeTruthy();
    expect(ui.getByText('Retry of run #2')).toBeTruthy();
    expect(ui.getByText('Printer disconnected')).toBeTruthy();
    await fireEvent.press(ui.getByText('Retry failed copies only'));
    await waitFor(() => expect(slicingApi.retry).toHaveBeenCalledWith(5));
    await fireEvent.press(ui.getByText('Cancel run'));
    expect(slicingApi.cancel).not.toHaveBeenCalled();
    alert.mock.calls
      .at(-1)?.[2]
      ?.find(button => button.text === 'Cancel run')
      ?.onPress?.();
    await waitFor(() => expect(slicingApi.cancel).toHaveBeenCalledWith(8));
    await fireEvent.press(ui.getByText('Next page'));
    await waitFor(() =>
      expect(slicingApi.runs).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 20, limit: 20 }),
      ),
    );
    await fireEvent.press(ui.getByText('Status: All statuses'));
    await fireEvent.press(ui.getByText('failed'));
    await waitFor(() =>
      expect(slicingApi.runs).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 0, status: 'failed' }),
      ),
    );
    await fireEvent.press(ui.getByText('Clear terminal run logs'));
    expect(slicingApi.clear).not.toHaveBeenCalled();
    alert.mock.calls
      .at(-1)?.[2]
      ?.find(button => button.text === 'Clear logs')
      ?.onPress?.();
    await waitFor(() => expect(slicingApi.clear).toHaveBeenCalledTimes(1));
    await ui.unmount();
  });
  it('shows stale/no-target/last-run diagnostics and persists class targeting with fanout, retaining bundle refs', async () => {
    jest.mocked(slicingApi.update).mockResolvedValue(pipeline);
    const ui = await render(wrap(<SlicerPipelinesScreen />));
    await ui.findByText(
      'No target — this pipeline cannot run until a target is configured.',
    );
    expect(ui.getByText(/Stale preset references/)).toBeTruthy();
    await ui.findByText(/Last run: #5 partial_failure/);
    await fireEvent.press(ui.getByText('Edit'));
    await fireEvent.changeText(ui.getByLabelText('Name'), 'PLA farm');
    await fireEvent.changeText(ui.getByLabelText('Description'), 'Night shift');
    await fireEvent.press(ui.getByText('Target kind: Specific printer'));
    await fireEvent.press(ui.getByText('Printer model class'));
    await fireEvent.press(ui.getByText('Model class: No class'));
    await fireEvent.press(ui.getByText('P1S'));
    await fireEvent.press(ui.getByText('Fanout strategy: max_parallel'));
    await fireEvent.press(ui.getByText('round_robin'));
    await fireEvent.press(ui.getByText('Save'));
    await waitFor(() =>
      expect(slicingApi.update).toHaveBeenCalledWith(1, {
        name: 'PLA farm',
        description: 'Night shift',
        target_kind: 'printer_class',
        target_printer_id: 0,
        target_model_class: 'P1S',
        fanout_strategy: 'round_robin',
      }),
    );
    await ui.unmount();
  });
});
