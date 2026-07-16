import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
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

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
    isDark: true,
  }),
}));

function textContent(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function findText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  return root.root.findAllByType(Text).find(node => textContent(node) === value) ?? null;
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
});
