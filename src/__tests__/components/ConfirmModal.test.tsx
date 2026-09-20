/* eslint-disable @typescript-eslint/no-shadow -- Test file with React/Text imports shadowing globals */
import React from 'react';
import * as ReactNative from 'react-native';
import { ActivityIndicator, Text, Pressable } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { ConfirmModal } from '@/components/common/ConfirmModal';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockModal = ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
    visible ? React.createElement(View, null, children) : null;
  return { __esModule: true, default: MockModal };
});

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) =>
      React.createElement(View, props, children),
  };
});

jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) =>
      React.createElement(View, props, children),
  };
});

jest.spyOn(ReactNative.AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
jest.spyOn(ReactNative.AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
jest.spyOn(ReactNative.AccessibilityInfo, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() } as any));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: {
      error: '#dc2626',
      warning: '#f59e0b',
      accent: '#0ea5e9',
      accentDark: '#0284c7',
      text: '#ffffff',
      textSecondary: '#9ca3af',
      textInverse: '#ffffff',
      modalBg: '#1f2937',
      surfaceElevated: '#374151',
      overlay: 'rgba(0,0,0,0.5)',
      border: '#4b5563',
    },
    isDark: true,
  }),
}));

function textContent(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child as ReactTestInstance)))
    .join('');
}

function findText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  return root.root.findAllByType(Text).find((node) => textContent(node) === value) ?? null;
}

function findPressableForText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  let current = findText(root, value);
  while (current) {
    if (typeof current.props.onPress === 'function') return current;
    current = current.parent;
  }
  throw new Error(`Pressable for text "${value}" not found`);
}

describe('ConfirmModal', () => {
  const defaultProps: React.ComponentProps<typeof ConfirmModal> = {
    visible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Delete printer?',
    message: 'This cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Keep',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderModal(props?: Partial<React.ComponentProps<typeof ConfirmModal>>) {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ConfirmModal {...defaultProps} {...props} />);
    });
    return renderer;
  }

  it('renders the title, message, and buttons', () => {
    const renderer = renderModal();

    expect(findText(renderer, 'Delete printer?')).not.toBeNull();
    expect(findText(renderer, 'This cannot be undone.')).not.toBeNull();
    expect(findText(renderer, 'Delete')).not.toBeNull();
    expect(findText(renderer, 'Keep')).not.toBeNull();
  });

  it('calls onConfirm when the confirm button is pressed', () => {
    const renderer = renderModal();

    act(() => {
      findPressableForText(renderer, 'Delete').props.onPress();
    });

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the cancel button is pressed', () => {
    const renderer = renderModal();

    act(() => {
      findPressableForText(renderer, 'Keep').props.onPress();
    });

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state and disables actions while loading', () => {
    const renderer = renderModal({ loading: true });

    expect(findText(renderer, 'Delete')).toBeNull();
    expect(renderer.root.findAllByType(ActivityIndicator).length).toBe(1);
    expect(findPressableForText(renderer, 'Keep').props.disabled).toBe(true);
  });

  describe('accessibility semantics', () => {
    it('sets accessibilityLabel on cancel button', () => {
      const renderer = renderModal();
      const cancelPressable = findPressableForText(renderer, 'Keep');
      expect(cancelPressable.props.accessibilityLabel).toBe('Keep');
      expect(cancelPressable.props.accessibilityRole).toBe('button');
    });

    it('sets accessibilityLabel on confirm button', () => {
      const renderer = renderModal();
      const confirmPressable = findPressableForText(renderer, 'Delete');
      expect(confirmPressable.props.accessibilityLabel).toBe('Delete');
      expect(confirmPressable.props.accessibilityRole).toBe('button');
    });

    it('reports disabled state on buttons', () => {
      const renderer = renderModal({ loading: true });
      const cancelPressable = findPressableForText(renderer, 'Keep');
      expect(cancelPressable.props.accessibilityState?.disabled).toBe(true);
      expect(cancelPressable.props.disabled).toBe(true);
    });

    it('reports busy state on confirm button when loading', () => {
      const renderer = renderModal({ loading: true });
      const confirmPressable = renderer.root.findAllByType(Pressable).find(
        (p) => p.props.accessibilityLabel === 'Delete',
      );
      expect(confirmPressable?.props.accessibilityState?.busy).toBe(true);
    });

    it('announces modal title on open', async () => {
      renderModal();
      // Wait for the setTimeout (100ms delay) to fire
      jest.advanceTimersByTime(150);
      expect(ReactNative.AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Delete printer?');
    });
  });

  describe('returnFocusRef', () => {
    it('accepts returnFocusRef without crashing', () => {
      const ref = { current: { focus: jest.fn() } };
      const renderer = renderModal({ returnFocusRef: ref as any });
      expect(renderer).toBeTruthy();
    });

    it('renders without returnFocusRef (backwards compatible)', () => {
      const renderer = renderModal();
      expect(renderer).toBeTruthy();
    });
  });

  describe('duplicate confirm prevention', () => {
    it('invokes onConfirm only once on rapid presses', () => {
      const renderer = renderModal();

      act(() => {
        findPressableForText(renderer, 'Delete').props.onPress();
        findPressableForText(renderer, 'Delete').props.onPress();
        findPressableForText(renderer, 'Delete').props.onPress();
      });

      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('variants', () => {
    it('renders danger variant correctly', () => {
      const renderer = renderModal({ variant: 'danger' });
      expect(findText(renderer, 'Delete printer?')).not.toBeNull();
    });

    it('renders warning variant correctly', () => {
      const renderer = renderModal({ variant: 'warning', title: 'Warning title', message: 'Warning message' });
      expect(findText(renderer, 'Warning title')).not.toBeNull();
    });

    it('renders info variant correctly', () => {
      const renderer = renderModal({ variant: 'info', title: 'Info title', message: 'Info message' });
      expect(findText(renderer, 'Info title')).not.toBeNull();
    });
  });

  describe('backwards compatibility', () => {
    it('renders without returnFocusRef', () => {
      const renderer = renderModal();
      expect(renderer).toBeTruthy();
    });

    it('retains default button labels', () => {
      const renderer = renderModal({ confirmLabel: undefined, cancelLabel: undefined });
      expect(findText(renderer, 'Confirm')).not.toBeNull();
      expect(findText(renderer, 'Cancel')).not.toBeNull();
    });

    it('renders with default variant', () => {
      const renderer = renderModal({ variant: undefined });
      expect(renderer).toBeTruthy();
    });

    it('renders without loading', () => {
      const renderer = renderModal({ loading: undefined, confirmLabel: 'Confirm' });
      expect(findText(renderer, 'Confirm')).not.toBeNull();
    });
  });
});
