import React from 'react';
import type { PrintQueueItem } from '@/types/api';
import { QueueItemCard } from './QueueItemCard';

interface DraggableQueueItemProps {
  item: PrintQueueItem;
  printerState?: string | null;
  selected?: boolean;
  selectionMode?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onStart?: () => void;
  onCancel?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  onReassign?: () => void;
  onReorder?: (direction: 'up' | 'down') => void;
}

export function DraggableQueueItem({
  item,
  printerState,
  selected,
  selectionMode,
  onPress,
  onLongPress,
  onToggleSelect,
  onStart,
  onCancel,
  onPause,
  onStop,
  onDelete,
  onRetry,
  onReassign,
  onReorder,
}: DraggableQueueItemProps) {
  return (
    <QueueItemCard
      item={item}
      printerState={printerState}
      selected={selected}
      showSelection={selectionMode}
      onPress={onPress}
      onLongPress={onLongPress}
      onToggleSelect={onToggleSelect}
      onStart={onStart}
      onCancel={onCancel}
      onPause={onPause}
      onStop={onStop}
      onDelete={onDelete}
      onRetry={onRetry}
      onReassign={onReassign}
      dragEnabled
      onReorder={onReorder}
    />
  );
}
