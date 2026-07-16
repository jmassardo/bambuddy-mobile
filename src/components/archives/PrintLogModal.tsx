import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState, ErrorState } from '@/components/common/StateScreens';
import { PrimaryButton } from '@/components/common/AppUI';
import { Icon } from '@/components/common/TabBarIcon';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDateTime, pickString, type ApiRecord } from '@/utils/data';

interface PrintLogModalProps {
  visible: boolean;
  archiveId: number | null;
  archiveName?: string | null;
  onClose: () => void;
}

interface PrintLogRow {
  timestamp: string;
  event: string;
  details: string;
}

function normalizeRows(data: unknown): PrintLogRow[] {
  if (!Array.isArray(data)) return [];
  const rows: PrintLogRow[] = [];

  data.forEach(item => {
    const record = item as ApiRecord;
    const directTimestamp = pickString(record, ['timestamp', 'created_at', 'completed_at', 'started_at']);
    const directEvent = pickString(record, ['event', 'status'], 'Status change');
    const directDetails = pickString(record, ['details', 'failure_reason', 'printer_name', 'print_name'], 'Archive print log entry');

    if (pickString(record, ['timestamp']) || pickString(record, ['event'])) {
      rows.push({
        timestamp: directTimestamp,
        event: directEvent,
        details: directDetails,
      });
      return;
    }

    const startedAt = pickString(record, ['started_at']);
    const completedAt = pickString(record, ['completed_at']);
    const createdAt = pickString(record, ['created_at']);
    const printerName = pickString(record, ['printer_name'], 'Unknown printer');
    const status = pickString(record, ['status'], 'unknown');
    const failureReason = pickString(record, ['failure_reason']);

    if (startedAt) {
      rows.push({
        timestamp: startedAt,
        event: 'Started',
        details: `Started on ${printerName}`,
      });
    }

    rows.push({
      timestamp: completedAt || createdAt || startedAt,
      event: status ? `Status: ${status}` : 'Updated',
      details: failureReason || `Logged for ${printerName}`,
    });
  });

  return rows.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function PrintLogModal({
  visible,
  archiveId,
  archiveName,
  onClose,
}: PrintLogModalProps) {
  const { colors } = useTheme();

  const printLogQuery = useQuery({
    queryKey: ['archivePrintLog', archiveId],
    queryFn: () => api.getArchivePrintLog(Number(archiveId)),
    enabled: visible && archiveId != null,
  });

  const rows = useMemo(
    () => normalizeRows(printLogQuery.data),
    [printLogQuery.data],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Print log</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {archiveName || 'Archive history'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Icon name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {printLogQuery.isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading print log…</Text>
            </View>
          ) : printLogQuery.isError ? (
            <ErrorState
              message="Unable to load the archive print log."
              onRetry={() => void printLogQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="No print log entries"
              message="This archive does not have any print log rows yet."
            />
          ) : (
            <ScrollView horizontal>
              <View>
                <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}> 
                  <Text style={[styles.headerCell, styles.timestampCell, { color: colors.textSecondary }]}>Timestamp</Text>
                  <Text style={[styles.headerCell, styles.eventCell, { color: colors.textSecondary }]}>Event</Text>
                  <Text style={[styles.headerCell, styles.detailsCell, { color: colors.textSecondary }]}>Details</Text>
                </View>
                <ScrollView style={styles.tableBody}>
                  {rows.map((row, index) => (
                    <View
                      key={`${row.timestamp}-${row.event}-${index}`}
                      style={[styles.tableRow, { borderBottomColor: colors.borderSubtle }]}
                    >
                      <Text style={[styles.bodyCell, styles.timestampCell, { color: colors.text }]}>
                        {formatDateTime(row.timestamp)}
                      </Text>
                      <Text style={[styles.bodyCell, styles.eventCell, { color: colors.text }]}>
                        {row.event}
                      </Text>
                      <Text style={[styles.bodyCell, styles.detailsCell, { color: colors.textSecondary }]}>
                        {row.details || '—'}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          )}

          <View style={styles.footer}>
            <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  loadingText: {
    fontSize: fontSize.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  tableBody: {
    maxHeight: 360,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCell: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: fontWeight.semibold,
    paddingRight: spacing.md,
  },
  bodyCell: {
    fontSize: fontSize.sm,
    paddingRight: spacing.md,
  },
  timestampCell: {
    width: 150,
  },
  eventCell: {
    width: 140,
  },
  detailsCell: {
    width: 220,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
