import React from 'react';
import * as ReactNative from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NfcInventoryScanModal } from '@/components/inventory/NfcInventoryScanModal';
import { colors as themeColors } from '@/theme/tokens';

let mockThemeMode: 'light' | 'dark' = 'dark';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, visible }: { children: React.ReactNode; visible: boolean }) => visible ? MockReact.createElement(View, null, children) : null };
});

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => MockReact.createElement(View, props, children) };
});

jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => MockReact.createElement(View, props, children) };
});

jest.spyOn(ReactNative.AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens').colors[mockThemeMode],
    isDark: mockThemeMode === 'dark',
  }),
}));

jest.mock('@/hooks/useNfc', () => ({
  useNfc: jest.fn(() => ({ status: 'ready', checkCapability: jest.fn(), readTag: jest.fn(), cancelRead: jest.fn() })),
}));

jest.mock('@/api/inventory', () => ({
  inventoryApi: { lookupSpoolByUid: jest.fn() },
}));

import { useNfc } from '@/hooks/useNfc';
import { inventoryApi } from '@/api/inventory';

const mockNfc = useNfc as jest.MockedFunction<typeof useNfc>;
const mockLookup = inventoryApi.lookupSpoolByUid as jest.MockedFunction<typeof inventoryApi.lookupSpoolByUid>;

function renderComponent(props: Partial<React.ComponentProps<typeof NfcInventoryScanModal>> = {}) {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  const onClose = jest.fn();
  const onAdd = jest.fn();
  const onEdit = jest.fn();
  const onAssign = jest.fn();

  act(() => {
    renderer = ReactTestRenderer.create(
      <NfcInventoryScanModal
        visible={true}
        onClose={onClose}
        onAdd={onAdd}
        onEdit={onEdit}
        onAssign={onAssign}
        {...props}
      />,
    );
  });

  return { renderer: renderer!, onClose, onAdd, onEdit, onAssign };
}

describe('NfcInventoryScanModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockThemeMode = 'dark';
    mockNfc.mockReturnValue({ status: 'ready', checkCapability: jest.fn(), readTag: jest.fn(), cancelRead: jest.fn() });
    mockLookup.mockResolvedValue({ kind: 'not_found', uid: '04A1B2C3D4E5F6' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders when visible', () => {
    const { renderer } = renderComponent();
    expect(renderer).toBeTruthy();
  });

  it('displays "Ready to Scan" when in ready state', () => {
    const { renderer } = renderComponent();
    const buttons = renderer.root.findAllByType(ReactNative.Text);
    expect(buttons.some(b => b.props.children?.includes?.('Ready'))).toBe(true);
  });

  it('announces scan description on open', async () => {
    renderComponent();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(ReactNative.AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Ready to scan. Hold a Bambu spool near your phone.');
  });

  it('renders buttons with accessibilityRole', () => {
    const { renderer } = renderComponent();
    const buttons = renderer.root.findAllByType(ReactNative.Pressable);
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.props.accessibilityRole).toBe('button');
    });
  });

  it('renders buttons with accessibilityLabel', () => {
    const { renderer } = renderComponent();
    const buttons = renderer.root.findAllByType(ReactNative.Pressable);
    buttons.forEach((btn) => {
      expect(btn.props.accessibilityLabel).toBeDefined();
      expect(typeof btn.props.accessibilityLabel).toBe('string');
    });
  });

  it.each(['light', 'dark'] as const)('gives scan actions a contrasting themed surface in %s mode', mode => {
    mockThemeMode = mode;
    const { renderer } = renderComponent();
    const button = renderer.root.findAllByType(ReactNative.Pressable)[0];
    expect(ReactNative.StyleSheet.flatten(button.props.style).backgroundColor).toBe(themeColors[mode].accent);
    expect(ReactNative.StyleSheet.flatten(button.findByType(ReactNative.Text).props.style).color).toBe(themeColors[mode].textInverse);
    act(() => renderer.unmount());
  });

  it('shows a lookup failure and keeps Done a neutral dismissal', async () => {
    mockThemeMode = 'light';
    const readTag = jest.fn().mockResolvedValue({ status: 'success', uid: 'UID' });
    mockNfc.mockReturnValue({ status: 'ready', checkCapability: jest.fn(), readTag, cancelRead: jest.fn() });
    mockLookup.mockResolvedValue({ kind: 'lookup_error', uid: 'UID', message: 'Inventory unavailable' });
    const { renderer, onClose } = renderComponent();
    await act(async () => { await renderer.root.findAllByType(ReactNative.Pressable)[0].props.onPress(); });
    const description = renderer.root.findAllByType(ReactNative.Text)
      .find(node => node.props.children === 'Inventory unavailable');
    expect(description).toBeTruthy();
    const done = renderer.root.findAllByType(ReactNative.Pressable)
      .find(node => node.props.accessibilityLabel === 'Done')!;
    expect(ReactNative.StyleSheet.flatten(done.props.style).backgroundColor).toBe(themeColors.light.surfaceElevated);
    expect(ReactNative.StyleSheet.flatten(done.findByType(ReactNative.Text).props.style).color).toBe(themeColors.light.text);
    act(() => done.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });
});
