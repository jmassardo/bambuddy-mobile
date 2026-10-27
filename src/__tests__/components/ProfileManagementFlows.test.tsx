import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { profileManagementApi } from '@/api/profileManagement';
import { maintenanceApi } from '@/api/maintenance';
import { printersApi } from '@/api/printers';
import { request } from '@/api/http';
import { PresetEditor } from '@/components/profiles/PresetEditor';
import { PresetTemplates } from '@/components/profiles/PresetTemplates';
import { KProfileManager } from '@/components/profiles/KProfileManager';
import { OrcaDeviceAuthorization } from '@/components/profiles/OrcaDeviceAuthorization';
import {
  MaintenanceControls,
  RestoreMaintenanceDefaults,
} from '@/components/profiles/MaintenanceControls';
import { MaintenanceTypeFormModal } from '@/screens/MaintenanceScreen';
import { pickProfileJson, shareProfileJson } from '@/utils/profileFiles';
import type {
  KProfile,
  MaintenanceStatus,
  MaintenanceType,
  PrinterMaintenanceOverview,
  Printer,
} from '@/types/api';

const mockToast = jest.fn();
let mockCanWrite = true;
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => mockCanWrite }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: require('@/theme/tokens').colors.dark,
    isDark: true,
  }),
}));
jest.mock('@/utils/profileFiles', () => ({
  pickProfileJson: jest.fn(),
  shareProfileJson: jest.fn(),
}));
jest.mock('@/api/http', () => ({ request: jest.fn() }));
jest.mock('@/api/client', () => ({ api: {} }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('@/api/printers', () => ({
  printersApi: { getPrinters: jest.fn(), getPrinterStatus: jest.fn() },
}));
jest.mock('@/api/maintenance', () => ({
  maintenanceApi: {
    setPrinterHours: jest.fn(),
    updateMaintenanceItem: jest.fn(),
    removeMaintenanceItem: jest.fn(),
    restoreDefaultMaintenanceTypes: jest.fn(),
  },
}));
jest.mock('@/api/profileManagement', () => ({
  ...jest.requireActual('@/api/profileManagement'),
  profileManagementApi: {
    detail: jest.fn(),
    fields: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    orcaStart: jest.fn(),
    orcaPoll: jest.fn(),
    kList: jest.fn(),
    kSave: jest.fn(),
    kBatch: jest.fn(),
    kRemove: jest.fn(),
    kNotes: jest.fn(),
    kNote: jest.fn(),
    localList: jest.fn(),
  },
}));
const mockApi = jest.mocked(profileManagementApi);
const kProfile: KProfile = {
  slot_id: 4,
  extruder_id: 1,
  nozzle_id: 'HH00-0.6',
  nozzle_diameter: '0.6',
  filament_id: 'GFA00',
  name: 'PLA calibration',
  k_value: '0.020000',
  n_coef: '0',
  ams_id: 0,
  tray_id: -1,
  setting_id: 'original',
};
const printer = {
  printer_id: 12,
  printer_name: 'Farm printer',
  printer_model: 'X2D',
  total_print_hours: 100,
  maintenance_items: [],
} as unknown as PrinterMaintenanceOverview;
const item = {
  id: 8,
  interval_hours: 100,
  interval_type: 'hours',
  maintenance_type_name: 'Clean Steel Rods',
  maintenance_type_wiki_url: null,
} as MaintenanceStatus;
const clients: QueryClient[] = [];
async function mount(element: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  clients.push(client);
  return {
    ...(await render(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    )),
    client,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockCanWrite = true;
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  mockApi.fields.mockResolvedValue({
    fields: [
      {
        key: 'temperature',
        label: 'Temperature',
        type: 'number',
        category: 'basic',
      },
    ],
  });
  mockApi.detail.mockImplementation(async id => ({
    name: id === 'base' ? 'Base' : 'Owned',
    type: 'filament',
    base_id: id === 'base' ? null : 'base',
    setting:
      id === 'base'
        ? { temperature: ['200'], inherited: true }
        : { temperature: ['215'], unknown: { retain: true } },
  }));
  mockApi.kNotes.mockResolvedValue({ notes: { original: 'Original note' } });
  mockApi.kList.mockResolvedValue({
    profiles: [kProfile],
    nozzle_diameter: '0.6',
  });
  jest
    .mocked(printersApi.getPrinters)
    .mockResolvedValue([
      { id: 12, name: 'Farm printer', nozzle_count: 2 } as Printer &
        Record<string, unknown>,
    ]);
  jest
    .mocked(printersApi.getPrinterStatus)
    .mockResolvedValue({ connected: true } as Awaited<
      ReturnType<typeof printersApi.getPrinterStatus>
    >);
  mockApi.localList.mockResolvedValue({
    filament: [],
    printer: [],
    process: [],
  });
  jest.mocked(request).mockResolvedValue([]);
});
afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
  jest.useRealTimers();
});

it('corrects lifetime hours without recording completion and validates nonnegative values', async () => {
  const screen = await mount(<MaintenanceControls printer={printer} />);
  await fireEvent.press(screen.getByText('Correct lifetime hours'));
  await fireEvent.changeText(
    screen.getByLabelText('Total lifetime hours'),
    '-1',
  );
  expect(
    screen.getByRole('button', { name: 'Save' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  await fireEvent.changeText(
    screen.getByLabelText('Total lifetime hours'),
    '0',
  );
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(maintenanceApi.setPrinterHours).toHaveBeenCalledWith(12, 0),
  );
});

it('saves per-printer day overrides, resets both nullable fields and confirms removal', async () => {
  const screen = await mount(
    <MaintenanceControls printer={printer} item={item} />,
  );
  await fireEvent.press(screen.getByText('Override interval'));
  await fireEvent.press(screen.getByText('Days'));
  await fireEvent.changeText(screen.getByLabelText('Interval'), '30');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(maintenanceApi.updateMaintenanceItem).toHaveBeenCalledWith(8, {
      custom_interval_hours: 30,
      custom_interval_type: 'days',
    }),
  );
  await waitFor(() => expect(screen.queryByLabelText('Interval')).toBeNull());
  await fireEvent.press(screen.getByText('Use type default interval'));
  await waitFor(() =>
    expect(maintenanceApi.updateMaintenanceItem).toHaveBeenLastCalledWith(8, {
      custom_interval_hours: null,
      custom_interval_type: null,
    }),
  );
  const alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByText('Remove assignment'));
  expect(maintenanceApi.removeMaintenanceItem).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls[0][2]?.[1].onPress?.());
  expect(maintenanceApi.removeMaintenanceItem).toHaveBeenCalledWith(8);
});

it('restores built-ins and reports how many were restored', async () => {
  jest
    .mocked(maintenanceApi.restoreDefaultMaintenanceTypes)
    .mockResolvedValue({ restored: 3 });
  const screen = await mount(<RestoreMaintenanceDefaults />);
  await fireEvent.press(screen.getByText('Restore default types'));
  await waitFor(() =>
    expect(mockToast).toHaveBeenCalledWith(
      '3 default types restored.',
      'success',
    ),
  );
});

it('hides maintenance mutations from read-only users', async () => {
  mockCanWrite = false;
  const screen = await mount(
    <MaintenanceControls printer={printer} item={item} />,
  );
  expect(screen.queryByText('Override interval')).toBeNull();
  expect(screen.queryByText('Remove assignment')).toBeNull();
  expect(screen.getByText('Documentation')).toBeTruthy();
});

it('preserves explicit icons and documentation during unrelated type edits', async () => {
  const onSubmit = jest.fn();
  const type = {
    id: 2,
    name: 'Clean steel',
    description: 'Guide',
    default_interval_hours: 200,
    interval_type: 'hours',
    icon: 'CircleDot',
    wiki_url: 'https://example.com/guide',
    is_system: false,
  } as MaintenanceType;
  const screen = await mount(
    <MaintenanceTypeFormModal
      visible
      type={type}
      loading={false}
      printers={[printer]}
      onClose={jest.fn()}
      onSubmit={onSubmit}
    />,
  );
  await fireEvent.changeText(
    screen.getByLabelText('Name'),
    'Clean polished steel',
  );
  await fireEvent.press(screen.getByText('Save'));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Clean polished steel',
      icon: 'CircleDot',
      wiki_url: 'https://example.com/guide',
    }),
    [],
  );
});

it('chooses initial printers and an explicit icon when creating a maintenance type', async () => {
  const onSubmit = jest.fn();
  const screen = await mount(
    <MaintenanceTypeFormModal
      visible
      type={null}
      loading={false}
      printers={[printer]}
      onClose={jest.fn()}
      onSubmit={onSubmit}
    />,
  );
  await fireEvent.changeText(
    screen.getByLabelText('Name'),
    'Inspect enclosure',
  );
  await fireEvent.press(screen.getByText('Farm printer'));
  await fireEvent.press(screen.getByText('Fan'));
  await fireEvent.changeText(
    screen.getByLabelText('Documentation URL (https://…)'),
    'https://example.com/enclosure',
  );
  await fireEvent.press(screen.getByText('Save'));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Inspect enclosure',
      icon: 'Fan',
      wiki_url: 'https://example.com/enclosure',
    }),
    [12],
  );
});

it('edits raw settings without losing unknown values and rejects invalid JSON before saving', async () => {
  const screen = await mount(
    <PresetEditor
      visible
      profile={{ setting_id: 'owned', type: 'filament', is_custom: true }}
      profiles={[]}
      onClose={jest.fn()}
    />,
  );
  await screen.findByDisplayValue('Owned');
  await fireEvent.press(screen.getByText('JSON'));
  await fireEvent.changeText(
    screen.getByLabelText('Raw settings JSON'),
    '{invalid',
  );
  await fireEvent.press(screen.getByText('Save'));
  expect(mockApi.update).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText('Raw settings JSON'),
    '{"temperature":["220"],"unknown":{"retain":true},"custom":null}',
  );
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockApi.update).toHaveBeenCalledWith('owned', {
      name: 'Owned',
      setting: {
        temperature: ['220'],
        unknown: { retain: true },
        custom: null,
      },
    }),
  );
});

it('creates a duplicated process preset with print type and selected base, retaining unknown settings', async () => {
  mockApi.detail.mockResolvedValue({
    name: 'Process',
    type: 'process',
    setting: { speed: ['150'], unknown: 'retain' },
  });
  const screen = await mount(
    <PresetEditor
      visible
      duplicate
      profile={{ setting_id: 'process-base', type: 'process' }}
      profiles={[]}
      onClose={jest.fn()}
    />,
  );
  await screen.findByDisplayValue('Process (copy)');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'print',
        base_id: 'process-base',
        setting: {
          speed: ['150'],
          unknown: 'retain',
          print_settings_id: '"Process (copy)"',
        },
      }),
    ),
  );
});

it('validates typed preset fields before save and preserves numeric-string arrays', async () => {
  const screen = await mount(
    <PresetEditor
      visible
      profile={{ setting_id: 'owned', type: 'filament', is_custom: true }}
      profiles={[]}
      onClose={jest.fn()}
    />,
  );
  const temperature = await screen.findByLabelText('Temperature');
  await fireEvent.changeText(temperature, 'bad');
  expect(
    screen.getByRole('button', { name: 'Save' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  await fireEvent.changeText(temperature, '230');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockApi.update).toHaveBeenCalledWith(
      'owned',
      expect.objectContaining({
        setting: { temperature: ['230'], unknown: { retain: true } },
      }),
    ),
  );
});

it('persists templates, manages visibility and applies typed settings', async () => {
  const onApply = jest.fn();
  const screen = await mount(
    <PresetTemplates
      type="filament"
      settings={{ temperature: ['220'], custom: false }}
      onApply={onApply}
    />,
  );
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
  await fireEvent.changeText(
    screen.getByLabelText('Template name'),
    'Warm PLA',
  );
  await fireEvent.changeText(
    screen.getByLabelText('Description'),
    'High speed',
  );
  await fireEvent.press(screen.getByText('Save current changes as template'));
  await screen.findByText('Warm PLA · filament');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    'bambuddy_preset_templates',
    expect.stringContaining('"temperature":["220"]'),
  );
  await fireEvent.press(screen.getByText('Apply template'));
  expect(onApply).toHaveBeenCalledWith(
    { temperature: ['220'], custom: false },
    'filament',
  );
  await fireEvent(
    screen.getByLabelText('Show in editor'),
    'valueChange',
    false,
  );
  await waitFor(() =>
    expect(screen.queryByText('Warm PLA · filament')).toBeNull(),
  );
  await fireEvent.press(screen.getByText('Manage hidden templates'));
  expect(screen.getByText('Warm PLA · filament')).toBeTruthy();
});

it('uses the selected live printer/nozzle, preserves edit identity and copies to both extruders', async () => {
  const screen = await mount(<KProfileManager />);
  await screen.findByText('PLA calibration');
  await fireEvent.press(screen.getByText('0.6 mm'));
  await waitFor(() =>
    expect(mockApi.kList).toHaveBeenLastCalledWith(12, '0.6'),
  );
  await fireEvent.press(await screen.findByText('Edit'));
  await screen.findByDisplayValue('PLA calibration');
  await fireEvent.changeText(screen.getByLabelText('K value'), '0.035');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockApi.kSave).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        slot_id: 4,
        extruder_id: 1,
        nozzle_id: 'HH00-0.6',
        filament_id: 'GFA00',
        setting_id: 'original',
        k_value: '0.035000',
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByLabelText('K value')).toBeNull());
  await fireEvent.press(screen.getByText('Copy to another nozzle / extruder'));
  await screen.findByDisplayValue('PLA calibration (copy)');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(mockApi.kBatch).toHaveBeenCalledWith(12, [
      expect.objectContaining({ slot_id: 0, extruder_id: 0, setting_id: null }),
      expect.objectContaining({ slot_id: 0, extruder_id: 1, setting_id: null }),
    ]),
  );
});

it('exports the selected nozzle and bulk deletion requires identity-aware confirmation', async () => {
  const screen = await mount(<KProfileManager />);
  await screen.findByText('PLA calibration');
  await fireEvent.press(screen.getByText('Export printer/nozzle JSON'));
  expect(shareProfileJson).toHaveBeenCalledWith(
    expect.objectContaining({ printer_id: 12, profiles: [kProfile] }),
    'Farm printer-K-0.4',
  );
  await fireEvent.press(screen.getByText('Select profiles'));
  await fireEvent.press(screen.getByText('Select all matching'));
  const alert = jest.spyOn(Alert, 'alert');
  alert.mockClear();
  await fireEvent.press(screen.getByText('Delete selected (1)'));
  expect(mockApi.kRemove).not.toHaveBeenCalled();
  expect(alert.mock.calls[0][1]).toContain('HH00-0.6 · L · 4');
  await act(async () => alert.mock.calls[0][2]?.[1].onPress?.());
  await waitFor(() =>
    expect(mockApi.kRemove).toHaveBeenCalledWith(12, kProfile),
  );
});

it('previews native JSON imports and creates new slots instead of reusing exported identities', async () => {
  jest
    .mocked(pickProfileJson)
    .mockResolvedValue({
      nozzle_diameter: '0.4',
      profiles: [
        { ...kProfile, nozzle_diameter: '0.4', nozzle_id: 'HH00-0.4' },
      ],
    });
  const screen = await mount(<KProfileManager />);
  await screen.findByText('PLA calibration');
  await fireEvent.press(screen.getByText('Import K profile JSON'));
  await screen.findByText('Import 1 profiles into Farm printer / 0.4 mm?');
  expect(mockApi.kBatch).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Confirm'));
  await waitFor(() =>
    expect(mockApi.kBatch).toHaveBeenCalledWith(12, [
      expect.objectContaining({ slot_id: 0, nozzle_diameter: '0.4' }),
    ]),
  );
});

describe('Orca device authorization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockApi.orcaStart.mockResolvedValue({
      user_code: 'TEST-CODE',
      verification_uri: 'https://orca.example/device',
      verification_uri_complete: 'https://orca.example/device?code=TEST-CODE',
      interval: 2,
      expires_in: 30,
    });
  });
  it('displays the approval code, polls pending approval and refreshes after completion', async () => {
    mockApi.orcaPoll
      .mockResolvedValueOnce({
        status: 'authorization_pending',
        connected: false,
      })
      .mockResolvedValueOnce({ status: 'complete', connected: true });
    const screen = await mount(<OrcaDeviceAuthorization />);
    const invalidate = jest.spyOn(screen.client, 'invalidateQueries');
    await fireEvent.press(screen.getByText('Connect with device approval'));
    expect(screen.getByText('Approval code: TEST-CODE')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Waiting for approval…')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Orca Cloud connected.')).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['orcaCloudProfiles'],
    });
    expect(screen.queryByText('Approval code: TEST-CODE')).toBeNull();
  });
  it.each(['access_denied', 'expired_token'] as const)(
    'shows terminal %s and stops polling',
    async status => {
      mockApi.orcaPoll.mockResolvedValue({ status, connected: false });
      const screen = await mount(<OrcaDeviceAuthorization />);
      await fireEvent.press(screen.getByText('Connect with device approval'));
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(
        screen.getByText(
          status === 'access_denied'
            ? 'Approval denied. Start again to retry.'
            : 'Approval expired. Start again to retry.',
        ),
      ).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });
      expect(mockApi.orcaPoll).toHaveBeenCalledTimes(1);
    },
  );
  it('cancels the local polling loop and never collects an Orca password', async () => {
    const screen = await mount(<OrcaDeviceAuthorization />);
    await fireEvent.press(screen.getByText('Connect with device approval'));
    await fireEvent.press(screen.getByText('Cancel'));
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(mockApi.orcaPoll).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
  it('backs off after slow_down and expires locally without making another token request', async () => {
    mockApi.orcaStart.mockResolvedValue({
      user_code: 'SHORT',
      verification_uri: 'https://orca.example/device',
      verification_uri_complete: '',
      interval: 2,
      expires_in: 6,
    });
    mockApi.orcaPoll.mockResolvedValue({
      status: 'slow_down',
      connected: false,
    });
    const screen = await mount(<OrcaDeviceAuthorization />);
    await fireEvent.press(screen.getByText('Connect with device approval'));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(mockApi.orcaPoll).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('Waiting for approval; polling less frequently…'),
    ).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3999);
    });
    expect(mockApi.orcaPoll).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(
      screen.getByText('Approval expired. Start again to retry.'),
    ).toBeTruthy();
    expect(mockApi.orcaPoll).toHaveBeenCalledTimes(1);
  });
});
