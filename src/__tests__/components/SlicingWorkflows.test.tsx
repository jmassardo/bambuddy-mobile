import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SliceModal } from '@/components/files/SliceModal';
import { RunWithPipelineModal } from '@/components/slicing/RunWithPipelineModal';
import { slicingApi } from '@/api/slicing';
import { settingsApi } from '@/api/settings';
import { printersApi } from '@/api/printers';
import type { PipelineEligibilityReport, PipelineRun, SlicerPipeline, UnifiedPresetsResponse } from '@/types/api';

const mockTrack = jest.fn();
const mockToast = jest.fn();
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('@/contexts/SliceJobTrackerContext', () => ({ useSliceJobTracker: () => ({ trackJob: mockTrack }) }));
jest.mock('@/api/settings', () => ({ settingsApi: { getSettings: jest.fn() } }));
jest.mock('@/api/printers', () => ({ printersApi: { getPrinters: jest.fn() } }));
jest.mock('@/api/http', () => ({ buildMediaUrl: (s: string) => s }));
jest.mock('@/api/slicing', () => ({
  slicingApi: Object.fromEntries(['presets', 'models', 'plates', 'requirements', 'presetValues', 'pipelines', 'slice', 'create', 'previewProgress', 'eligibility', 'run'].map(key => [key, jest.fn()])),
}));
jest.mock('@/components/slicing/ProcessSettingsEditor', () => ({
  ProcessSettingsEditor: () => null,
  serializeIntentional: () => ({}),
}));
const empty = { printer: [], process: [], filament: [] };
const presets: UnifiedPresetsResponse = {
  local: {
    printer: [{ id: 'printer', source: 'local', name: 'Bambu Lab P1S 0.4 nozzle' }],
    process: [{ id: 'process', source: 'local', name: '0.20 Standard' }],
    filament: [{ id: 'filament', source: 'local', name: 'Generic PLA', filament_type: 'PLA' }],
  }, cloud: empty, orca_cloud: empty, standard: empty, cloud_status: 'expired', orca_cloud_status: 'ok',
};
const pipeline = {
  id: 1, name: 'Farm PLA', target_kind: 'specific_printer', target_printer_id: 2,
  printer_preset: { source: 'local', id: 'printer' }, process_preset: { source: 'local', id: 'process' },
  filament_presets: [{ source: 'local', id: 'filament' }], bed_type: 'Smooth PEI Plate',
} as SlicerPipeline;
const clients: QueryClient[] = [];
function wrap(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => { clients.forEach(client => client.clear()); clients.length = 0; });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(slicingApi.presets).mockResolvedValue(presets);
  jest.mocked(slicingApi.models).mockResolvedValue({ 'Bambu Lab P1S': 'P1S' });
  jest.mocked(slicingApi.plates).mockResolvedValue({ plates: [], is_multi_plate: false, embedded_printer: 'Bambu Lab P1S 0.4 nozzle', embedded_process: '0.20 Standard' });
  jest.mocked(slicingApi.requirements).mockResolvedValue({ filaments: [
    { slot_id: 1, type: 'PLA', color: '#111111', used_in_plate: false },
    { slot_id: 2, type: 'PLA', color: '#222222', used_in_plate: false },
    { slot_id: 3, type: 'PLA', color: '#333333', used_in_plate: true },
  ] });
  jest.mocked(slicingApi.presetValues).mockResolvedValue({ resolved: true, reason: 'ok', values: {} });
  jest.mocked(slicingApi.pipelines).mockResolvedValue({ pipelines: [pipeline] });
  jest.mocked(slicingApi.previewProgress).mockResolvedValue(null);
  jest.mocked(slicingApi.slice).mockResolvedValue({ job_id: 88, status: 'pending', status_url: '/slice-jobs/88' });
  jest.mocked(settingsApi.getSettings).mockResolvedValue({ pipeline_max_copies: 4 } as Awaited<ReturnType<typeof settingsApi.getSettings>>);
  jest.mocked(printersApi.getPrinters).mockResolvedValue([{ id: 2, name: 'Farm printer' }] as Awaited<ReturnType<typeof printersApi.getPrinters>>);
});
describe('Source slicing workflows', () => {
  it.each(['file', 'archive'] as const)('sends real positional presets and edited colours/layout from %s and tracks after closing', async sourceType => {
    const close = jest.fn();
    const ui = await render(wrap(<SliceModal visible onClose={close} sourceType={sourceType} sourceId={5} sourceName="part.3mf" defaultAutoArrange />));
    await waitFor(() => expect(ui.getByLabelText('Slice').props.accessibilityState?.disabled).toBe(false));
    expect(ui.getByText('Bambu Cloud: expired · Orca Cloud: ok')).toBeTruthy();
    const colours = ui.getAllByLabelText('Colour (#RRGGBB or #RRGGBBAA)');
    expect(colours).toHaveLength(3);
    expect(colours[0].props.editable).toBe(false);
    await fireEvent.changeText(colours[2], '#ABCDEF');
    await fireEvent(ui.getByLabelText('Auto orient'), 'valueChange', true);
    await fireEvent.press(ui.getByText('Slice'));
    await waitFor(() => expect(slicingApi.slice).toHaveBeenCalled());
    expect(jest.mocked(slicingApi.slice).mock.calls[0][1]).toMatchObject({
      filament_presets: Array(3).fill({ source: 'local', id: 'filament' }),
      filament_colours: ['#111111', '#222222', '#ABCDEF'], auto_arrange: true, auto_orient: true,
    });
    expect(mockTrack).toHaveBeenCalledWith(88, expect.objectContaining({ sourceType, sourceId: 5 }));
    expect(close).toHaveBeenCalled();
    await ui.unmount();
  });
});
describe('Pipeline launch workflow', () => {
  it('bounds copies, reports per-printer preflight issues and only forces on deliberate confirmation', async () => {
    const report: PipelineEligibilityReport = { ok: false, target_kind: 'specific_printer', target_printer_id: 2, target_printer_name: 'Farm printer', target_model_class: null,
      issues: [{ kind: 'filament_type_mismatch', slot_index: 1, expected: 'PLA', actual: 'PETG' }], printer_reports: [] };
    jest.mocked(slicingApi.eligibility).mockResolvedValue(report);
    jest.mocked(slicingApi.run).mockResolvedValue({ id: 42, slice_job_id: 90 } as PipelineRun);
    const ui = await render(wrap(<RunWithPipelineModal visible onClose={jest.fn()} sourceType="archive" sourceId={7} sourceName="part.3mf" />));
    await waitFor(() => expect(ui.getByText('Pipeline: ')).toBeTruthy());
    await fireEvent.press(ui.getByText('Pipeline: '));
    await fireEvent.press(await ui.findByText('Farm PLA · Farm printer'));
    await fireEvent.changeText(ui.getByLabelText('Copies (1–4)'), '5');
    expect(ui.getByLabelText('Check and run').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(ui.getByLabelText('Copies (1–4)'), '3');
    await fireEvent.press(ui.getByText('Check and run'));
    await ui.findByText('filament_type_mismatch · Slot 1 · Expected: PLA · Actual: PETG');
    expect(slicingApi.run).not.toHaveBeenCalled();
    await fireEvent.press(ui.getByText('Back'));
    await fireEvent.press(ui.getByText('Check and run'));
    await ui.findByText('Run anyway');
    await fireEvent.press(ui.getByText('Run anyway'));
    await waitFor(() => expect(slicingApi.run).toHaveBeenCalledWith(1, expect.objectContaining({ sourceType: 'archive', sourceId: 7 }), 3, true));
    expect(mockTrack).toHaveBeenCalledWith(90, expect.objectContaining({ sourceId: 7 }));
    await ui.unmount();
  });
});
