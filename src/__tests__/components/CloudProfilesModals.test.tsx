import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { CloudProfileDetailModal } from '@/components/profiles/CloudProfileDetailModal';
import { CloudProfileDiffModal } from '@/components/profiles/CloudProfileDiffModal';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockModal = ({
    children,
    visible,
  }: {
    children: React.ReactNode;
    visible: boolean;
  }) => (visible ? React.createElement(View, null, children) : null);
  return { __esModule: true, default: MockModal };
});

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    } & Record<string, unknown>) => React.createElement(View, props, children),
  };
});

jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    PrimaryButton: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
    StatusBadge: ({ label }: { label: string }) =>
      React.createElement(View, null, React.createElement(Text, null, label)),
  };
});

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy(
      {},
      {
        get: () => '#888888',
      },
    ),
    isDark: true,
  }),
}));

function textContent(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function hasText(
  root: ReactTestRenderer.ReactTestRenderer,
  value: string,
): boolean {
  return root.root
    .findAllByType(Text)
    .some(node => textContent(node).includes(value));
}

describe('Cloud profile modals', () => {
  it('renders cloud profile detail values', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <CloudProfileDetailModal
          visible
          profileName="PLA Generic"
          detail={{
            public: true,
            type: 'filament',
            name: 'PLA Generic',
            setting: { max_volumetric_speed: 22, compatible_printers: ['X1C'] },
            update_time: '2026-07-27T12:00:00Z',
            version: '2',
            base_id: 'pla_base',
            setting_id: 'GFSA00',
          }}
          isLoading={false}
          errorMessage={null}
          onRetry={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(hasText(renderer, 'Profile details')).toBe(true);
    expect(hasText(renderer, 'PLA Generic')).toBe(true);
    expect(hasText(renderer, 'max_volumetric_speed')).toBe(true);
    expect(hasText(renderer, '22')).toBe(true);
  });

  it('renders cloud profile diff fields', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <CloudProfileDiffModal
          visible
          leftLabel="PLA Generic"
          rightLabel="PLA Matte"
          fields={[
            {
              path: 'cooling.fan_speed',
              left_value: 80,
              right_value: 60,
            },
          ]}
          isLoading={false}
          errorMessage={null}
          onRetry={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(hasText(renderer, 'Template differences')).toBe(true);
    expect(hasText(renderer, 'cooling.fan_speed')).toBe(true);
    expect(hasText(renderer, '80')).toBe(true);
    expect(hasText(renderer, '60')).toBe(true);
  });
});
