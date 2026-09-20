import React, { useCallback } from 'react';
import type { PrintQueueItem } from '@/types/api';
import { QueueItemCard } from './QueueItemCard';

interface DraggableQueueItemProps {
  item: PrintQueueItem;
  printerState?: string | null;
  selected?: boolean;
  selectionMode?: boolean;
  index?: number | null;
  _index?: number;
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
  onDragStart?: (index: number) => void;
  onDragMove?: (index: number, targetIndex: number) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  dragIndex?: number;
  dragTargetIndex?: number;
}

export function DraggableQueueItem({
  item,
  printerState,
  selected,
  selectionMode,
  _index,
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
  onDragStart,
  onDragMove,
  onDragEnd,
  isDragging,
  dragIndex,
  dragTargetIndex,
}: DraggableQueueItemProps) {
  const handleReorder = useCallback((direction: 'up' | 'down') => {
    if (onReorder) {
      onReorder(direction);
    }
  }, [onReorder]);

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
      onReorder={handleReorder}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      isDragging={isDragging}
      dragIndex={dragIndex}
      dragTargetIndex={dragTargetIndex}
    />
  );
}
