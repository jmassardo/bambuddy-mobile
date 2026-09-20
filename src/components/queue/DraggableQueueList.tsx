import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { PrintQueueItem } from '@/types/api';
import { DraggableQueueItem } from './DraggableQueueItem';
import { EmptyState } from '@/components/common/StateScreens';

interface DraggableQueueListProps {
  items: PrintQueueItem[];
  printerStateMap?: Record<number, string | null>;
  selectionMode?: boolean;
  selectedIds?: number[];
  onToggleSelection?: (id: number) => void;
  onStart?: (id: number) => void;
  onCancel?: (id: number) => void;
  onDelete?: (id: number) => void;
  onReassign?: (id: number) => void;
  onReorder?: (itemIds: number[]) => void;
  onDragStart?: (index: number) => void;
  onDragMove?: (sourceIndex: number, targetIndex: number) => void;
  onDragEnd?: () => void;
}

const DRAG_THRESHOLD = 24;

export function DraggableQueueList({
  items,
  printerStateMap,
  selectionMode,
  selectedIds = [],
  onToggleSelection,
  onStart,
  onCancel,
  onDelete,
  onReassign,
  onReorder,
  onDragStart,
  onDragMove,
  onDragEnd,
}: DraggableQueueListProps) {
  const { colors } = useTheme();
  const [dragState, setDragState] = useState<{
    sourceIndex: number | undefined;
    targetIndex: number | undefined;
  }>({ sourceIndex: undefined, targetIndex: undefined });

  const orderedItems = useMemo(() => {
    return [...items].sort((a, b) => a.position - b.position);
  }, [items]);

  const handleDragStart = useCallback((index: number) => {
    setDragState({ sourceIndex: index, targetIndex: undefined });
    onDragStart?.(index);
  }, [onDragStart]);

  const handleDragMove = useCallback((sourceIndex: number, targetIndex: number) => {
    setDragState(prev => {
      if (prev.targetIndex === targetIndex) return prev;
      onDragMove?.(sourceIndex, targetIndex);
      return { ...prev, targetIndex };
    });
  }, [onDragMove]);

  const handleDragEnd = useCallback(() => {
    setDragState(prev => {
      if (prev.sourceIndex !== undefined && prev.targetIndex !== undefined && prev.sourceIndex !== prev.targetIndex) {
        const sourceIdx = prev.sourceIndex;
        const targetIdx = prev.targetIndex;
        onReorder?.(
          orderedItems.map((item, i) => {
            if (i === sourceIdx) return orderedItems[targetIdx].id;
            if (i === targetIdx) return orderedItems[sourceIdx].id;
            return item.id;
          }),
        );
      }
      onDragEnd?.();
      return { sourceIndex: undefined, targetIndex: undefined };
    });
  }, [onDragEnd, onReorder, orderedItems]);

  const getDragStyle = (index: number) => {
    const { sourceIndex, targetIndex } = dragState;
    if (sourceIndex === undefined || targetIndex === undefined) return {};

    if (index === sourceIndex) {
      return {
        opacity: 0.6,
        transform: [{ scale: 0.97 }],
      } as const;
    }

    if (index === targetIndex) {
      return {
        backgroundColor: `${colors.accent}08`,
        borderColor: colors.accent,
        borderWidth: 2,
        transform: [{ scale: 1.02 }],
      } as const;
    }

    if (sourceIndex !== undefined && targetIndex !== undefined) {
      if (index === targetIndex - 1 && sourceIndex === targetIndex + 1) {
        return { transform: [{ translateY: DRAG_THRESHOLD * 0.5 }] } as const;
      }
      if (index === targetIndex + 1 && sourceIndex === targetIndex - 1) {
        return { transform: [{ translateY: -DRAG_THRESHOLD * 0.5 }] } as const;
      }
    }

    return {};
  };

  if (orderedItems.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No queued items"
        message="The filtered queue is empty. Try clearing filters or add a print from Archives or Files."
      />
    );
  }

  return (
    <View style={styles.list}>
      {orderedItems.map((item, index) => {
        const dragStyle = getDragStyle(index);
        return (
          <View key={`pending-${item.id}`} style={[styles.item, dragStyle]}>
            <DraggableQueueItem
              index={index as number}
              item={item}
              printerState={printerStateMap?.[item.printer_id ?? 0]}
              selected={selectedIds.includes(item.id)}
              selectionMode={selectionMode}
              onPress={selectionMode ? () => onToggleSelection?.(item.id) : undefined}
              onLongPress={() => {
                if (selectionMode) {
                  onToggleSelection?.(item.id);
                  return;
                }
                onToggleSelection?.(item.id);
              }}
              onToggleSelect={() => onToggleSelection?.(item.id)}
              onStart={() => onStart?.(item.id)}
              onCancel={() => onCancel?.(item.id)}
              onDelete={() => onDelete?.(item.id)}
              onReassign={() => onReassign?.(item.id)}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              isDragging={dragState.sourceIndex !== null}
              dragIndex={dragState.sourceIndex}
              dragTargetIndex={dragState.targetIndex}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  item: {
    overflow: 'hidden',
  },
});
