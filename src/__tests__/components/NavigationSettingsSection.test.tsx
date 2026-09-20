import React from 'react';
import { Switch, Text } from 'react-native';
import ReactTestRenderer, {
  act as rendererAct,
  type ReactTestInstance,
} from 'react-test-renderer';
import { NavigationSettingsSection } from '@/components/settings/NavigationSettingsSection';
import {
  useSettingsScreenController,
  type SettingsScreenController,
} from '@/components/settings/useSettingsScreenController';
import {
  BUILT_IN_NAV_ITEMS,
  type BuiltInNavId,
} from '@/navigation/navigationConfig';

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
const mockQuery = jest.fn(async () => []);
const mockShowToast = jest.fn();
const mockInvalidateQueries = jest.fn(async () => undefined);
let mockSettingsData = {
  default_sidebar_order: 'stats,settings,more,spoolbuddy',
};
const mockVirtualPrinterData = { printers: [], models: {} };
const mockRefetch = jest.fn(async () => undefined);

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === 'settings'
        ? mockSettingsData
        : queryKey[0] === 'virtualPrinterList'
          ? mockVirtualPrinterData
          : undefined,
    refetch: mockRefetch,
    isLoading: false,
    isError: false,
    isRefetching: false,
  }),
  useMutation: ({
    mutationFn,
    onSuccess,
    onError,
  }: {
    mutationFn: (variables?: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown) => Promise<void> | void;
    onError?: (error: Error) => void;
  }) => ({
    isPending: false,
    mutate: jest.fn(),
    mutateAsync: async (variables?: unknown) => {
      try {
        const data = await mutationFn(variables);
        await onSuccess?.(data);
        return data;
      } catch (error) {
        onError?.(error as Error);
        throw error;
      }
    },
  }),
}));

jest.mock('@/api/client', () => ({
  api: new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'getSettings') return mockGetSettings;
        if (property === 'updateSettings') return mockUpdateSettings;
        if (property === 'getVirtualPrinterList') {
          return jest.fn(async () => ({ printers: [], models: {} }));
        }
        return mockQuery;
      },
    },
  ),
}));

jest.mock('react-native-share', () => ({
  open: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdmin: true,
    authEnabled: false,
    user: { id: 1, email: 'admin@example.com' },
    hasPermission: () => true,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
    mode: 'system',
    setMode: jest.fn(),
  }),
}));

jest.mock('@/components/common/AppUI', () => {
  const ReactModule = require('react');
  const { Text: MockText, View: MockView } = require('react-native');
  return {
    SectionCard: ({
      title,
      subtitle,
      children,
    }: {
      title: string;
      subtitle?: string;
      children: React.ReactNode;
    }) =>
      ReactModule.createElement(
        MockView,
        null,
        ReactModule.createElement(MockText, null, title),
        subtitle
          ? ReactModule.createElement(MockText, null, subtitle)
          : null,
        children,
      ),
    PrimaryButton: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) =>
      ReactModule.createElement(
        MockText,
        {
          onPress,
          accessibilityState: { disabled: Boolean(disabled) },
          testID: `btn-${label}`,
        },
        label,
      ),
    StatusBadge: ({ label }: { label: string }) =>
      ReactModule.createElement(MockText, null, label),
  };
});

function textContent(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function buildController(
  order: BuiltInNavId[],
  setOrder: React.Dispatch<React.SetStateAction<BuiltInNavId[]>>,
  save: jest.Mock,
): SettingsScreenController {
  return {
    colors: new Proxy(
      {},
      { get: () => '#888888' },
    ) as SettingsScreenController['colors'],
    state: { navigationOrderDraft: order },
    permissions: { canUpdateSettings: true },
    mutations: {
      saveNavigationOrderMutation: {
        isPending: false,
        mutateAsync: save,
      },
    },
    actions: { setNavigationOrderDraft: setOrder },
  } as unknown as SettingsScreenController;
}

function StatefulSection({
  initialOrder,
  save,
  onOrder,
}: {
  initialOrder: BuiltInNavId[];
  save: jest.Mock;
  onOrder: (order: BuiltInNavId[]) => void;
}) {
  const [order, setOrder] = React.useState(initialOrder);
  onOrder(order);
  return (
    <NavigationSettingsSection
      controller={buildController(order, setOrder, save)}
    />
  );
}

let latestController: SettingsScreenController | undefined;

function ControllerHarness() {
  latestController = useSettingsScreenController();
  return null;
}

describe('NavigationSettingsSection', () => {
  beforeEach(() => {
    mockGetSettings.mockReset();
    mockUpdateSettings.mockReset();
    mockQuery.mockClear();
    mockShowToast.mockClear();
    mockInvalidateQueries.mockClear();
    mockSettingsData = {
      default_sidebar_order: 'stats,settings,more,spoolbuddy',
    };
    latestController = undefined;
  });

  it('renders every built-in item with visible items in their current order', () => {
    const initialOrder: BuiltInNavId[] = [
      'stats',
      'settings',
      'more',
      'spoolbuddy',
    ];
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    rendererAct(() => {
      renderer = ReactTestRenderer.create(
        <StatefulSection
          initialOrder={initialOrder}
          save={jest.fn()}
          onOrder={jest.fn()}
        />,
      );
    });

    const builtInLabels = new Set(BUILT_IN_NAV_ITEMS.map(item => item.label));
    const renderedLabels = renderer.root
      .findAllByType(Text)
      .map(textContent)
      .filter(label => builtInLabels.has(label));
    const expectedLabels = [
      ...initialOrder.map(
        id => BUILT_IN_NAV_ITEMS.find(item => item.id === id)!.label,
      ),
      ...BUILT_IN_NAV_ITEMS.filter(item => !initialOrder.includes(item.id)).map(
        item => item.label,
      ),
    ];

    expect(renderedLabels).toEqual(expectedLabels);
    rendererAct(() => renderer.unmount());
  });

  it('reorders the draft and saves it', () => {
    const save = jest.fn().mockResolvedValue(undefined);
    let latestOrder: BuiltInNavId[] = [];
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    rendererAct(() => {
      renderer = ReactTestRenderer.create(
        <StatefulSection
          initialOrder={[
            'dashboard',
            'queue',
            'more',
            'settings',
            'spoolbuddy',
          ]}
          save={save}
          onOrder={order => {
            latestOrder = order;
          }}
        />,
      );
    });

    rendererAct(() => {
      renderer.root.findAllByProps({ testID: 'btn-Move down' })[0].props.onPress();
    });
    expect(latestOrder.slice(0, 2)).toEqual(['queue', 'dashboard']);

    rendererAct(() => {
      renderer.root.findByProps({ testID: 'btn-Save navigation' }).props.onPress();
    });
    expect(save).toHaveBeenCalledTimes(1);
    rendererAct(() => renderer.unmount());
  });

  it('keeps locked items visible and disables their switches', () => {
    let latestOrder: BuiltInNavId[] = [];
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    rendererAct(() => {
      renderer = ReactTestRenderer.create(
        <StatefulSection
          initialOrder={BUILT_IN_NAV_ITEMS.map(item => item.id)}
          save={jest.fn()}
          onOrder={order => {
            latestOrder = order;
          }}
        />,
      );
    });

    const switches = renderer.root.findAllByType(Switch);
    for (const lockedId of ['more', 'settings', 'spoolbuddy'] as const) {
      const index = BUILT_IN_NAV_ITEMS.findIndex(item => item.id === lockedId);
      expect(switches[index].props.disabled).toBe(true);
      expect(switches[index].props.value).toBe(true);

      rendererAct(() => {
        switches[index].props.onValueChange(false);
      });
      expect(latestOrder).toContain(lockedId);
    }
    rendererAct(() => renderer.unmount());
  });

  it('reverts failed saves, then persists and invalidates settings on success', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('Save failed'));
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await rendererAct(async () => {
      renderer = ReactTestRenderer.create(<ControllerHarness />);
    });

    expect(latestController?.state.navigationOrderDraft).toEqual([
        'stats',
        'settings',
        'more',
        'spoolbuddy',
      ]);

    rendererAct(() => {
      latestController?.actions.setNavigationOrderDraft([
        'energy',
        'settings',
        'more',
        'spoolbuddy',
      ]);
    });

    await rendererAct(async () => {
      await expect(
        latestController?.mutations.saveNavigationOrderMutation.mutateAsync(),
      ).rejects.toThrow('Save failed');
    });

    expect(latestController?.state.navigationOrderDraft).toEqual([
      'stats',
      'settings',
      'more',
      'spoolbuddy',
    ]);
    expect(mockShowToast).toHaveBeenCalledWith('Save failed', 'error');

    mockUpdateSettings.mockResolvedValue({
      default_sidebar_order: 'energy,settings,more,spoolbuddy',
    });
    rendererAct(() => {
      latestController?.actions.setNavigationOrderDraft([
        'energy',
        'settings',
        'more',
        'spoolbuddy',
      ]);
    });
    expect(latestController?.state.navigationOrderDraft[0]).toBe('energy');
    await rendererAct(async () => {
      await latestController?.mutations.saveNavigationOrderMutation.mutateAsync();
    });

    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        default_sidebar_order: 'energy,settings,more,spoolbuddy',
      }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['settings'],
    });
    rendererAct(() => renderer.unmount());
  });
});
