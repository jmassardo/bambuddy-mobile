/* eslint-disable @typescript-eslint/no-shadow */
import React from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import ReactTestRenderer, {
  act,
  type ReactTestInstance,
} from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QueueScreen from '@/screens/QueueScreen';
import { ApiError } from '@/api/http';
import { Choice } from '@/components/printers/PrintOptionsForm';
import { QueueBulkEditModal } from '@/components/queue/QueueBulkEditModal';
import type { PrintQueueItem } from '@/types/api';

const mockRequest = jest.fn();
const mockToast = jest.fn();
const mockPermission = jest.fn((permission: string) => Boolean(permission));
let mockShortage = false;
const mockItems = [
  {
    id: 1,
    position: 1,
    status: 'pending',
    printer_id: 1,
    library_file_id: 10,
    library_file_name: 'Gear',
    created_by_id: 8,
  },
  {
    id: 2,
    position: 2,
    status: 'pending',
    printer_id: 1,
    library_file_id: 11,
    library_file_name: 'Case',
    created_by_id: 8,
  },
  {
    id: 3,
    position: 3,
    status: 'printing',
    printer_id: 1,
    library_file_name: 'Active',
    started_at: '2026-10-27T12:00:00Z',
  },
  {
    id: 4,
    position: 4,
    status: 'failed',
    printer_id: 1,
    archive_id: 20,
    archive_name: 'Failed',
  },
  {
    id: 5,
    position: 5,
    status: 'skipped',
    printer_id: 1,
    error_message: 'Previous print failed or was aborted',
  },
  {
    id: 6,
    position: 6,
    status: 'completed',
    printer_id: 1,
    archive_id: 22,
    archive_name: 'Done',
  },
] as unknown as PrintQueueItem[];
let mockQueueItems: PrintQueueItem[] = [];
const mockBatch = {
  id: 8,
  name: 'Production order',
  status: 'active',
  has_targets: true,
  target_count: 10,
  completed_count: 2,
  remaining_count: 8,
  dispatchable_count: 5,
  pending_count: 1,
  printing_count: 0,
  failed_count: 3,
  cancelled_count: 2,
  plates: [
    {
      plate_id: null,
      plate_name: 'Default',
      quantity_target: 10,
      completed_count: 2,
      remaining: 5,
      can_dispatch: true,
      actual_cost: null,
      estimated_remaining_cost: null,
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
jest.mock('@/api/http', () => ({
  ...jest.requireActual('@/api/http'),
  request: (...args: unknown[]) => mockRequest(...args),
}));
jest.mock('@/api/client', () => ({
  api: {
    getPrinters: async () => [
      {
        id: 1,
        name: 'Printer One',
        model: 'X1C',
        is_active: true,
        location: 'Lab',
      },
    ],
    getSettings: async () => ({ gcode_snippets: 'M400' }),
    getPrinterStatus: async () => ({ connected: true, state: 'RUNNING' }),
  },
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: mockPermission, user: { id: 8 } }),
}));
jest.mock('@/contexts/ToastContext', () => {
  const { resolveNativeMessage } = jest.requireActual<typeof import('@/i18n')>('@/i18n');
  const showToast = (message: Parameters<typeof resolveNativeMessage>[0], ...args: unknown[]) => mockToast(resolveNativeMessage(message), ...args);
  return { useToast: () => ({ showToast }) };
});
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
    StatCard: () => null,
    InlineTabBar: ({
      tabs,
      onChange,
    }: {
      tabs: Array<{ key: string; label: string }>;
      onChange: (value: string) => void;
    }) => (
      <View>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            accessibilityLabel={`tab-${tab.key}`}
            onPress={() => onChange(tab.key)}
          >
            <Text>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});
jest.mock('@/components/common/ConfirmModal', () => ({
  ConfirmModal: ({
    visible,
    onConfirm,
    onClose,
    message,
    title,
    confirmLabel,
  }: {
    visible: boolean;
    onConfirm: () => void;
    onClose: () => void;
    message: string;
    title: string;
    confirmLabel: string;
  }) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');
    return visible ? (
      <View>
        <Text>{title}</Text>
        <Text>{message}</Text>
        <Pressable accessibilityLabel={confirmLabel} onPress={onConfirm} />
        <Pressable
          accessibilityLabel="Dismiss confirmation"
          onPress={onClose}
        />
      </View>
    ) : null;
  },
}));
jest.mock('@/components/queue/QueueItemCard', () => ({
  QueueItemCardContent: ({
    item,
    onStop,
    onRetry,
  }: {
    item: PrintQueueItem;
    onStop?: () => void;
    onRetry?: () => void;
  }) => {
    const React = require('react');
    const { Pressable, View } = require('react-native');
    return (
      <View>
        {onStop && (
          <Pressable accessibilityLabel={`stop-${item.id}`} onPress={onStop} />
        )}
        {onRetry && (
          <Pressable
            accessibilityLabel={`requeue-${item.id}`}
            onPress={onRetry}
          />
        )}
      </View>
    );
  },
}));
jest.mock('@/components/queue/DraggableQueueItem', () => ({
  DraggableQueueItem: ({
    item,
    onStart,
    onReassign,
  }: {
    item: PrintQueueItem;
    onStart?: () => void;
    onReassign?: () => void;
  }) => {
    const React = require('react');
    const { Pressable, View } = require('react-native');
    return (
      <View>
        {onStart && (
          <Pressable
            accessibilityLabel={`start-${item.id}`}
            onPress={onStart}
          />
        )}
        {onReassign && (
          <Pressable
            accessibilityLabel={`edit-${item.id}`}
            onPress={onReassign}
          />
        )}
      </View>
    );
  },
}));
jest.mock('@/components/printers/PrintModal', () => ({
  PrintModal: ({
    queueItem,
    requeue,
  }: {
    queueItem: PrintQueueItem;
    requeue: boolean;
  }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>{`configured:${queueItem.id}:${String(requeue)}`}</Text>;
  },
}));

function button(scope: ReactTestInstance, label: string) {
  const found = scope
    .findAllByType(Pressable)
    .find(n => n.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
async function settle() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 25));
  });
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
async function choose(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
  value: string,
) {
  const control = renderer.root
    .findAllByType(Choice)
    .find(n => n.props.label === label);
  await act(async () => {
    button(control!, value).props.onPress();
  });
  await settle();
}
function writes() {
  return mockRequest.mock.calls.filter(([, options]) => options?.method);
}

describe('queue management workflows', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  let client: QueryClient;
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermission.mockReturnValue(true);
    mockShortage = false;
    mockQueueItems = mockItems.map(item => ({ ...item }));
    mockRequest.mockImplementation(
      async (path: string, options?: RequestInit) => {
        if (options?.method) {
          if (path === '/queue/1/start' && mockShortage)
            throw new ApiError('Short', 409, 'insufficient_filament', {
              code: 'insufficient_filament',
              deficit: [
                {
                  slot_id: 1,
                  filament_type: 'PLA',
                  required_grams: 100,
                  remaining_grams: 10,
                },
              ],
            });
          if (options.method === 'DELETE')
            return { deleted: path !== '/queue/4' };
          if (path.endsWith('/resume')) return { acknowledged: 1, restored: 1 };
          return {
            id: 8,
            message: 'Updated',
            updated_count: 2,
            skipped_count: 0,
          };
        }
        if (path === '/queue/batches') return [mockBatch];
        if (path === '/queue/batches/8') return mockBatch;
        return mockQueueItems;
      },
    );
  });
  afterEach(async () => {
    if (renderer) await act(async () => renderer.unmount());
    client?.clear();
  });
  async function renderScreen() {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <QueryClientProvider client={client}>
          <QueueScreen />
        </QueryClientProvider>,
      );
    });
    await settle();
    await settle();
  }
  it.each([8, null])(
    'allows queue:update_own to start staged jobs owned by %s without printer-control permission',
    async owner => {
      mockPermission.mockImplementation(
        permission => permission === 'queue:update_own',
      );
      mockQueueItems = [
        { ...mockItems[0], manual_start: true, created_by_id: owner },
      ];
      await renderScreen();
      await press(renderer, 'start-1');
      expect(writes()).toEqual([['/queue/1/start', { method: 'POST' }]]);
      if (owner === null) {
        expect(
          renderer.root
            .findAllByType(Pressable)
            .some(n => n.props.accessibilityLabel === 'edit-1'),
        ).toBe(false);
      }
    },
  );
  it('allows queue:update_all to start another owner’s staged job without printer-control permission', async () => {
    mockPermission.mockImplementation(
      permission => permission === 'queue:update_all',
    );
    mockQueueItems = [{ ...mockItems[0], manual_start: true, created_by_id: 99 }];
    await renderScreen();
    await press(renderer, 'start-1');
    expect(writes()).toEqual([['/queue/1/start', { method: 'POST' }]]);
  });
  it.each(['queue:update_own', 'printers:control'])(
    'does not let %s start another owner’s staged job',
    async permission => {
      mockPermission.mockImplementation(value => value === permission);
      mockQueueItems = [
        { ...mockItems[0], manual_start: true, created_by_id: 99 },
      ];
      await renderScreen();
      expect(
        renderer.root
          .findAllByType(Pressable)
          .some(n => n.props.accessibilityLabel === 'start-1'),
      ).toBe(false);
      expect(writes()).toEqual([]);
    },
  );
  it.each([
    [null, null, true],
    [10, null, false],
    [null, 20, false],
  ] as const)(
    'disables fixed-printer bulk choices only for unresolved alternatives (library %s, archive %s)',
    async (library_file_id, archive_id, disabled) => {
      mockQueueItems = [
        {
          ...mockItems[0],
          printer_id: null,
          library_file_id,
          archive_id,
          variants: [{ library_file_id: 10 }, { library_file_id: 11 }],
        },
      ];
      await renderScreen();
      await press(renderer, 'Select visible pending');
      await press(renderer, 'Bulk edit');
      const assignment = renderer.root
        .findAllByType(Choice)
        .find(n => n.props.label === 'Assign printer')!;
      expect(
        Boolean(button(assignment, 'Printer One · X1C').props.disabled),
      ).toBe(disabled);
      expect(button(assignment, 'Unchanged').props.disabled).toBeFalsy();
      expect(button(assignment, 'Unassigned').props.disabled).toBeFalsy();
      if (!disabled) {
        await choose(renderer, 'Assign printer', 'Printer One · X1C');
        await press(renderer, 'Apply');
        expect(JSON.parse(writes()[0][1].body)).toEqual({
          item_ids: [1],
          printer_id: 1,
        });
      }
    },
  );
  it('blocks unsafe mixed bulk assignment at submission while retaining other bulk options', async () => {
    mockQueueItems = [
      {
        ...mockItems[0],
        printer_id: null,
        library_file_id: null,
        archive_id: null,
        variants: [{ library_file_id: 10 }, { library_file_id: 11 }],
      },
      mockItems[1],
    ];
    await renderScreen();
    await press(renderer, 'Select visible pending');
    await press(renderer, 'Bulk edit');
    await act(async () =>
      renderer.root.findByType(QueueBulkEditModal).props.onSave({
        printer_id: 1,
        manual_start: true,
      }),
    );
    await settle();
    expect(writes()).toEqual([]);
    await choose(renderer, 'Manual staged start', 'On');
    await press(renderer, 'Apply');
    expect(writes()[0][0]).toBe('/queue/bulk');
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      item_ids: [1, 2],
      manual_start: true,
    });
  });
  it('revalidates a stale fixed-printer draft when a selected job becomes unresolved, and still allows unassignment', async () => {
    await renderScreen();
    await press(renderer, 'Select visible pending');
    await press(renderer, 'Bulk edit');
    await choose(renderer, 'Assign printer', 'Printer One · X1C');
    await act(async () => {
      client.setQueryData(['queue'], [
        {
          ...mockItems[0],
          printer_id: null,
          library_file_id: null,
          archive_id: null,
          variants: [{ library_file_id: 10 }, { library_file_id: 11 }],
        },
        mockItems[1],
      ]);
    });
    await settle();
    await press(renderer, 'Apply');
    expect(writes()).toEqual([]);
    expect(mockToast).not.toHaveBeenCalled();
    await choose(renderer, 'Assign printer', 'Unassigned');
    await press(renderer, 'Apply');
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      item_ids: [1, 2],
      printer_id: null,
    });
  });
  it('opens editable and configured-history drafts instead of retrying immediately', async () => {
    await renderScreen();
    await press(renderer, 'edit-1');
    expect(
      renderer.root
        .findAllByType(Text)
        .some(n => n.props.children === 'configured:1:false'),
    ).toBe(true);
    expect(writes()).toHaveLength(0);
    await press(renderer, 'tab-history');
    await press(renderer, 'requeue-4');
    expect(
      renderer.root
        .findAllByType(Text)
        .some(n => n.props.children === 'configured:4:true'),
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it('requires active stop confirmation and calls stop rather than pending cancel', async () => {
    await renderScreen();
    await press(renderer, 'stop-3');
    expect(writes()).toHaveLength(0);
    await press(renderer, 'Confirm');
    expect(writes()).toEqual([['/queue/3/stop', { method: 'POST' }]]);
  });
  it('reviews structured staged-start shortage, cancels safely, and explicitly bypasses', async () => {
    mockShortage = true;
    await renderScreen();
    await press(renderer, 'start-1');
    expect(
      renderer.root
        .findAllByType(Text)
        .some(n => String(n.props.children).includes('100g')),
    ).toBe(true);
    await press(renderer, 'Dismiss confirmation');
    expect(writes()).toHaveLength(1);
    await press(renderer, 'start-1');
    await press(renderer, 'Print anyway');
    expect(writes().at(-1)?.[0]).toBe(
      '/queue/1/start?skip_filament_check=true',
    );
  });
  it('resumes gated printer queues only after confirmation', async () => {
    await renderScreen();
    await press(renderer, 'Resume after failure');
    expect(writes()).toHaveLength(0);
    await press(renderer, 'Confirm');
    expect(writes()[0]).toEqual([
      '/queue/printer/1/resume',
      { method: 'POST' },
    ]);
  });
  it('sends only chosen bulk fields, preserving unchanged and auto semantics', async () => {
    await renderScreen();
    await press(renderer, 'Select visible pending');
    await press(renderer, 'Bulk edit');
    await choose(renderer, 'Bed levelling', 'Auto');
    await choose(renderer, 'Flow calibration', 'Off');
    await choose(renderer, 'Manual staged start', 'On');
    await press(renderer, 'Apply');
    const [path, options] = writes()[0];
    expect(path).toBe('/queue/bulk');
    expect(JSON.parse(options.body)).toEqual({
      item_ids: [1, 2],
      bed_levelling: 'auto',
      flow_cali: 'off',
      manual_start: true,
    });
  });
  it('groups selected pending jobs with a user-entered name', async () => {
    await renderScreen();
    await press(renderer, 'Select visible pending');
    await press(renderer, 'Group selected as batch');
    const input = renderer.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === 'New batch name');
    await act(async () => input!.props.onChangeText('Customer order'));
    await press(renderer, 'Create named batch');
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      name: 'Customer order',
      item_ids: [1, 2],
    });
  });
  it('clears only finished history records and reports server-retained order source runs', async () => {
    await renderScreen();
    await press(renderer, 'tab-history');
    await press(renderer, 'Clear history (3)');
    expect(writes()).toHaveLength(0);
    await press(renderer, 'Confirm');
    expect(writes().map(([path]) => path)).toEqual([
      '/queue/4',
      '/queue/5',
      '/queue/6',
    ]);
    expect(mockToast).toHaveBeenCalledWith(
      '2 records deleted; 1 retained for orders.',
      'success',
    );
  });
  it('dispatches only remaining single-plate production with explicit null-plate scope', async () => {
    await renderScreen();
    await press(renderer, 'tab-batches');
    await press(renderer, 'Dispatch remaining plate');
    expect(writes()[0][0]).toBe('/queue/batches/8/dispatch');
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      only_plate: true,
      plate_id: null,
    });
  });
  it('does not expose destructive or printer-control actions without permissions', async () => {
    mockPermission.mockReturnValue(false);
    await renderScreen();
    expect(
      renderer.root
        .findAllByType(Pressable)
        .some(n => n.props.accessibilityLabel === 'stop-3'),
    ).toBe(false);
    expect(
      renderer.root
        .findAllByType(Pressable)
        .some(n => n.props.accessibilityLabel === 'Resume after failure'),
    ).toBe(false);
    await press(renderer, 'tab-history');
    expect(
      renderer.root
        .findAllByType(Pressable)
        .some(n => n.props.accessibilityLabel === 'Clear history (3)'),
    ).toBe(false);
  });
});
