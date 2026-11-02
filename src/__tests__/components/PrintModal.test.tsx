/* eslint-disable @typescript-eslint/no-shadow */
import React from 'react';
import { Image, Pressable, TextInput } from 'react-native';
import ReactTestRenderer, {
  act,
  type ReactTestInstance,
} from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  PrintModal,
  type PrintModalProps,
} from '@/components/printers/PrintModal';
import { Choice } from '@/components/printers/PrintOptionsForm';
import type { PrintQueueItem } from '@/types/api';

const mockRequest = jest.fn();
const mockUpload = jest.fn();
const mockPick = jest.fn();
const mockClose = jest.fn();
const mockSettings = jest.fn();
const mockPermission = jest.fn(() => true);
let mockRemaining = 1000;
const mockStatus = {
  connected: true,
  state: 'IDLE',
  ams_filament_backup: false,
  ams: [
    {
      id: 0,
      tray: [
        { id: 0, tray_type: 'PLA', tray_color: 'FF0000FF' },
        { id: 1, tray_type: 'PETG', tray_color: '00FF00FF' },
      ],
    },
  ],
};

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      visible,
      children,
    }: {
      visible: boolean;
      children: React.ReactNode;
    }) => (visible ? React.createElement(View, null, children) : null),
  };
});
jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      ...props
    }: { children: React.ReactNode } & Record<string, unknown>) =>
      React.createElement(View, props, children),
  };
});
jest.mock('@react-native-documents/picker', () => ({
  pick: (...args: unknown[]) => mockPick(...args),
  types: { allFiles: '*' },
  isErrorWithCode: () => false,
  errorCodes: { OPERATION_CANCELED: 'cancelled' },
}));
jest.mock('@/api/http', () => ({
  request: (...args: unknown[]) => mockRequest(...args),
  buildMediaUrl: (path: string) => `https://server/api/v1${path}`,
}));
jest.mock('@/api/files', () => ({
  filesApi: {
    uploadLibraryFile: (...args: unknown[]) => mockUpload(...args),
    getLibraryFolders: async () => [],
  },
}));
jest.mock('@/api/client', () => ({
  api: {
    getSettings: () => mockSettings(),
    getPrinters: async () => [
      {
        id: 1,
        name: 'Printer One',
        model: 'X1C',
        is_active: true,
        nozzle_count: 1,
        location: 'Lab',
      },
      {
        id: 2,
        name: 'Printer Two',
        model: 'P1S',
        is_active: true,
        nozzle_count: 1,
        location: 'Lab',
      },
      {
        id: 3,
        name: 'H2D only',
        model: 'H2D',
        is_active: true,
        nozzle_count: 2,
      },
    ],
    getLibraryFiles: async () => [],
    getPrinterStatus: async () => mockStatus,
  },
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: mockPermission, user: { id: 8 } }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Pressable, Text, View, TextInput } = require('react-native');
  return {
    PrimaryButton: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        accessibilityLabel={label}
        disabled={disabled}
        onPress={disabled ? undefined : onPress}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
    Chip: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityLabel={label} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    SectionCard: ({
      children,
      title,
    }: {
      children: React.ReactNode;
      title: string;
    }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
    SearchBar: () => <TextInput />,
  };
});
jest.mock('@/components/common/ConfirmModal', () => ({
  ConfirmModal: ({
    visible,
    onConfirm,
    onClose,
    message,
  }: {
    visible: boolean;
    onConfirm: () => void;
    onClose: () => void;
    message: string;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    return visible ? (
      <View>
        <Text>{message}</Text>
        <Pressable accessibilityLabel="Print anyway" onPress={onConfirm} />
        <Pressable accessibilityLabel="Cancel shortage" onPress={onClose} />
      </View>
    ) : null;
  },
}));

function button(scope: ReactTestInstance, label: string) {
  const result = scope
    .findAllByType(Pressable)
    .find(node => node.props.accessibilityLabel === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function press(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  await act(async () => {
    button(renderer.root, label).props.onPress?.();
  });
  await settle();
}
async function settle() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 25));
  });
}
async function choose(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
  value: string,
) {
  const control = renderer.root
    .findAllByType(Choice)
    .find(node => node.props.label === label);
  if (!control) throw new Error(`Missing choice: ${label}`);
  await act(async () => {
    button(control, value).props.onPress();
  });
  await settle();
}
function mutations() {
  return mockRequest.mock.calls
    .filter(
      ([, options]) =>
        options?.method === 'POST' || options?.method === 'PATCH',
    )
    .map(([path, options]) => ({
      path,
      data: JSON.parse(options.body) as Record<string, unknown>,
    }));
}

describe('configured native print launch', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  let client: QueryClient;
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemaining = 1000;
    mockPermission.mockReturnValue(true);
    mockSettings.mockResolvedValue({
      default_bed_levelling: 'auto',
      default_flow_cali: 'off',
      gcode_snippets: 'M400',
      billing_enabled: false,
    });
    mockRequest.mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (options?.method) return { id: 88 };
        if (path.includes('/inventory-remain'))
          return {
            inventory_remain_g: { 0: mockRemaining, 1: 1000 },
            slot_materials: [
              {
                global_tray_id: 0,
                material_key: 'PLA-red',
                extruder: 0,
                remaining_g: mockRemaining,
              },
              {
                global_tray_id: 1,
                material_key: 'PETG-green',
                extruder: 0,
                remaining_g: 1000,
              },
            ],
          };
        if (path.includes('/inventory/assignments')) return [];
        if (path.startsWith('/printers/available-filaments'))
          return [
            { type: 'PLA', color: '#FF0000', tray_info_idx: 'red-preset' },
          ];
        if (path.endsWith('/plates'))
          return {
            is_multi_plate: true,
            plates: [
              {
                index: 1,
                name: 'Red plate',
                objects: ['Gear'],
                bed_type: 'Textured PEI',
              },
              {
                index: 2,
                name: 'Green plate',
                objects: ['Case'],
                bed_type: 'Cool plate',
              },
            ],
          };
        if (path.includes('/filament-requirements'))
          return {
            filaments: path.includes('plate_id=2')
              ? [{ slot_id: 1, type: 'PETG', color: '#00FF00', used_grams: 30 }]
              : [{ slot_id: 1, type: 'PLA', color: '#FF0000', used_grams: 40 }],
          };
        if (path === '/finance/cost-centers/mine')
          return [
            {
              id: 5,
              name: 'Personal',
              is_private: true,
              can_print: true,
              is_active: true,
              budget_mode: 'total',
              budget_available: 0.1,
            },
          ];
        return {
          id: 10,
          filename: 'model.gcode.3mf',
          sliced_for_model: path === '/library/files/11' ? 'H2D' : 'X1C',
          bed_type: 'Textured PEI',
        };
      },
    );
  });
  afterEach(async () => {
    if (renderer) await act(async () => renderer.unmount());
    client?.clear();
  });
  async function renderModal(props: Partial<PrintModalProps> = {}) {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <QueryClientProvider client={client}>
          <PrintModal
            visible
            onClose={mockClose}
            initialFileId={10}
            initialPrinterId={1}
            {...props}
          />
        </QueryClientProvider>,
      );
    });
    await settle();
    await settle();
    await settle();
    return renderer;
  }
  it('cancels without queue mutation, and archive source uses its real endpoints', async () => {
    await renderModal({ initialFileId: null, initialArchiveId: 20 });
    expect(
      mockRequest.mock.calls.some(([path]) => path === '/archives/20/plates'),
    ).toBe(true);
    expect(
      mockRequest.mock.calls.some(
        ([path]) => path === '/archives/20/filament-requirements?plate_id=1',
      ),
    ).toBe(true);
    expect(
      renderer.root.findAllByType(Image).map(image => image.props.source.uri),
    ).toEqual([
      'https://server/api/v1/archives/20/plate-thumbnail/1',
      'https://server/api/v1/archives/20/plate-thumbnail/2',
    ]);
    await press(renderer, 'Cancel');
    expect(mutations()).toEqual([]);
    expect(mockClose).toHaveBeenCalled();
  });
  it('saves an isolated queue draft with tri-state values, preheat zero and no new run', async () => {
    const original = {
      id: 4,
      printer_id: 1,
      library_file_id: 10,
      archive_id: null,
      plate_id: 1,
      bed_levelling: 'auto',
      flow_cali: 'off',
      preheat_override: 'on',
      preheat_chamber_target_override: 0,
      ams_mapping: [0],
      status: 'pending',
      created_by_id: 8,
    } as PrintQueueItem;
    await renderModal({ queueItem: original, projectId: 9 });
    await choose(renderer, 'Bed levelling', 'Off');
    expect(mutations()).toEqual([]);
    expect(original.bed_levelling).toBe('auto');
    await press(renderer, 'Save');
    const saved = mutations();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      path: '/queue/4',
      data: {
        bed_levelling: 'off',
        flow_cali: 'off',
        preheat_override: 'on',
        preheat_chamber_target_override: 0,
        plate_id: 1,
      },
    });
    expect(saved[0].data).not.toHaveProperty('library_file_id');
    expect(saved[0].data).not.toHaveProperty('project_id');
  });
  it('creates independently mapped plate quantities on each selected compatible printer', async () => {
    await renderModal();
    expect(
      renderer.root.findAllByType(Image).map(image => image.props.source.uri),
    ).toEqual([
      'https://server/api/v1/library/files/10/plate-thumbnail/1',
      'https://server/api/v1/library/files/10/plate-thumbnail/2',
    ]);
    await press(renderer, 'Select all eligible');
    await press(renderer, 'Select all plates');
    const copyInputs = renderer.root
      .findAllByType(TextInput)
      .filter(n => n.props.accessibilityLabel === 'Copies (1–999)');
    await act(async () => copyInputs[0].props.onChangeText('2'));
    await press(renderer, 'Submit print jobs');
    const jobs = mutations().filter(m => m.path === '/queue/');
    expect(jobs).toHaveLength(4);
    expect(
      jobs.map(j => [
        j.data.printer_id,
        j.data.plate_id,
        j.data.quantity,
        j.data.ams_mapping,
      ]),
    ).toEqual([
      [1, 1, 2, [0]],
      [1, 2, 1, [1]],
      [2, 1, 2, [0]],
      [2, 2, 1, [1]],
    ]);
    expect(
      jobs.every(
        j => j.data.bed_levelling === 'auto' && j.data.flow_cali === 'off',
      ),
    ).toBe(true);
    expect(jobs.some(j => j.data.printer_id === 3)).toBe(false);
  });
  it('requires explicit shortage confirmation and does not start on cancelling review', async () => {
    mockRemaining = 10;
    await renderModal();
    await press(renderer, 'Submit print jobs');
    expect(mutations()).toEqual([]);
    await press(renderer, 'Cancel shortage');
    expect(mutations()).toEqual([]);
    await press(renderer, 'Submit print jobs');
    await press(renderer, 'Print anyway');
    expect(
      mutations().find(m => m.path === '/queue/')?.data.skip_filament_check,
    ).toBe(true);
  });
  it('configures history into a new run without patching its source', async () => {
    await renderModal({
      requeue: true,
      queueItem: {
        id: 4,
        archive_id: 20,
        library_file_id: null,
        plate_id: 1,
        printer_id: 1,
        status: 'failed',
        bed_levelling: 'auto',
        flow_cali: 'off',
      } as PrintQueueItem,
    });
    await choose(renderer, 'Bed levelling', 'On');
    await press(renderer, 'Submit print jobs');
    expect(mutations()).toEqual([
      expect.objectContaining({
        path: '/queue/',
        data: expect.objectContaining({ archive_id: 20, bed_levelling: 'on' }),
      }),
    ]);
  });
  it('queues alternative slices once in chosen preference order, not as bulk jobs', async () => {
    await renderModal({
      initialPrinterId: null,
      projectId: 9,
      variantFiles: [
        {
          library_file_id: 10,
          filename: 'X1.gcode.3mf',
          target_model: 'X1C',
          plate_id: 1,
        },
        {
          library_file_id: 11,
          filename: 'H2.gcode.3mf',
          target_model: 'H2D',
          plate_id: 2,
        },
      ],
    });
    const preferLater = renderer.root
      .findAllByType(Pressable)
      .find(n => n.props.accessibilityLabel === 'Prefer later');
    await act(async () => preferLater!.props.onPress());
    await press(renderer, 'Submit print jobs');
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0].data.variants).toEqual([
      expect.objectContaining({ library_file_id: 11, plate_id: 2 }),
      expect.objectContaining({ library_file_id: 10, plate_id: 1 }),
    ]);
    expect(mutations()[0].data).not.toHaveProperty('library_file_id');
    expect(mutations()[0].data.project_id).toBe(9);
  });
  it('blocks budgeted launch when the mapped total exceeds available funds', async () => {
    mockSettings.mockResolvedValue({
      billing_enabled: true,
      default_filament_cost: 25,
    });
    await renderModal();
    expect(button(renderer.root, 'Submit print jobs').props.disabled).toBe(
      true,
    );
    expect(mutations()).toEqual([]);
  });
  it('schedules printer groups at the selected time and interval without ASAP insertion', async () => {
    await renderModal();
    await press(renderer, 'Select all eligible');
    await choose(renderer, 'Schedule', 'Scheduled');
    const time = new Date(Date.now() + 86400000).toISOString();
    const scheduledInput = renderer.root
      .findAllByType(TextInput)
      .find(
        n =>
          n.props.accessibilityLabel ===
          'Scheduled time (ISO; timezone may be entered explicitly)',
      );
    await act(async () => scheduledInput!.props.onChangeText(time));
    await choose(renderer, 'Stagger printer starts', 'On');
    const intervalInput = renderer.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === 'Interval minutes');
    await act(async () => intervalInput!.props.onChangeText('10'));
    await press(renderer, 'Submit print jobs');
    const jobs = mutations().filter(m => m.path === '/queue/');
    expect(jobs).toHaveLength(2);
    expect(jobs[0].data.scheduled_time).toBe(time);
    expect(
      Date.parse(String(jobs[1].data.scheduled_time)) - Date.parse(time),
    ).toBe(600000);
    expect(jobs.every(job => job.data.insert_at_top === false)).toBe(true);
  });
  it('clears a stale explicit chamber target when preheat is disabled', async () => {
    await renderModal({
      queueItem: {
        id: 4,
        printer_id: 1,
        library_file_id: 10,
        plate_id: 1,
        status: 'pending',
        preheat_override: 'on',
        preheat_chamber_target_override: 42,
      } as PrintQueueItem,
    });
    await choose(renderer, 'Preheat / heat soak', 'Off');
    await press(renderer, 'Save');
    expect(mutations()[0].data).toMatchObject({
      preheat_override: 'off',
      preheat_chamber_target_override: null,
    });
  });
  it('lets a copies field be cleared and re-entered without deselecting its plate', async () => {
    await renderModal({ projectId: 9 });
    const copies = () =>
      renderer.root
        .findAllByType(TextInput)
        .find(n => n.props.accessibilityLabel === 'Copies (1–999)')!;
    await act(async () => copies().props.onChangeText(''));
    expect(copies()).toBeDefined();
    await press(renderer, 'Submit print jobs');
    expect(mutations()).toEqual([]);
    await act(async () => copies().props.onChangeText('3'));
    await press(renderer, 'Submit print jobs');
    expect(mutations().find(m => m.path === '/queue/')?.data.quantity).toBe(3);
    expect(
      mutations().find(m => m.path === '/queue/batches')?.data.plates,
    ).toEqual([expect.objectContaining({ plate_id: 1, quantity_target: 3 })]);
    expect(
      mutations().find(m => m.path === '/queue/batches')?.data.project_id,
    ).toBe(9);
    expect(mutations().find(m => m.path === '/queue/')?.data).toMatchObject({
      library_file_id: 10,
      project_id: 9,
    });
  });
  it.each([
    ['library', 'library_file_id', 10],
    ['archive', 'archive_id', 20],
  ] as const)(
    'associates a %s print with its project without replacing the real source',
    async (kind, sourceField, sourceId) => {
      await renderModal({
        initialFileId: kind === 'library' ? sourceId : null,
        initialArchiveId: kind === 'archive' ? sourceId : null,
        projectId: 9,
      });
      await press(renderer, 'Submit print jobs');
      expect(mutations()).toEqual([
        expect.objectContaining({
          path: '/queue/',
          data: expect.objectContaining({
            [sourceField]: sourceId,
            project_id: 9,
            printer_id: 1,
          }),
        }),
      ]);
      expect(mutations()[0].data).not.toHaveProperty('printer_ids');
    },
  );
  it('resets saved model-target material overrides to the actual slice instead of reapplying history values', async () => {
    await renderModal({
      queueItem: {
        id: 4,
        printer_id: null,
        target_model: 'X1C',
        library_file_id: 10,
        plate_id: 1,
        status: 'pending',
        filament_overrides: [
          {
            slot_id: 1,
            type: 'PETG',
            color: '#00FF00',
            tray_info_idx: 'old-green-preset',
            force_color_match: true,
          },
        ],
      } as PrintQueueItem,
    });
    await press(renderer, 'Reset material override');
    await press(renderer, 'Save');
    expect(mutations()[0].data.filament_overrides).toEqual([
      { slot_id: 1, type: 'PLA', color: '#FF0000', force_color_match: false },
    ]);
  });
  it('retries only unsuccessful printer/plate requests after a partial launch failure', async () => {
    const original = mockRequest.getMockImplementation()!;
    let failed = false;
    mockRequest.mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (
          path === '/queue/' &&
          options?.body &&
          JSON.parse(String(options.body)).printer_id === 2 &&
          !failed
        ) {
          failed = true;
          throw new Error('Temporary dispatch failure');
        }
        return original(path, options);
      },
    );
    await renderModal();
    await press(renderer, 'Select all eligible');
    await press(renderer, 'Select all plates');
    await press(renderer, 'Submit print jobs');
    expect(mockClose).not.toHaveBeenCalled();
    await press(renderer, 'Retry remaining requests');
    expect(mockClose).toHaveBeenCalledTimes(1);
    const jobs = mutations().filter(m => m.path === '/queue/');
    expect(jobs.filter(job => job.data.printer_id === 1)).toHaveLength(2);
    expect(jobs.filter(job => job.data.printer_id === 2)).toHaveLength(3);
  });
  it('rejects unsliced local files before upload and cleans staged files on cancel', async () => {
    mockPick.mockResolvedValue([
      { uri: 'file:///model.3mf', name: 'model.3mf' },
    ]);
    await renderModal({ initialFileId: null, uploadForPrinter: true });
    await press(renderer, 'Choose local sliced file');
    expect(mockUpload).not.toHaveBeenCalled();
    mockPick.mockResolvedValue([
      { uri: 'file:///model.gcode.3mf', name: 'model.gcode.3mf' },
    ]);
    mockUpload.mockResolvedValue({ id: 55 });
    await press(renderer, 'Choose local sliced file');
    await press(renderer, 'Cancel');
    expect(mockRequest).toHaveBeenCalledWith('/library/files/55', {
      method: 'DELETE',
    });
    expect(mutations()).toEqual([]);
  });
});
