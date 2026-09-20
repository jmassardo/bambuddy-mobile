import React from 'react';
import * as ReactNative from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NfcInventoryScanModal } from '@/components/inventory/NfcInventoryScanModal';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, visible }: { children: React.ReactNode; visible: boolean }) => visible ? React.createElement(View, null, children) : null };
});

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => React.createElement(View, props, children) };
});

jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => React.createElement(View, props, children) };
});

jest.spyOn(ReactNative.AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: {
      error: '#dc2626', warning: '#f59e0b', accent: '#00AE42', accentDark: '#009438',
      text: '#ffffff', textSecondary: '#9ca3af', textInverse: '#ffffff',
      modalBg: '#2d2d2d', surfaceElevated: '#3d3d3d', overlay: 'rgba(0,0,0,0.5)',
      border: '#3d3d3d', background: '#1a1a1a', surface: '#2d2d2d', surfaceHover: '#4a4a4a',
    },
    isDark: true,
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
});
