import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { request, requestBlob } from '@/api/http';
import { settingsApi } from '@/api/settings';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  ChoiceField,
  InventoryModal,
  Toggle,
} from '@/components/inventory/InventoryControls';
import { InventoryBulkEditor } from '@/components/inventory/InventoryBulkEditor';
import { SpoolEditor } from '@/components/inventory/SpoolEditor';
import {
  AmsThresholdSettings,
  SpoolmanPolicySettings,
} from '@/components/inventory/InventoryPolicySettings';
import {
  EnvironmentBindings,
  EnvironmentDefaults,
} from '@/components/inventory/InventoryEnvironment';
import { InventoryForecast } from '@/components/inventory/InventoryForecast';
import { InventoryDirectory } from '@/components/inventory/InventoryDirectory';
import { InventoryLabels } from '@/components/inventory/InventoryLabels';
import { SpoolDetails } from '@/components/inventory/SpoolDetails';
import AsyncStorage from '@react-native-async-storage/async-storage';
import InventoryScreen from '@/screens/InventoryScreen';
import { waitFor } from '@testing-library/react-native';

const mockNavigation = { navigate: jest.fn(), setOptions: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

jest.mock('@/api/http', () => ({ request: jest.fn(), requestBlob: jest.fn() }));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: { csv: 'text/csv' },
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  isErrorWithCode: () => false,
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    isAdmin: true,
  }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: {
      text: '#ffffff',
      background: '#000000',
      surface: '#111111',
      border: '#222222',
    },
  }),
}));
jest.mock('@/components/common/ConfirmModal', () => ({
  ConfirmModal: () => null,
}));
jest.mock('@/components/inventory/InventoryControls', () => {
  const ReactModule = require('react');
  const Native = require('react-native');
  const actual = jest.requireActual('@/components/inventory/InventoryControls');
  return {
    ...actual,
    InventoryModal: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(Native.View, null, children),
  };
});
jest.mock('@/utils/share', () => ({ shareBlob: jest.fn() }));
jest.mock('react-native-svg', () => {
  const Native = require('react-native');
  return {
    __esModule: true,
    default: Native.View,
    Circle: Native.View,
    Defs: Native.View,
    LinearGradient: Native.View,
    Pattern: Native.View,
    Line: Native.View,
    Polyline: Native.View,
    Rect: Native.View,
    Stop: Native.View,
  };
});
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const ReactModule = require('react');
  const Native = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(Native.View, null, children),
  };
});
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
    }) => ReactModule.createElement(View, null, ListHeaderComponent, data.length
      ? data.map((item, index) => ReactModule.createElement(View, { key: index }, renderItem({ item, index })))
      : ListEmptyComponent),
  };
});
const mockRequest = jest.mocked(request);
const mockBlob = jest.mocked(requestBlob);
const renderers: Renderer.ReactTestRenderer[] = [];
const clients: QueryClient[] = [];
async function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  clients.push(client);
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    );
  });
  renderers.push(renderer);
  await settle();
  return renderer;
}
async function settle() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 15));
  });
}
function button(renderer: Renderer.ReactTestRenderer, label: string) {
  const node = renderer.root
    .findAllByType(PrimaryButton)
    .find(entry => entry.props.label === label);
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}
function toggle(renderer: Renderer.ReactTestRenderer, label: string) {
  const node = renderer.root
    .findAllByType(Toggle)
    .find(entry => entry.props.label === label);
  if (!node) throw new Error(`Missing toggle: ${label}`);
  return node;
}
async function press(renderer: Renderer.ReactTestRenderer, label: string) {
  await act(async () => {
    button(renderer, label).props.onPress();
  });
  await settle();
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue();
  mockBlob.mockResolvedValue(new Blob());
  mockRequest.mockImplementation(async path => {
    if (path === '/settings/')
      return {
        location_sensor_poll_interval: 120,
        ams_humidity_good: 40,
        ams_humidity_fair: 60,
        ams_temp_good: 28,
        ams_temp_fair: 35,
        ams_temp_alarm: 50,
      };
    if (path === '/settings/spoolman')
      return {
        spoolman_enabled: 'true',
        spoolman_url: 'http://spoolman',
        spoolman_sync_mode: 'auto',
        spoolman_disable_weight_sync: 'false',
        spoolman_report_partial_usage: 'true',
      };
    if (path === '/inventory/locations')
      return [{ id: 8, name: 'Dry cabinet' }];
    return [];
  });

});

it('keeps spool content reachable while disclosing secondary inventory tools and active-filter clearing', async () => {
    const fallback = mockRequest.getMockImplementation()!;
    mockRequest.mockImplementation(async (path, options) => {
      if (path === '/settings/spoolman') return { spoolman_enabled: 'false' };
      if (String(path).startsWith('/inventory/spools')) return [{ id: 1, brand: 'Bambu', material: 'PLA', label_weight: 1000, weight_used: 10 }];
      return fallback(path, options);
    });
    const renderer = await mount(<InventoryScreen />);
    expect(button(renderer, 'Add spool / quick stock')).toBeTruthy();
    await waitFor(() => expect(renderer.root.findAll(node => String(node.props.accessibilityLabel ?? '').includes('Bambu')).length).toBeGreaterThan(0));
    expect(renderer.root.findAllByType(PrimaryButton).some(node => node.props.label === 'Import CSV')).toBe(false);
    expect(renderer.root.findAllByType(PrimaryButton).some(node => node.props.label === 'Clear all filters')).toBe(false);
    const tools = () => renderer.root.findAll(node => node.props.accessibilityLabel === 'Inventory tools')[0];
    await act(async () => tools().props.onPress());
    expect(button(renderer, 'Import CSV')).toBeTruthy();
    await press(renderer, 'Assignment history');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('SpoolAssignmentHistory');
    expect(tools().props.accessibilityState.expanded).toBe(false);
    const { SearchBar } = require('@/components/common/AppUI');
    await act(async () => renderer.root.findByType(SearchBar).props.onChangeText('Bambu'));
    expect(tools().props.accessibilityState.selected).toBe(true);
    expect(button(renderer, 'Clear all filters')).toBeTruthy();
    await press(renderer, 'Clear all filters');
    expect(tools().props.accessibilityState.selected).toBe(false);
});

it('confirms environmental category replacement before updating the existing binding', async () => {
  const fallback = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation(async (path, options) => {
    if (path === '/location-ha-sensors/' && options?.method === 'GET')
      return [
        {
          id: 21,
          location_id: 8,
          device_class: 'humidity',
          entity_id: 'sensor.old_humidity',
          name: 'Old humidity',
        },
      ];
    if (path === '/location-ha-sensors/entities')
      return [
        {
          entity_id: 'sensor.new_humidity',
          friendly_name: 'New humidity',
          device_class: 'humidity',
          unit_of_measurement: '%',
        },
      ];
    return fallback(path, options);
  });
  const renderer = await mount(<EnvironmentBindings onClose={jest.fn()} />);
  await act(async () =>
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Location')!
      .props.onChange('8'),
  );
  await press(renderer, 'Bind entity');
  await act(async () =>
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Entity')!
      .props.onChange('sensor.new_humidity'),
  );
  await press(renderer, 'Save binding');
  expect(
    mockRequest.mock.calls.some(([, options]) => options?.method === 'PATCH'),
  ).toBe(false);
  await act(async () =>
    renderer.root
      .findAllByType(ConfirmModal)
      .find(node => node.props.visible)!
      .props.onConfirm(),
  );
  await settle();
  expect(mockRequest).toHaveBeenCalledWith(
    '/location-ha-sensors/21',
    expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('"entity_id":"sensor.new_humidity"'),
    }),
  );
});

it('resumes a partially received shopping shipment without recreating successful stock batches', async () => {
  const storage = new Map<string, string>();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async key => storage.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
  const fallback = mockRequest.getMockImplementation()!;
  let singleAttempts = 0;
  mockRequest.mockImplementation(async (path, options) => {
    if (path === '/inventory/shopping-list' && options?.method === 'GET')
      return [
        {
          id: 55,
          material: 'PLA',
          quantity_spools: 101,
          status: 'purchased',
        },
      ];
    if (
      path === '/inventory/spools' &&
      options?.method === 'POST' &&
      ++singleAttempts === 1
    )
      throw new Error('Second batch unavailable');
    return fallback(path, options);
  });
  const renderer = await mount(
    <InventoryForecast spools={[]} spoolman={false} />,
  );
  await press(renderer, 'Shopping list (1)');
  await press(renderer, 'Receive into stock');
  await act(async () =>
    renderer.root
      .findAllByType(ConfirmModal)
      .find(node => node.props.visible)!
      .props.onConfirm(),
  );
  await settle();
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    expect.stringContaining(':false:55'),
    '100',
  );
  await act(async () =>
    renderer.root
      .findAllByType(InventoryModal)
      .find(node => node.props.title === 'Shopping list')!
      .props.onClose(),
  );
  await press(renderer, 'Shopping list (1)');
  await press(renderer, 'Receive into stock');
  await act(async () =>
    renderer.root
      .findAllByType(ConfirmModal)
      .find(node => node.props.visible)!
      .props.onConfirm(),
  );
  await settle();
  expect(
    mockRequest.mock.calls.filter(
      ([path, options]) =>
        path === '/inventory/spools/bulk' && options?.method === 'POST',
    ),
  ).toHaveLength(1);
  expect(mockRequest).toHaveBeenCalledWith(
    '/inventory/shopping-list/55/status',
    expect.objectContaining({ body: '{"status":"received"}' }),
  );
});
afterEach(async () => {
  await act(async () => {
    renderers.splice(0).forEach(renderer => renderer.unmount());
    clients.splice(0).forEach(client => client.clear());
  });
});

it('adds a SKU to the persistent shopping list using desired days of supply', async () => {
  const renderer = await mount(
    <InventoryForecast
      spoolman={false}
      spools={[
        {
          id: 3,
          material: 'PLA',
          brand: 'Maker',
          label_weight: 1000,
          weight_used: 900,
          created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        },
      ]}
    />,
  );
  await press(renderer, 'Expand SKU / spools');
  await press(renderer, 'Add to shopping list');
  await act(async () =>
    toggle(renderer, 'Calculate from desired days of supply').props.onChange(
      true,
    ),
  );
  await act(async () =>
    renderer.root
      .findAllByType(TextField)
      .find(node => node.props.label === 'Days of supply')!
      .props.onChangeText('30'),
  );
  await press(renderer, 'Add to persistent list');
  expect(mockRequest).toHaveBeenCalledWith(
    '/inventory/shopping-list',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        material: 'PLA',
        subtype: null,
        brand: 'Maker',
        color_name: null,
        quantity_spools: 3,
        note: null,
      }),
    }),
  );
});

it('creates configured Spoolman stock from its filament catalog without stamping a synthetic tare override', async () => {
  const fallback = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation(async (path, options) => {
    if (path === '/spoolman/inventory/filaments')
      return [
        {
          id: 90,
          name: 'PLA Silk',
          material: 'PLA',
          color_name: 'Clear',
          color_hex: 'AABBCC80',
          weight: 750,
          vendor: { name: 'Maker' },
        },
      ];
    if (path === '/spoolman/inventory/spools' && options?.method === 'POST')
      return { id: 44 };
    return fallback(path, options);
  });
  const renderer = await mount(
    <SpoolEditor
      spoolman
      spool={null}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  await act(async () =>
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Spoolman filament catalog')!
      .props.onChange('90'),
  );
  expect(
    renderer.root
      .findAllByType(TextField)
      .some(node => node.props.label === 'Material'),
  ).toBe(false);
  expect(
    renderer.root
      .findAllByType(TextField)
      .some(node => node.props.label === 'Material number'),
  ).toBe(false);
  await press(renderer, 'Save');
  const create = mockRequest.mock.calls.find(
    ([path, options]) =>
      path === '/spoolman/inventory/spools' && options?.method === 'POST',
  )!;
  const body = JSON.parse(String(create[1]?.body));
  expect(body).toMatchObject({
    spoolman_filament_id: 90,
    material: 'PLA',
    rgba: 'AABBCC80',
    label_weight: 750,
  });
  expect(body).not.toHaveProperty('core_weight');
  expect(body).not.toHaveProperty('category');
  expect(mockRequest).toHaveBeenCalledWith(
    '/spoolman/inventory/spools/44/filament-presets',
    expect.objectContaining({ method: 'PUT', body: '[]' }),
  );
});

it('bulk edits only checked fields, explicitly clears note, preserves zero and sends structured location identity', async () => {
  const renderer = await mount(
    <InventoryBulkEditor
      ids={[3, 4]}
      spoolman={false}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  await act(async () => {
    toggle(renderer, 'Change Note').props.onChange(true);
    toggle(renderer, 'Change Core weight (g)').props.onChange(true);
    toggle(renderer, 'Change storage location').props.onChange(true);
  });
  await act(async () => {
    renderer.root
      .findAllByType(TextField)
      .find(node => node.props.label === 'Core weight (g)')!
      .props.onChangeText('0');
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Storage location')!
      .props.onChange('8');
  });
  await press(renderer, 'Apply checked fields');
  expect(mockRequest).toHaveBeenCalledWith(
    '/inventory/spools/bulk-update',
    expect.objectContaining({
      body: JSON.stringify({
        ids: [3, 4],
        update: {
          note: null,
          core_weight: 0,
          location_id: 8,
          storage_location: 'Dry cabinet',
        },
      }),
    }),
  );
});
it('creates multiple copies without unique tags and persists suppliers, multicolor metadata and each association', async () => {
  mockRequest.mockImplementation(async path =>
    path === '/inventory/spools/bulk' ? [{ id: 30 }, { id: 31 }] : [],
  );
  const renderer = await mount(
    <SpoolEditor
      spool={{
        material: 'PLA',
        rgba: 'AABBCC80',
        extra_colors: 'ff0000,00ff00',
        effect_type: 'gradient',
        tag_uid: 'AABBCCDD',
        core_weight: 0,
        suppliers: [
          {
            supplier_id: 2,
            supplier_name: 'Shop',
            supplier_article_number: 'SKU',
            quoted_price_per_kg: 15,
            is_purchase_source: true,
          },
        ],
      }}
      spoolman={false}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  await act(async () =>
    renderer.root
      .findAllByType(TextField)
      .find(node => node.props.label.startsWith('Quantity'))!
      .props.onChangeText('2'),
  );
  await press(renderer, 'Save');
  const create = mockRequest.mock.calls.find(
    ([path]) => path === '/inventory/spools/bulk',
  )!;
  const body = JSON.parse(String(create[1]?.body));
  expect(body).toMatchObject({
    quantity: 2,
    spool: {
      core_weight: 0,
      extra_colors: 'ff0000,00ff00',
      effect_type: 'gradient',
      rgba: 'AABBCC80',
      tag_uid: null,
      tray_uuid: null,
    },
  });
  for (const id of [30, 31]) {
    expect(mockRequest).toHaveBeenCalledWith(
      `/inventory/spools/${id}/suppliers`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify([
          {
            supplier_id: 2,
            supplier_article_number: 'SKU',
            quoted_price_per_kg: 15,
            is_purchase_source: true,
          },
        ]),
      }),
    );
    expect(mockRequest).toHaveBeenCalledWith(
      `/inventory/spools/${id}/filament-presets`,
      expect.objectContaining({ body: '[]' }),
    );
  }
});
it('preserves existing printer/nozzle presets and K associations across an unrelated spool edit', async () => {
  const presets = [
    {
      printer_model: 'P1S',
      nozzle_diameter: '0.6',
      slicer_filament: 'PFUS123',
      slicer_filament_name: 'My preset',
    },
  ];
  const k = [
    {
      printer_id: 5,
      extruder: 1,
      nozzle_diameter: '0.6',
      nozzle_type: 'HH',
      k_value: 0.02,
      cali_idx: 7,
    },
  ];
  mockRequest.mockImplementation(async path =>
    path === '/inventory/spools/4/filament-presets'
      ? presets
      : path === '/inventory/spools/4/k-profiles'
      ? k
      : [],
  );
  const renderer = await mount(
    <SpoolEditor
      spool={{
        id: 4,
        material: 'PLA',
        label_weight: 1000,
        core_weight: 200,
        weight_used: 40,
      }}
      spoolman={false}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  await act(async () =>
    renderer.root
      .findAllByType(TextField)
      .find(node => node.props.label === 'Note')!
      .props.onChangeText('changed'),
  );
  await press(renderer, 'Save');
  const patch = mockRequest.mock.calls.find(
    ([path, options]) =>
      path === '/inventory/spools/4' && options?.method === 'PATCH',
  )!;
  expect(JSON.parse(String(patch[1]?.body))).toMatchObject({ note: 'changed' });
  expect(JSON.parse(String(patch[1]?.body))).not.toHaveProperty('weight_used');
  expect(JSON.parse(String(patch[1]?.body))).not.toHaveProperty(
    'weight_locked',
  );
  expect(mockRequest).toHaveBeenCalledWith(
    '/inventory/spools/4/filament-presets',
    expect.objectContaining({ method: 'PUT', body: JSON.stringify(presets) }),
  );
  expect(mockRequest).toHaveBeenCalledWith(
    '/inventory/spools/4/k-profiles',
    expect.objectContaining({ method: 'PUT', body: JSON.stringify(k) }),
  );
});
it.each([false, true])(
  'preserves explicit used-weight edits, including zero, for backend %s',
  async spoolman => {
    const root = spoolman ? '/spoolman/inventory' : '/inventory';
    const renderer = await mount(
      <SpoolEditor
        spool={{ id: 4, material: 'PLA', weight_used: 40 }}
        spoolman={spoolman}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    await act(async () =>
      renderer.root
        .findAllByType(TextField)
        .find(node => node.props.label === 'Used weight (g)')!
        .props.onChangeText('0'),
    );
    await press(renderer, 'Save');
    const patch = mockRequest.mock.calls.find(
      ([path, options]) =>
        path === `${root}/spools/4` && options?.method === 'PATCH',
    )!;
    expect(JSON.parse(String(patch[1]?.body))).toMatchObject({
      weight_used: 0,
    });
  },
);

it.each([
  {
    name: 'untouched new stock',
    initial: null,
    modify: false,
    replaces: false,
  },
  {
    name: 'copy with explicitly empty suppliers',
    initial: { material: 'PLA', suppliers: [] },
    modify: false,
    replaces: true,
  },
  {
    name: 'new stock with explicitly removed supplier',
    initial: null,
    modify: true,
    replaces: true,
  },
  {
    name: 'edited stock with explicitly removed supplier',
    initial: { id: 4, material: 'PLA', suppliers: [{ supplier_id: 7 }] },
    modify: true,
    replaces: true,
  },
])(
  'preserves supplier intent for $name',
  async ({ initial, modify, replaces }) => {
    const fallback = mockRequest.getMockImplementation()!;
    mockRequest.mockImplementation(async (path, options) => {
      if (path === '/inventory/suppliers')
        return [{ id: 7, name: 'Inherited supplier' }];
      if (path === '/inventory/spools' && options?.method === 'POST')
        return {
          id: 30,
          suppliers: [{ supplier_id: 7, supplier_name: 'Inherited supplier' }],
        };
      return fallback(path, options);
    });
    const renderer = await mount(
      <SpoolEditor
        spool={initial}
        spoolman={false}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    if (modify) {
      if (!initial)
        await act(async () =>
          renderer.root
            .findAllByType(ChoiceField)
            .find(node => node.props.label === 'Link supplier')!
            .props.onChange('7'),
        );
      await press(renderer, 'Unlink supplier');
    }
    await press(renderer, 'Save');
    const replacements = mockRequest.mock.calls.filter(
      ([path, options]) =>
        path.endsWith('/suppliers') && options?.method === 'PUT',
    );
    expect(replacements).toHaveLength(replaces ? 1 : 0);
    if (replaces) expect(replacements[0][1]?.body).toBe('[]');
    if (!initial) {
      const create = mockRequest.mock.calls.find(
        ([path, options]) =>
          path === '/inventory/spools' && options?.method === 'POST',
      )!;
      expect(JSON.parse(String(create[1]?.body))).toMatchObject({
        weight_used: 0,
      });
    }
  },
);

it('selects the exact hotend K profile and replaces an existing flow-specific association without duplicates', async () => {
  const fallback = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation(async (path, options) => {
    if (path === '/printers/')
      return [{ id: 1, name: 'Dual', model: 'H2D', nozzle_count: 2 }];
    if (path === '/inventory/spools/3/k-profiles' && options?.method === 'GET')
      return [
        {
          printer_id: 1,
          extruder: 1,
          nozzle_diameter: '0.4',
          nozzle_type: 'HH',
          k_value: 0.02,
          cali_idx: 2,
        },
      ];
    if (path.startsWith('/printers/1/kprofiles/'))
      return {
        profiles: [
          {
            slot_id: 2,
            extruder_id: 0,
            nozzle_id: 'HH00-0.4',
            name: 'Maker PLA',
            k_value: '0.01',
          },
          {
            slot_id: 2,
            extruder_id: 1,
            nozzle_id: 'HH00-0.4',
            name: 'Maker PLA',
            k_value: '0.05',
          },
        ],
      };
    return fallback(path, options);
  });
  const renderer = await mount(
    <SpoolEditor
      spoolman={false}
      spool={{ id: 3, material: 'PLA', brand: 'Maker' }}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  await act(async () =>
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Printer')!
      .props.onChange('1'),
  );
  await settle();
  await act(async () =>
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Extruder')!
      .props.onChange('1'),
  );
  await act(async () =>
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'K profile')!
      .props.onChange('2'),
  );
  await press(renderer, 'Save');
  const saved = mockRequest.mock.calls.find(
    ([path, options]) =>
      path === '/inventory/spools/3/k-profiles' && options?.method === 'PUT',
  )!;
  expect(JSON.parse(String(saved[1]?.body))).toEqual([
    expect.objectContaining({
      printer_id: 1,
      extruder: 1,
      nozzle_type: 'HH',
      k_value: 0.05,
      cali_idx: 2,
    }),
  ]);
});

it('saves an explicitly cleared independent AMS alarm without changing its fair band', async () => {
  const renderer = await mount(<AmsThresholdSettings />);
  await act(async () =>
    renderer.root
      .findAllByType(TextField)
      .find(node => node.props.label.includes('alarm'))!
      .props.onChangeText(''),
  );
  await press(renderer, 'Save AMS bands and alarm');
  expect(mockRequest).toHaveBeenCalledWith(
    '/settings/',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        ams_humidity_good: 40,
        ams_humidity_fair: 60,
        ams_temp_good: 28,
        ams_temp_fair: 35,
        ams_temp_alarm: null,
      }),
    }),
  );
});
it('confirms scoped Spoolman sync and persists string-valued sync policy switches', async () => {
  const renderer = await mount(<SpoolmanPolicySettings />);
  await act(async () => {
    toggle(renderer, 'Disable weight sync').props.onChange(true);
    toggle(renderer, 'Report partial usage').props.onChange(false);
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Sync printer scope')!
      .props.onChange('9');
  });
  await press(renderer, 'Save Spoolman policy');
  const save = mockRequest.mock.calls.find(
    ([path, options]) =>
      path === '/settings/spoolman' && options?.method === 'PUT',
  )!;
  expect(JSON.parse(String(save[1]?.body))).toMatchObject({
    spoolman_disable_weight_sync: 'true',
    spoolman_report_partial_usage: 'false',
  });
  await press(renderer, 'Synchronize printers to Spoolman');
  expect(mockRequest).not.toHaveBeenCalledWith(
    '/spoolman/sync/9',
    expect.anything(),
  );
  await act(async () =>
    renderer.root.findByType(ConfirmModal).props.onConfirm(),
  );
  await settle();
  expect(mockRequest).toHaveBeenCalledWith(
    '/spoolman/sync/9',
    expect.objectContaining({ method: 'POST' }),
  );
});
it('saving environmental defaults does not rewrite existing bindings; reset requires confirmation', async () => {
  jest.spyOn(settingsApi, 'updateSettings');
  const renderer = await mount(<EnvironmentDefaults onClose={jest.fn()} />);
  await press(renderer, 'Save defaults (leave existing bindings unchanged)');
  expect(
    mockRequest.mock.calls.filter(
      ([path, options]) =>
        path.includes('ha-sensors') && options?.method === 'PATCH',
    ),
  ).toHaveLength(0);
  expect(mockRequest).toHaveBeenCalledWith(
    '/settings/',
    expect.objectContaining({ method: 'PUT' }),
  );
  await press(renderer, 'Reset existing sensors to chosen defaults');
  expect(renderer.root.findByType(ConfirmModal).props.visible).toBe(true);
});
it('catalog deletion is confirmed and sends selected entry IDs, not actual spool deletion', async () => {
  mockRequest.mockImplementation(async path =>
    path === '/inventory/catalog' ? [{ id: 5, name: 'Core', weight: 180 }] : [],
  );
  const renderer = await mount(
    <InventoryDirectory kind="catalog" onClose={jest.fn()} />,
  );
  await act(async () => toggle(renderer, 'Core · 180').props.onChange(true));
  await press(renderer, 'Delete selected (1)');
  expect(mockRequest).not.toHaveBeenCalledWith(
    '/inventory/catalog/bulk-delete',
    expect.anything(),
  );
  await act(async () =>
    renderer.root.findByType(ConfirmModal).props.onConfirm(),
  );
  await settle();
  expect(mockRequest).toHaveBeenCalledWith(
    '/inventory/catalog/bulk-delete',
    expect.objectContaining({ body: '{"ids":[5]}' }),
  );
});
it('counter reset and scale reconciliation are independent actions that never mark a spool empty', async () => {
  mockRequest.mockImplementation(async path =>
    path === '/inventory/spools/3'
      ? {
          id: 3,
          label_weight: 1000,
          core_weight: 200,
          weight_used: 100,
          last_scale_weight: 800,
        }
      : [],
  );
  const renderer = await mount(
    <SpoolDetails
      spool={{ id: 3 }}
      spoolman={false}
      assignments={[]}
      onClose={jest.fn()}
      onEdit={jest.fn()}
      onCopy={jest.fn()}
      onLabels={jest.fn()}
      onChanged={async () => {}}
    />,
  );
  await press(renderer, 'Reset this consumed counter');
  await act(async () =>
    renderer.root.findByType(ConfirmModal).props.onConfirm(),
  );
  await settle();
  expect(mockRequest).toHaveBeenCalledWith(
    '/inventory/spools/3/reset-consumed-counter',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(
    mockRequest.mock.calls.some(([, options]) => options?.method === 'PATCH'),
  ).toBe(false);
  await press(renderer, 'Trust measured scale weight and reconcile tracking');
  await act(async () =>
    renderer.root.findByType(ConfirmModal).props.onConfirm(),
  );
  await settle();
  expect(mockRequest).toHaveBeenCalledWith(
    '/spoolbuddy/scale/update-spool-weight',
    expect.objectContaining({ body: '{"spool_id":3,"weight_grams":800}' }),
  );
});
it('label content, output DPI, sheet offset and refined spool selection reach generation and persisted options', async () => {
  const renderer = await mount(
    <InventoryLabels
      spools={[{ id: 3, material: 'PLA' }]}
      initialIds={[3]}
      spoolman={false}
      onClose={jest.fn()}
    />,
  );
  await act(async () => {
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Template')!
      .props.onChange('avery_5160');
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'Output')!
      .props.onChange('png');
    toggle(renderer, 'Monochrome').props.onChange(true);
    toggle(renderer, 'Note').props.onChange(true);
  });
  await act(async () => {
    renderer.root
      .findAllByType(ChoiceField)
      .find(node => node.props.label === 'PNG DPI')!
      .props.onChange('600');
    renderer.root
      .findAllByType(TextField)
      .find(node => node.props.label.startsWith('Sheet starting'))!
      .props.onChangeText('5');
  });
  await press(renderer, 'Generate and share / print');
  const generated = mockBlob.mock.calls.find(
    ([path]) => path === '/inventory/labels',
  )!;
  expect(JSON.parse(String(generated[1]?.body))).toMatchObject({
    spool_ids: [3],
    template: 'avery_5160',
    monochrome: true,
    format: 'png',
    dpi: 600,
    starting_position: 5,
    fields: expect.arrayContaining(['note', 'qr']),
  });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    'inventory-label-options',
    expect.any(String),
  );
});
