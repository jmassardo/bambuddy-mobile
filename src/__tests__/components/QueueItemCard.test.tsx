import React from 'react';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { GestureDetector } from 'react-native-gesture-handler';
import { QueueItemCard } from '@/components/queue/QueueItemCard';
import type { PrintQueueItem } from '@/types/api';

const mockColors = {
  accent: '#00aa44', accentBg: '#113322', highlight: '#ffaa00',
  card: '#222222', cardBorder: '#444444',
};
let mockMediaToken: string | null = null;
let mockServerUrl: string | null = null;
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy(mockColors, { get: (target, key) => target[key as keyof typeof target] ?? '#888888' }) }),
}));
jest.mock('@/api/server', () => ({
  useServerStore: (select: (state: { serverUrl: string | null }) => unknown) => select({ serverUrl: mockServerUrl }),
}));
jest.mock('@/api/client', () => ({ withStreamToken: (url: string) => mockMediaToken ? `${url}?token=${mockMediaToken}` : url }));
jest.mock('@/hooks/useStreamToken', () => ({ useMediaToken: () => ({ token: mockMediaToken }) }));
jest.mock('react-native-haptic-feedback', () => ({ trigger: jest.fn() }));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    cancelAnimation: jest.fn(),
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    useSharedValue: (value: unknown) => ({ value }),
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
  };
});
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const gesture = {
        minDistance: jest.fn(), onStart: jest.fn(), onUpdate: jest.fn(), onEnd: jest.fn(),
      };
      Object.values(gesture).forEach(method => method.mockReturnValue(gesture));
      return gesture;
    },
  },
}));

function cardFrames(renderer: ReactTestRenderer.ReactTestRenderer) {
  const title = renderer.root.findAllByType(Text).find(node => node.props.children === 'Gear')!;
  const frames: ViewStyle[] = [];
  let node: ReactTestInstance | null = title.parent;
  while (node) {
    if (typeof node.type === 'string') {
      const value = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
      const style = StyleSheet.flatten(value) as ViewStyle | undefined;
      if (style?.borderWidth && style.padding) frames.push(style);
    }
    node = node.parent;
  }
  return frames;
}

beforeEach(() => {
  mockMediaToken = null;
  mockServerUrl = null;
});

it('keeps one job frame while preserving selection, drag-target highlighting and presses', async () => {
  const item = { id: 1, status: 'pending', library_file_name: 'Gear' } as PrintQueueItem;
  const onPress = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QueueItemCard item={item} dragEnabled onPress={onPress} />);
    });

    expect(cardFrames(renderer)).toHaveLength(1);
    await act(async () => {
      renderer.root.findAll(node => node !== renderer.root && node.props.onPress === onPress)[0].props.onPress();
      renderer.update(<QueueItemCard item={item} dragEnabled selected />);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(cardFrames(renderer)).toEqual([expect.objectContaining({ borderColor: mockColors.accent, backgroundColor: mockColors.accentBg })]);
    await act(async () => {
      renderer.update(<QueueItemCard item={item} dragEnabled index={1} isDragging dragIndex={0} dragTargetIndex={1} />);
    });
    expect(cardFrames(renderer)).toEqual([expect.objectContaining({ borderColor: mockColors.highlight, borderWidth: 2 })]);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});

it('exposes an independently operable checkbox with the job name and selected state', async () => {
  const item = { id: 1, status: 'pending', library_file_name: 'Gear' } as PrintQueueItem;
  const onToggleSelect = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QueueItemCard item={item} showSelection selected onToggleSelect={onToggleSelect} />);
    });
    const checkbox = renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'checkbox')[0];
    expect(checkbox.props.accessibilityLabel).toBe('Gear');
    expect(checkbox.props.accessibilityState.checked).toBe(true);
    await act(async () => renderer.root.findAll(node => node.props.onPress === onToggleSelect)[0].props.onPress());
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});

it('attaches reordering only to the grip and preserves drag callbacks', async () => {
  const item = { id: 1, status: 'pending', library_file_name: 'Gear' } as PrintQueueItem;
  const onDragStart = jest.fn();
  const onDragMove = jest.fn();
  const onDragEnd = jest.fn();
  const onReorder = jest.fn();
  const props = { item, dragEnabled: true, index: 1, onDragStart, onDragMove, onDragEnd, onReorder };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QueueItemCard {...props} />);
    });
    const detector = renderer.root.findByType(GestureDetector);
    expect(detector.props.children.props.testID).toBe('queue-drag-handle');
    expect(detector.findAllByType(Text)).toHaveLength(0);
    await act(async () => {
      detector.props.gesture.onStart.mock.calls[0][0]();
      detector.props.gesture.onUpdate.mock.calls[0][0]({ translationY: -40 });
    });
    expect(onDragStart).toHaveBeenCalledWith(1);
    expect(onDragMove).toHaveBeenCalledWith(1, 0);
    await act(async () => {
      renderer.update(<QueueItemCard {...props} isDragging dragIndex={1} dragTargetIndex={0} />);
    });
    await act(async () => {
      renderer.root.findByType(GestureDetector).props.gesture.onEnd.mock.calls[0][0]();
    });
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith('up');
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});

it('omits drag affordances when dragging is disabled', async () => {
  const item = { id: 1, status: 'pending', library_file_name: 'Gear' } as PrintQueueItem;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QueueItemCard item={item} />);
    });
    expect(renderer.root.findAllByType(GestureDetector)).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'queue-drag-handle' })).toHaveLength(0);
    expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Drag to reorder')).toBe(false);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});

it('retries a failed thumbnail when the media token changes', async () => {
  mockServerUrl = 'https://farm.example';
  const item = { id: 1, status: 'pending', library_file_id: 7, library_file_name: 'Gear' } as PrintQueueItem;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const images = () => renderer.root.findAll(node => node.props.source?.uri && node.props.onError);
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QueueItemCard item={item} />);
    });
    await act(async () => images()[0].props.onError());
    expect(images()).toHaveLength(0);
    mockMediaToken = 'fresh-media';
    await act(async () => renderer.update(<QueueItemCard item={item} />));
    expect(images()[0].props.source.uri).toBe('https://farm.example/api/v1/library/files/7/thumbnail?token=fresh-media');
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});
