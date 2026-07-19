import React, { useMemo } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertTriangle, X } from 'lucide-react-native';
import { api } from '@/api/client';
import { PrimaryButton, StatusBadge } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { Archive } from '@/types/api';
import { formatCurrency, formatDateTime, formatDuration, formatWeight } from '@/utils/data';

interface CompareArchivesModalProps {
  visible: boolean;
  archives: Archive[];
  onClose: () => void;
}

interface ComparisonRow {
  key: string;
  label: string;
  values: string[];
  hasDifference: boolean;
}

function statusColor(status: string, colors: ReturnType<typeof useTheme>['colors']) {
  switch (status) {
    case 'completed':
      return colors.success;
    case 'failed':
    case 'aborted':
      return colors.error;
    case 'printing':
      return colors.info;
    default:
      return colors.warning;
  }
}

function normalizeValue(value: unknown) {
  return String(value ?? '—').trim().toLowerCase();
}

export function CompareArchivesModal({ visible, archives, onClose }: CompareArchivesModalProps) {
  const { colors } = useTheme();

  const rows = useMemo<ComparisonRow[]>(() => {
    const rowDefs = [
      {
        key: 'print-time',
        label: 'Print time',
        values: archives.map(archive => formatDuration(archive.actual_time_seconds ?? archive.print_time_seconds)),
      },
      {
        key: 'weight',
        label: 'Weight',
        values: archives.map(archive => formatWeight(archive.total_filament_actual_grams ?? archive.filament_used_grams)),
      },
      {
        key: 'filament-used',
        label: 'Filament used',
        values: archives.map(
          archive =>
            [archive.filament_type, archive.filament_color].filter(Boolean).join(' • ') || '—',
        ),
      },
      {
        key: 'cost',
        label: 'Cost',
        values: archives.map(archive => (archive.cost != null ? formatCurrency(archive.cost) : '—')),
      },
      {
        key: 'status',
        label: 'Status',
        values: archives.map(archive => archive.status || '—'),
      },
      {
        key: 'date',
        label: 'Date',
        values: archives.map(archive => formatDateTime(archive.completed_at || archive.created_at)),
      },
      {
        key: 'printer',
        label: 'Printer',
        values: archives.map(
          archive => archive.printer_name || archive.sliced_for_model || (archive.printer_id ? `Printer #${archive.printer_id}` : '—'),
        ),
      },
      {
        key: 'plate',
        label: 'Plate',
        values: archives.map(archive => archive.bed_type || '—'),
      },
    ];

    return rowDefs.map(row => ({
      ...row,
      hasDifference: new Set(row.values.map(normalizeValue)).size > 1,
    }));
  }, [archives]);

  const differingRows = rows.filter(row => row.hasDifference).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Compare archives</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Side-by-side comparison for {archives.length} selected archives.</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <X size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.headerRow, { borderColor: colors.borderSubtle }]}> 
                <View style={[styles.labelColumn, styles.headerLabelColumn]}>
                  <Text style={[styles.columnTitle, { color: colors.textSecondary }]}>Field</Text>
                </View>
                {archives.map(archive => (
                  <View
                    key={archive.id}
                    style={[styles.archiveColumn, { borderColor: colors.borderSubtle }]}
                  >
                    <Image
                      source={{ uri: api.getArchiveThumbnail(archive.id) }}
                      style={[styles.thumbnail, { backgroundColor: colors.surface }]}
                    />
                    <Text style={[styles.archiveTitle, { color: colors.text }]} numberOfLines={2}>
                      {archive.print_name || archive.filename}
                    </Text>
                    <StatusBadge label={archive.status} color={statusColor(archive.status, colors)} />
                  </View>
                ))}
              </View>

              {rows.map(row => (
                <View
                  key={row.key}
                  style={[
                    styles.dataRow,
                    { borderColor: colors.borderSubtle },
                    row.hasDifference ? { backgroundColor: `${colors.warning}12` } : null,
                  ]}
                >
                  <View style={styles.labelColumn}>
                    <View style={styles.labelWrap}>
                      {row.hasDifference ? (
                        <AlertTriangle size={14} color={colors.warning} strokeWidth={2} />
                      ) : null}
                      <Text
                        style={[
                          styles.rowLabel,
                          { color: row.hasDifference ? colors.warning : colors.textSecondary },
                        ]}
                      >
                        {row.label}
                      </Text>
                    </View>
                  </View>
                  {row.values.map((value, index) => (
                    <View key={`${row.key}-${archives[index]?.id}`} style={styles.archiveColumn}>
                      <Text style={[styles.cellValue, { color: colors.text }]}>{value}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          <View
            style={[
              styles.summary,
              {
                backgroundColor: differingRows > 0 ? `${colors.warning}12` : colors.surfaceElevated,
                borderColor: differingRows > 0 ? `${colors.warning}55` : colors.border,
              },
            ]}
          >
            <Text style={[styles.summaryText, { color: colors.text }]}> 
              {differingRows > 0
                ? `${differingRows} fields differ across the selected archives.`
                : 'The selected archives match across the compared fields.'}
            </Text>
          </View>

          <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
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
    alignItems: 'flex-start',
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
    lineHeight: 20,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  labelColumn: {
    width: 128,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    justifyContent: 'center',
  },
  headerLabelColumn: {
    justifyContent: 'flex-start',
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  columnTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  archiveColumn: {
    width: 176,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  thumbnail: {
    width: '100%',
    height: 96,
    borderRadius: borderRadius.lg,
    backgroundColor: '#1f2937',
  },
  archiveTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  cellValue: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  summary: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  summaryText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
