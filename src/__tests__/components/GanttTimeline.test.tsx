/* eslint-disable @typescript-eslint/no-shadow */
import React from 'react';
import { Pressable } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { GanttTimeline } from '@/components/queue/GanttTimeline';
import type { PrintQueueItem } from '@/types/api';

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
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));

it('navigates twelve-hour windows, resets to now, and preserves tapped item context', async () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  const current = {
    id: 1,
    position: 1,
    status: 'pending',
    printer_id: 1,
    library_file_name: 'Current gear',
    print_time_seconds: 600,
  } as PrintQueueItem;
  const later = {
    ...current,
    id: 2,
    library_file_name: 'Future case',
    scheduled_time: '2026-10-28T01:00:00Z',
  };
  const onItemPress = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <GanttTimeline items={[current, later]} onItemPress={onItemPress} />,
      );
    });
    const buttons = () => renderer.root.findAllByType(Pressable);
    const find = (label: string) =>
      buttons().find(node => node.props.accessibilityLabel === label)!;
    const event = (name: string) =>
      buttons().find(node =>
        String(node.props.accessibilityLabel).startsWith(`${name} ·`),
      );
    expect(event('Current gear')).toBeDefined();
    expect(event('Future case')).toBeUndefined();
    await act(async () => event('Current gear')!.props.onPress());
    expect(onItemPress).toHaveBeenLastCalledWith(current);
    await act(async () => find('Next 12 hours').props.onPress());
    expect(event('Current gear')).toBeUndefined();
    expect(event('Future case')).toBeDefined();
    await act(async () => event('Future case')!.props.onPress());
    expect(onItemPress).toHaveBeenLastCalledWith(later);
    await act(async () => find('Previous 12 hours').props.onPress());
    expect(event('Current gear')).toBeDefined();
    await act(async () => find('Next 12 hours').props.onPress());
    await act(async () => find('Now').props.onPress());
    expect(event('Current gear')).toBeDefined();
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    clock.mockRestore();
  }
});
