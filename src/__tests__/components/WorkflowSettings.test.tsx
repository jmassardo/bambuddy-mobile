import React, { useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrintDefaultsSettings } from '@/components/settings/PrintDefaultsSettings';
import { QueueWorkflowSettings } from '@/components/settings/QueueWorkflowSettings';
import { QueueSettingsSection } from '@/components/settings/QueueSettingsSection';
import { ApiExplorerSettings } from '@/components/settings/ApiExplorerSettings';
import { GeneralWorkflowSettings } from '@/components/settings/GeneralWorkflowSettings';
import { FailureDetectionSettingsSection } from '@/components/settings/FailureDetectionSettingsSection';
import { WorkflowNumberField } from '@/components/settings/WorkflowFields';
import { OptionChipsField, SwitchRow } from '@/components/settings/shared';
import {
  PrimaryButton,
  SettingRow,
  TextField,
} from '@/components/common/AppUI';
import Clipboard from '@react-native-clipboard/clipboard';
import { apiExplorerApi } from '@/api/apiExplorer';
import { workflowSettingsApi } from '@/api/workflowSettings';
import { printersApi } from '@/api/printers';
import { settingsApi } from '@/api/settings';
import type { SettingsScreenController } from '@/components/settings/useSettingsScreenController';
import type { ApiRecord } from '@/utils/data';
import { SettingsSectionsList } from '@/components/settings/SettingsSectionsList';
import {
  selectSettingsSearchResult,
  useSettingsSearchTarget,
  SettingsSearchFocusProvider,
} from '@/components/settings/SettingsSearchFocus';
import { searchSettings } from '@/components/settings/settingsSearch';
import type {
  ArchiveRetentionSettings,
  WorkflowObicoTestResult,
} from '@/types/api';

jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ authEnabled: false, hasPermission: () => true }),
}));
jest.mock('@/api/workflowSettings', () => ({
  workflowSettingsApi: {
    getArchiveRetention: jest.fn(),
    saveArchiveRetention: jest.fn(),
    getDetectionStatus: jest.fn(),
    testDetection: jest.fn(),
  },
}));
jest.mock('@/api/settings', () => ({
  settingsApi: { updateSettings: jest.fn() },
}));
jest.mock('@/api/printers', () => ({
  printersApi: { getPrinters: jest.fn() },
}));
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));
jest.mock('@/api/apiExplorer', () => ({
  ...jest.requireActual('@/api/apiExplorer'),
  apiExplorerApi: { getSchema: jest.fn(), execute: jest.fn() },
}));
const mockApi = jest.mocked(workflowSettingsApi);
const colors = new Proxy({}, { get: () => '#888888' });
let currentDraft: ApiRecord;
const mockSetSection = jest.fn();
const mockSetUserPanel = jest.fn();
const mockShowToast = jest.fn();
const clients: QueryClient[] = [];

function Harness({
  initial,
  component: Component,
}: {
  initial: ApiRecord;
  component: React.ComponentType<{ controller: SettingsScreenController }>;
}) {
  const [draft, setDraft] = useState(initial);
  currentDraft = draft;
  const controller = {
    state: { draft },
    colors,
    permissions: { canUpdateSettings: true },
    actions: {
      setDraft,
      setSection: mockSetSection,
      setUserPanel: mockSetUserPanel,
      showToast: mockShowToast,
    },
    queries: {
      printersQuery: {
        data: undefined,
      },
    },
    mutations: {
      saveSettingsMutation: {
        mutateAsync: async () => {
          const data = await settingsApi.updateSettings(draft);
          return data;
        },
      },
    },
    derived: { sectionSummaries: {} },
  } as unknown as SettingsScreenController;
  return <Component controller={controller} />;
}

async function renderSettings(
  component: React.ComponentType<{ controller: SettingsScreenController }>,
  initial: ApiRecord,
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  client.setQueryData(
    ['printers'],
    [
      { id: 1, name: 'Alpha', model: 'P1S' },
      { id: 7, name: 'Beta', model: 'H2D' },
    ],
  );
  clients.push(client);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <Harness initial={initial} component={component} />
      </QueryClientProvider>,
    );
  });
  return renderer;
}

function componentWithLabel<T>(
  renderer: ReactTestRenderer,
  component: React.ComponentType<T>,
  label: string,
) {
  return renderer.root
    .findAllByType(component)
    .find(node => node.props.label === label)!;
}

describe('workflow settings behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getArchiveRetention.mockResolvedValue({
      enabled: false,
      days: 365,
      purge_stats: false,
    });
    mockApi.getDetectionStatus.mockResolvedValue({
      enabled: true,
      is_running: true,
      thresholds: { low: 0.1, high: 0.3 },
      history: [],
      per_printer: {},
      last_error: null,
      sensitivity: 'medium',
      action: 'notify',
      poll_interval: 10,
      external_url_configured: true,
    });
    jest
      .mocked(settingsApi.updateSettings)
      .mockImplementation(async data => data as never);
    jest.mocked(printersApi.getPrinters).mockResolvedValue([
      { id: 1, name: 'Alpha', model: 'P1S' },
      { id: 7, name: 'Beta', model: 'H2D' },
    ] as never);
  });
  afterEach(() => {
    clients.splice(0).forEach(client => client.clear());
    selectSettingsSearchResult(null);
  });

  it('keeps auto calibration strings and all outcome policies independent', async () => {
    const renderer = await renderSettings(PrintDefaultsSettings, {
      default_bed_levelling: 'auto',
      default_flow_cali: 'off',
      default_nozzle_offset_cali: 'on',
      confirm_outcome_external_prints: true,
    });
    expect(
      componentWithLabel(renderer, OptionChipsField, 'Bed leveling').props
        .value,
    ).toBe('auto');
    expect(
      componentWithLabel(renderer, OptionChipsField, 'Flow calibration').props
        .value,
    ).toBe('off');
    await act(async () =>
      componentWithLabel(
        renderer,
        OptionChipsField,
        'Flow calibration',
      ).props.onChange('auto'),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        SwitchRow,
        'Ask for print outcome',
      ).props.onValueChange(true),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        SwitchRow,
        'Default to good when plate is cleared',
      ).props.onValueChange(true),
    );
    expect(currentDraft).toEqual({
      default_bed_levelling: 'auto',
      default_flow_cali: 'auto',
      default_nozzle_offset_cali: 'on',
      confirm_outcome_external_prints: true,
      default_confirm_outcome: true,
      confirm_default_good_on_plate_clear: true,
    });
    await act(async () => renderer.unmount());
  });

  it('edits/resets quick triples, preserves custom preheat keys, and retains multiline start/end snippets', async () => {
    const renderer = await renderSettings(QueueWorkflowSettings, {
      nozzle_temp_presets: '[100,200,300]',
      preheat_filament_targets: '{"default":20,"CUSTOM":55}',
      gcode_snippets: '{"P1S":{"start_gcode":"G28","end_gcode":"M84"}}',
    });
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'Nozzle °C preset 2',
      ).props.onChange(250),
    );
    expect(currentDraft.nozzle_temp_presets).toBe('[100,250,300]');
    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'Reset Nozzle °C',
      ).props.onPress(),
    );
    expect(currentDraft.nozzle_temp_presets).toBe('');
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'ASA chamber target (°C)',
      ).props.onChange(50),
    );
    expect(JSON.parse(String(currentDraft.preheat_filament_targets))).toEqual({
      default: 20,
      CUSTOM: 55,
      ASA: 50,
    });
    const code = Array.from({ length: 300 }, (_, index) => `G1 X${index}`).join(
      '\n',
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        TextField,
        'P1S start G-code',
      ).props.onChangeText(code),
    );
    expect(JSON.parse(String(currentDraft.gcode_snippets)).P1S).toEqual({
      start_gcode: code,
      end_gcode: 'M84',
    });
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'CUSTOM chamber target (°C)',
      ).props.onChange(60),
    );
    expect(
      JSON.parse(String(currentDraft.preheat_filament_targets)).CUSTOM,
    ).toBe(60);
    await act(async () => renderer.unmount());
  });

  it('edits drying hardware/material presets, sustained trigger and inherited humidity independently', async () => {
    const renderer = await renderSettings(QueueWorkflowSettings, {
      ams_humidity_fair: 60,
      ams_humidity_thresholds: '{"default":55,"PLA":40}',
    });
    await act(async () =>
      componentWithLabel(
        renderer,
        OptionChipsField,
        'Ambient humidity trigger',
      ).props.onChange('sustained'),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'ASA AMS HT (N3S) °C',
      ).props.onChange(80),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'ASA AMS HT (N3S) hours',
      ).props.onChange(9),
    );
    expect(currentDraft.ambient_drying_sustained_minutes).toBe(15);
    expect(JSON.parse(String(currentDraft.drying_presets)).ASA).toEqual({
      n3f: 65,
      n3s: 80,
      n3f_hours: 12,
      n3s_hours: 9,
    });
    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'PLA: use inherited threshold',
      ).props.onPress(),
    );
    expect(JSON.parse(String(currentDraft.ams_humidity_thresholds))).toEqual({
      default: 55,
    });
    expect(
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'PLA humidity trigger (%)',
      ).props.value,
    ).toBe(55);
    await act(async () => renderer.unmount());
  });

  it('loads concurrent upload limits and independently edits queued-print keep-warm policy', async () => {
    const renderer = await renderSettings(QueueSettingsSection, {
      queue_max_concurrent_uploads: 8,
      preheat_enabled: true,
      require_plate_clear: true,
      queue_keep_bed_warm: false,
      queue_keep_warm_bed_temp: 85,
      queue_keep_warm_max_minutes: 60,
    });

    expect(
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'Maximum concurrent queue uploads (1–16)',
      ).props.value,
    ).toBe(8);
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'Maximum concurrent queue uploads (1–16)',
      ).props.onChange(16),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        SwitchRow,
        'Keep bed warm while awaiting plate clear',
      ).props.onValueChange(true),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'Keep-warm bed target (°C)',
      ).props.onChange(95),
    );
    expect(currentDraft).toEqual(
      expect.objectContaining({
        queue_max_concurrent_uploads: 16,
        queue_keep_bed_warm: true,
        queue_keep_warm_bed_temp: 95,
        queue_keep_warm_max_minutes: 60,
      }),
    );
    await act(async () => renderer.unmount());
  });

  it('rejects invalid numbers instead of persisting an out-of-range value, while allowing zero soak', async () => {
    const change = jest.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <WorkflowNumberField
          label="Soak"
          value={300}
          min={0}
          max={1800}
          onChange={change}
        />,
      );
    });
    await act(async () =>
      renderer.root.findByType(TextInput).props.onChangeText('1801'),
    );
    expect(change).not.toHaveBeenCalled();
    await act(async () =>
      renderer.root.findByType(TextInput).props.onChangeText('0'),
    );
    expect(change).toHaveBeenCalledWith(0);
    await act(async () => renderer.unmount());
  });

  it('loads retention, saves the independent purge policy and keeps library/current finish-photo values', async () => {
    mockApi.saveArchiveRetention.mockImplementation(async value => value);
    const renderer = await renderSettings(GeneralWorkflowSettings, {
      capture_finish_photo: true,
      finish_photo_restore_plate: false,
      library_archive_mode: 'never',
      library_disk_warning_gb: 2.5,
    });
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 10));
    });
    expect(
      componentWithLabel(
        renderer,
        SwitchRow,
        'Restore plate after finish photo',
      ).props.value,
    ).toBe(false);
    await act(async () =>
      componentWithLabel(
        renderer,
        SwitchRow,
        'Restore plate after finish photo',
      ).props.onValueChange(true),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        OptionChipsField,
        'Create archive when printing from library',
      ).props.onChange('ask'),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        SwitchRow,
        'Also permanently delete statistics',
      ).props.onValueChange(true),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'Maximum archive age (days)',
      ).props.onChange(30),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'Save archive retention',
      ).props.onPress(),
    );
    expect(mockApi.saveArchiveRetention).toHaveBeenCalledWith(
      { enabled: false, days: 30, purge_stats: true },
      expect.anything(),
    );
    expect(currentDraft).toEqual({
      capture_finish_photo: true,
      finish_photo_restore_plate: true,
      library_archive_mode: 'ask',
      library_disk_warning_gb: 2.5,
    });
    await act(async () => renderer.unmount());
  });

  it('locks all retention editors until the submitted policy has finished saving', async () => {
    let finishSave!: (settings: ArchiveRetentionSettings) => void;
    mockApi.saveArchiveRetention.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishSave = resolve;
        }),
    );
    const renderer = await renderSettings(GeneralWorkflowSettings, {});
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 10));
    });
    await act(async () =>
      componentWithLabel(
        renderer,
        SwitchRow,
        'Auto-purge old archives',
      ).props.onValueChange(true),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'Maximum archive age (days)',
      ).props.onChange(30),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'Save archive retention',
      ).props.onPress(),
    );
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 10));
    });
    expect(mockApi.saveArchiveRetention).toHaveBeenCalledWith(
      { enabled: true, days: 30, purge_stats: false },
      expect.anything(),
    );
    expect(
      componentWithLabel(renderer, SwitchRow, 'Auto-purge old archives').props
        .disabled,
    ).toBe(true);
    expect(
      componentWithLabel(
        renderer,
        SwitchRow,
        'Also permanently delete statistics',
      ).props.disabled,
    ).toBe(true);
    const ageInput = renderer.root
      .findAllByType(TextInput)
      .find(
        input =>
          input.props.accessibilityLabel === 'Maximum archive age (days)',
      )!;
    expect(ageInput.props.editable).toBe(false);
    await act(async () => ageInput.props.onChangeText('90'));
    expect(ageInput.props.value).toBe('30');
    await act(async () =>
      finishSave({ enabled: true, days: 30, purge_stats: false }),
    );
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 10));
    });
    expect(
      componentWithLabel(
        renderer,
        WorkflowNumberField,
        'Maximum archive age (days)',
      ).props.value,
    ).toBe(30);
    expect(
      componentWithLabel(renderer, SwitchRow, 'Auto-purge old archives').props
        .disabled,
    ).toBe(false);
    expect(
      componentWithLabel(
        renderer,
        SwitchRow,
        'Also permanently delete statistics',
      ).props.disabled,
    ).toBe(false);
    expect(
      renderer.root
        .findAllByType(TextInput)
        .find(
          input =>
            input.props.accessibilityLabel === 'Maximum archive age (days)',
        )!.props.editable,
    ).toBe(true);
    await act(async () =>
      componentWithLabel(
        renderer,
        SwitchRow,
        'Auto-purge old archives',
      ).props.onValueChange(false),
    );
    expect(
      componentWithLabel(renderer, SwitchRow, 'Auto-purge old archives').props
        .value,
    ).toBe(false);
    await act(async () => renderer.unmount());
  });

  it('saves pending credentials before testing and preserves explicit no-printer targeting', async () => {
    mockApi.testDetection.mockResolvedValue({
      ok: true,
      auth_ok: null,
      status_code: 200,
      body: 'ok',
      error: null,
    });

    const renderer = await renderSettings(FailureDetectionSettingsSection, {
      obico_ml_url: 'http://ml:3333',
      obico_ml_token: 'new-token',
      obico_enabled_printers: '[]',
    });
    expect(
      componentWithLabel(renderer, OptionChipsField, 'Monitored printers').props
        .value,
    ).toBe('custom');
    expect(componentWithLabel(renderer, SwitchRow, 'Alpha').props.value).toBe(
      false,
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'Save and test connection',
      ).props.onPress(),
    );
    expect(settingsApi.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        obico_ml_token: 'new-token',
        obico_enabled_printers: '[]',
      }),
    );
    expect(mockApi.testDetection).toHaveBeenCalledWith(
      'http://ml:3333',
      'new-token',
    );
    expect(
      jest.mocked(settingsApi.updateSettings).mock.invocationCallOrder[0],
    ).toBeLessThan(mockApi.testDetection.mock.invocationCallOrder[0]);
    expect(
      renderer.root
        .findAllByType(Text)
        .some(node =>
          String(node.props.children).includes('could not be verified'),
        ),
    ).toBe(true);
    await act(async () => renderer.unmount());
  });

  it('does not report healthy or test unsaved credentials after a failed save', async () => {
    jest
      .mocked(settingsApi.updateSettings)
      .mockRejectedValue(new Error('Save denied'));
    const renderer = await renderSettings(FailureDetectionSettingsSection, {
      obico_ml_url: 'http://ml:3333',
      obico_ml_token: 'unsaved',
    });

    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'Save and test connection',
      ).props.onPress(),
    );
    expect(mockApi.testDetection).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('loads configured models independently of the external-camera-only controller query', async () => {
    const renderer = await renderSettings(QueueWorkflowSettings, {});
    expect(
      componentWithLabel(renderer, TextField, 'P1S start G-code').props.value,
    ).toBe('');
    expect(
      componentWithLabel(renderer, TextField, 'H2D end G-code').props.value,
    ).toBe('');
    expect(printersApi.getPrinters).toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('saves disabled detection and printer targeting without requiring a reachable ML service', async () => {
    const renderer = await renderSettings(FailureDetectionSettingsSection, {
      obico_enabled: false,
      obico_ml_url: '',
      obico_ml_token: '',
      obico_enabled_printers: '[]',
    });
    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'Save failure-detection settings',
      ).props.onPress(),
    );
    expect(settingsApi.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        obico_enabled: false,
        obico_enabled_printers: '[]',
      }),
    );
    expect(mockApi.testDetection).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('does not report a previous saved configuration healthy when fields change during testing', async () => {
    let resolveTest!: (result: WorkflowObicoTestResult) => void;
    mockApi.testDetection.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveTest = resolve;
        }),
    );
    const renderer = await renderSettings(FailureDetectionSettingsSection, {
      obico_ml_url: 'http://ml:3333',
      obico_ml_token: 'saved',
    });
    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'Save and test connection',
      ).props.onPress(),
    );
    await act(async () =>
      componentWithLabel(renderer, TextField, 'ML token').props.onChangeText(
        'pending',
      ),
    );
    await act(async () =>
      resolveTest({
        ok: true,
        auth_ok: true,
        status_code: 200,
        body: 'ok',
        error: null,
      }),
    );
    expect(
      renderer.root
        .findAllByType(Text)
        .some(
          node =>
            node.props.children ===
            'Configuration changed during the test. Save and test the pending edits again.',
        ),
    ).toBe(true);
    expect(
      renderer.root
        .findAllByType(Text)
        .some(node =>
          String(node.props.children).includes('authentication accepted'),
        ),
    ).toBe(false);
    await act(async () => renderer.unmount());
  });

  it('searches nested security settings and selects the corresponding panel and identified control', async () => {
    function SearchHarness({
      controller,
    }: {
      controller: SettingsScreenController;
    }) {
      const selected = useSettingsSearchTarget();
      return (
        <>
          <SettingsSectionsList controller={controller} />
          <Text>{selected?.label}</Text>
        </>
      );
    }
    const renderer = await renderSettings(SearchHarness, {});
    await act(async () =>
      renderer.root
        .findAllByType(TextInput)
        .find(input => input.props.placeholder === 'Search all settings')!
        .props.onChangeText('bind password'),
    );
    const result = renderer.root
      .findAllByType(Text)
      .find(node => node.props.children === 'Bind password')!;
    let ancestor = result.parent;
    while (ancestor && !ancestor.props.onPress) ancestor = ancestor.parent;
    await act(async () => ancestor!.props.onPress());
    expect(mockSetSection).toHaveBeenCalledWith('users');
    expect(mockSetUserPanel).toHaveBeenCalledWith('ldap');
    expect(searchSettings('nozzle preset')).toHaveLength(3);
    expect(searchSettings('port').map(item => item.section)).toEqual(
      expect.arrayContaining(['mqtt', 'users']),
    );
    await act(async () => renderer.unmount());
  });

  it('identifies the matched native control without highlighting controls outside the settings host', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <SettingsSearchFocusProvider
          content={{ current: null }}
          scroll={{ current: null }}
        >
          <TextField label="Bind password" value="" onChangeText={() => {}} />
        </SettingsSearchFocusProvider>,
      );
    });
    await act(async () =>
      selectSettingsSearchResult({
        section: 'users',
        panel: 'ldap',
        label: 'Bind password',
      }),
    );
    expect(announce).toHaveBeenCalledWith('Bind password');
    expect(
      renderer.root
        .findAllByType(View)
        .some(node => StyleSheet.flatten(node.props.style)?.borderWidth === 2),
    ).toBe(true);
    await act(async () => renderer.unmount());
    await act(async () => {
      renderer = create(
        <TextField label="Bind password" value="" onChangeText={() => {}} />,
      );
    });
    expect(
      renderer.root
        .findAllByType(View)
        .some(node => StyleSheet.flatten(node.props.style)?.borderWidth === 2),
    ).toBe(false);
    expect(announce).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
    announce.mockRestore();
  });

  it('browses grouped OpenAPI endpoints and executes/copies a response using explicit test credentials', async () => {
    jest.mocked(apiExplorerApi.getSchema).mockResolvedValue({
      paths: {
        '/api/v1/printers/{id}': {
          get: {
            summary: 'Printer status',
            tags: ['printers'],
            parameters: [{ name: 'id', in: 'path', required: true }],
          },
        },
      },
    });
    jest.mocked(apiExplorerApi.execute).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      duration: 123,
      body: '{"online":true}',
      headers: {},
    });
    const renderer = await renderSettings(ApiExplorerSettings, {});
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 10));
    });
    await act(async () =>
      componentWithLabel(renderer, SettingRow, 'printers (1)').props.onPress(),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        SettingRow,
        'GET /api/v1/printers/{id}',
      ).props.onPress(),
    );
    await act(async () =>
      componentWithLabel(
        renderer,
        TextField,
        'API test key',
      ).props.onChangeText('test-key'),
    );
    await act(async () =>
      componentWithLabel(renderer, TextField, 'path: id *').props.onChangeText(
        '7',
      ),
    );
    await act(async () =>
      componentWithLabel(renderer, PrimaryButton, 'Execute').props.onPress(),
    );
    expect(apiExplorerApi.execute).toHaveBeenCalledWith(
      '/api/v1/printers/{id}',
      'get',
      expect.anything(),
      { 'path:id': '7' },
      '',
      'test-key',
    );
    expect(
      renderer.root
        .findAllByType(Text)
        .some(node => node.props.children === 'HTTP 200 OK • 123 ms'),
    ).toBe(true);
    await act(async () =>
      componentWithLabel(
        renderer,
        PrimaryButton,
        'Copy response',
      ).props.onPress(),
    );
    expect(
      JSON.parse(jest.mocked(Clipboard.setString).mock.calls[0][0]),
    ).toEqual(
      expect.objectContaining({
        body: '{"online":true}',
        status: 200,
        duration: 123,
      }),
    );
    await act(async () => renderer.unmount());
  });
});
