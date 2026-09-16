import React, { useMemo } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertCircle,
  ArrowUpRight,
  Filter,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Chip, PrimaryButton, SectionCard, StatCard } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type { FailureAnalysis, Printer } from '@/types/api';
import { formatDateTime, formatPercent } from '@/utils/data';

type FailureGroup = {
  reason: string;
  count: number;
  archives: Array<{
    id: number;
    print_name: string;
    filament_type: string | null;
    printer_id: number | null;
    printer_name?: string;
    created_at: string | null;
  }>;
};

function groupFailuresByReason(
  recentFailures: FailureAnalysis['recent_failures'],
  printers: Printer[] = [],
): FailureGroup[] {
  const reasonMap = new Map<string, FailureGroup>();

  for (const failure of recentFailures) {
    const reason = failure.failure_reason || 'Unknown error';
    const existing = reasonMap.get(reason);

    if (existing) {
      existing.count += 1;
      existing.archives.push({
        id: failure.id,
        print_name: failure.print_name,
        filament_type: failure.filament_type,
        printer_id: failure.printer_id,
        created_at: failure.created_at,
      });
    } else {
      const printer = printers.find(p => p.id === failure.printer_id);
      reasonMap.set(reason, {
        reason,
        count: 1,
        archives: [
          {
            id: failure.id,
            print_name: failure.print_name,
            filament_type: failure.filament_type,
            printer_id: failure.printer_id,
            printer_name: printer?.name,
            created_at: failure.created_at,
          },
        ],
      });
    }
  }

  return Array.from(reasonMap.entries())
    .map(([, group]) => ({ ...group }))
    .sort((a, b) => b.count - a.count);
}

function getFailureSeverityColor(rate: number, colors: { error: string; warning: string; success: string }): string {
  if (rate >= 0.3) return colors.error;
  if (rate >= 0.15) return colors.warning;
  return colors.success;
}

function TrendIndicator({ trend }: { trend: FailureAnalysis['trend'] }) {
  const { colors } = useTheme();

  if (trend.length < 2) {
    return (
      <View style={[styles.trendBadge, { backgroundColor: colors.surfaceElevated }]}>
        <Text style={[styles.trendBadgeText, { color: colors.textSecondary }]}>Insufficient data</Text>
      </View>
    );
  }

  const latest = trend[trend.length - 1];
  const previous = trend[trend.length - 2];

  if (!latest || !previous) {
    return null;
  }

  const diff = latest.failure_rate - previous.failure_rate;

  if (Math.abs(diff) < 0.01) {
    return (
      <View style={[styles.trendBadge, { backgroundColor: colors.surfaceElevated }]}>
        <Text style={[styles.trendBadgeText, { color: colors.textSecondary }]}>Stable</Text>
      </View>
    );
  }

  const isWorse = diff > 0;

  return (
    <View
      style={[
        styles.trendBadge,
        {
          backgroundColor: isWorse ? `${colors.error}15` : `${colors.success}15`,
        },
      ]}
    >
      {isWorse ? (
        <TrendingUp size={12} color={colors.error} strokeWidth={2.5} />
      ) : (
        <TrendingDown size={12} color={colors.success} strokeWidth={2.5} />
      )}
      <Text
        style={[
          styles.trendBadgeText,
          { color: isWorse ? colors.error : colors.success },
        ]}
      >
        {diff > 0 ? '+' : ''}{(diff * 100).toFixed(1)}%
      </Text>
    </View>
  );
}

function FailureDetailModal({
  visible,
  failure,
  onClose,
}: {
  visible: boolean;
  failure: FailureGroup | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  if (!failure) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
      >
        <View
          style={[
            styles.modalContent,
            { backgroundColor: colors.modalBg, borderColor: colors.border },
          ]}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Failure details
              </Text>
              <Text
                style={[styles.modalSubtitle, { color: colors.textSecondary }]}
              >
                {failure.reason}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          <View
            style={[
              styles.detailStats,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <Text
              style={[styles.detailStatLabel, { color: colors.textSecondary }]}
            >
              Occurrences
            </Text>
            <Text style={[styles.detailStatValue, { color: colors.error }]}>
              {failure.count}
            </Text>
          </View>

          <ScrollView style={styles.archiveList} showsVerticalScrollIndicator={false}>
            <Text
              style={[styles.archiveListTitle, { color: colors.text }]}
            >
              Occurrences ({failure.archives.length})
            </Text>
            {failure.archives.map((archive) => (
              <View
                key={archive.id}
                style={[
                  styles.archiveRow,
                  { borderBottomColor: colors.borderSubtle },
                ]}
              >
                <View style={styles.archiveRowContent}>
                  <Text
                    style={[styles.archiveRowName, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {archive.print_name || 'Unknown print'}
                  </Text>
                  {archive.filament_type && (
                    <Text
                      style={[styles.archiveRowMeta, { color: colors.textSecondary }]}
                    >
                      {archive.filament_type}
                    </Text>
                  )}
                  {archive.printer_name && (
                    <Text
                      style={[styles.archiveRowMeta, { color: colors.textSecondary }]}
                    >
                      Printer: {archive.printer_name}
                    </Text>
                  )}
                  {archive.created_at && (
                    <Text
                      style={[styles.archiveRowMeta, { color: colors.textSecondary }]}
                    >
                      {formatDateTime(archive.created_at)}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.modalFooter}>
            <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function FailureAnalysisScreen() {
  const { colors } = useTheme();

  const [periodDays, setPeriodDays] = React.useState(30);
  const [selectedReason, setSelectedReason] = React.useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = React.useState(false);

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
  });

  const failureQuery = useQuery({
    queryKey: ['failureAnalysis', periodDays],
    queryFn: () => api.getFailureAnalysis({ periodDays }),
    enabled: true,
  });

  const printers = useMemo(() => {
    if (!Array.isArray(printersQuery.data)) return [];
    return printersQuery.data as Printer[];
  }, [printersQuery.data]);

  const failureData = useMemo(() => {
    return failureQuery.data as FailureAnalysis | null;
  }, [failureQuery.data]);

  const groupedFailures = useMemo(() => {
    if (!failureData?.recent_failures) return [];
    return groupFailuresByReason(failureData.recent_failures, printers);
  }, [failureData, printers]);

  const selectedFailureGroup = useMemo(() => {
    if (!selectedReason) return null;
    return groupedFailures.find(g => g.reason === selectedReason) || null;
  }, [selectedReason, groupedFailures]);

  const failureByPrinterMap = useMemo(() => {
    if (!failureData?.failures_by_printer) return [];
    return Object.entries(failureData.failures_by_printer)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [failureData]);

  const failureByFilamentMap = useMemo(() => {
    if (!failureData?.failures_by_filament) return [];
    return Object.entries(failureData.failures_by_filament)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [failureData]);

  const totalPrints = failureData?.total_prints ?? 0;
  const failedPrints = failureData?.failed_prints ?? 0;
  const failureRate = failureData?.failure_rate ?? 0;

  const refreshAll = async () => {
    await Promise.all([failureQuery.refetch(), printersQuery.refetch()]);
  };

  if (failureQuery.isLoading || printersQuery.isLoading) {
    return <LoadingScreen message="Loading failure analysis…" />;
  }

  if (failureQuery.isError) {
    return (
      <ErrorState
        message="Unable to load failure analysis."
        onRetry={() => {
          refreshAll();
        }}
      />
    );
  }

  const periodOptions = [
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
    { label: '180 days', value: 180 },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={groupedFailures}
        keyExtractor={(item) => item.reason}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setSelectedReason(item.reason);
              setShowGroupModal(true);
            }}
            style={({ pressed }) => [
              styles.failureCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.cardBorder,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.failureCardHeader}>
              <View style={styles.failureCardLeft}>
                <View
                  style={[
                    styles.failureIcon,
                    { backgroundColor: `${colors.error}15` },
                  ]}
                >
                  <AlertCircle size={16} color={colors.error} strokeWidth={2} />
                </View>
                <View style={styles.failureCardText}>
                  <Text
                    style={[styles.failureCardTitle, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {item.reason}
                  </Text>
                  <Text
                    style={[styles.failureCardCount, { color: colors.textSecondary }]}
                  >
                    {item.count} {item.count === 1 ? 'occurrence' : 'occurrences'}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.failureArrow,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <ArrowUpRight size={16} color={colors.textTertiary} strokeWidth={2} />
              </View>
            </View>
          </Pressable>
        )}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={failureQuery.isRefetching || printersQuery.isRefetching}
            onRefresh={() => refreshAll()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          failureData ? (
            <View style={styles.headerStack}>
              <SectionCard
                title="Failure overview"
                subtitle={`Analysis of print failures over the past ${periodDays} days`}
              >
                <View style={styles.overviewGrid}>
                  <StatCard
                    label="Total prints"
                    value={String(totalPrints)}
                  />
                  <StatCard
                    label="Failed prints"
                    value={String(failedPrints)}
                  />
                  <View
                    style={[
                      styles.statWrapper,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    ]}
                  >
                    <Text
                      style={[styles.statValue, { color: getFailureSeverityColor(failureRate, colors) }]}
                      allowFontScaling={false}
                    >
                      {formatPercent(failureRate)}
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: colors.textSecondary }]}
                      allowFontScaling={false}
                    >
                      Failure rate
                    </Text>
                  </View>
                </View>

                <View style={styles.periodSelector}>
                  <Filter size={14} color={colors.textTertiary} strokeWidth={2} />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.periodOptions}
                  >
                    {periodOptions.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={periodDays === option.value}
                        onPress={() => setPeriodDays(option.value)}
                      />
                    ))}
                  </ScrollView>
                </View>

                <TrendIndicator trend={failureData.trend ?? []} />

                {failureByPrinterMap.length > 0 && (
                  <View style={styles.breakdownSection}>
                    <Text
                      style={[styles.breakdownTitle, { color: colors.text }]}
                    >
                      Failures by printer
                    </Text>
                    {failureByPrinterMap.map((printer) => {
                      const percentage =
                        failedPrints > 0
                          ? (printer.count / failedPrints) * 100
                          : 0;
                      return (
                        <View key={printer.name} style={styles.breakdownRow}>
                          <View style={styles.breakdownInfo}>
                            <Text
                              style={[styles.breakdownName, { color: colors.text }]}
                            >
                              {printer.name}
                            </Text>
                            <Text
                              style={[styles.breakdownCount, { color: colors.textSecondary }]}
                            >
                              {printer.count} failures
                            </Text>
                          </View>
                          <View style={styles.breakdownBar}>
                            <View
                              style={[
                                styles.breakdownBarFill,
                                {
                                  width: `${Math.min(percentage, 100)}%`,
                                  backgroundColor: colors.error,
                                },
                              ]}
                            />
                          </View>
                          <Text
                            style={[styles.breakdownPercent, { color: colors.textSecondary }]}
                          >
                            {percentage.toFixed(0)}%
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {failureByFilamentMap.length > 0 && (
                  <View style={styles.breakdownSection}>
                    <Text
                      style={[styles.breakdownTitle, { color: colors.text }]}
                    >
                      Failures by filament
                    </Text>
                    {failureByFilamentMap.map((filament) => {
                      const percentage =
                        failedPrints > 0
                          ? (filament.count / failedPrints) * 100
                          : 0;
                      return (
                        <View key={filament.name} style={styles.breakdownRow}>
                          <View style={styles.breakdownInfo}>
                            <Text
                              style={[styles.breakdownName, { color: colors.text }]}
                            >
                              {filament.name}
                            </Text>
                            <Text
                              style={[styles.breakdownCount, { color: colors.textSecondary }]}
                            >
                              {filament.count} failures
                            </Text>
                          </View>
                          <View style={styles.breakdownBar}>
                            <View
                              style={[
                                styles.breakdownBarFill,
                                {
                                  width: `${Math.min(percentage, 100)}%`,
                                  backgroundColor: colors.warning,
                                },
                              ]}
                            />
                          </View>
                          <Text
                            style={[styles.breakdownPercent, { color: colors.textSecondary }]}
                          >
                            {percentage.toFixed(0)}%
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {failureData.failures_by_reason &&
                  Object.keys(failureData.failures_by_reason).length > 0 && (
                    <View style={styles.breakdownSection}>
                      <Text
                        style={[styles.breakdownTitle, { color: colors.text }]}
                      >
                        Top error patterns
                      </Text>
                      {Object.entries(failureData.failures_by_reason)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([reason, count]) => (
                          <View key={reason} style={styles.reasonRow}>
                            <Text
                              style={[styles.reasonText, { color: colors.text }]}
                              numberOfLines={2}
                            >
                              {reason}
                            </Text>
                            <View
                              style={[
                                styles.reasonBadge,
                                { backgroundColor: `${colors.error}15` },
                              ]}
                            >
                              <Text
                                style={[styles.reasonCount, { color: colors.error }]}
                              >
                                {count}
                              </Text>
                            </View>
                          </View>
                        ))}
                    </View>
                  )}
              </SectionCard>
            </View>
          ) : (
            <View style={styles.headerStack}>
              <SectionCard
                title="Failure overview"
                subtitle="No failure data available for the selected period"
              >
                <View style={styles.overviewGrid}>
                  <StatCard label="Total prints" value="0" />
                  <StatCard label="Failed prints" value="0" />
                  <View
                    style={[
                      styles.statWrapper,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    ]}
                  >
                    <Text
                      style={[styles.statValue, { color: colors.textSecondary }]}
                      allowFontScaling={false}
                    >
                      0%
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: colors.textSecondary }]}
                      allowFontScaling={false}
                    >
                      Failure rate
                    </Text>
                  </View>
                </View>
              </SectionCard>
            </View>
          )
        }
        ListEmptyComponent={
          failureData && groupedFailures.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyIcon, { color: colors.success }]}>✓</Text>
              <Text
                style={[styles.emptyTitle, { color: colors.text }]}
              >
                No failures reported
              </Text>
              <Text
                style={[styles.emptySubtitle, { color: colors.textSecondary }]}
              >
                All prints completed successfully over the past {periodDays} days.
              </Text>
            </View>
          ) : null
        }
      />

      <FailureDetailModal
        visible={showGroupModal}
        failure={selectedFailureGroup}
        onClose={() => {
          setShowGroupModal(false);
          setSelectedReason(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  headerStack: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statWrapper: {
    flex: 1,
    minWidth: 70,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    fontSize: fontSize.xs,
  },
  periodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  periodOptions: {
    gap: spacing.xs,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  trendBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  breakdownSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  breakdownTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  breakdownRow: {
    gap: spacing.xs,
  },
  breakdownInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  breakdownCount: {
    fontSize: fontSize.xs,
  },
  breakdownBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A2D34',
    overflow: 'hidden',
    flex: 1,
  },
  breakdownBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  breakdownPercent: {
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
  failureCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  failureCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  failureCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  failureIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failureCardText: {
    flex: 1,
    gap: 2,
  },
  failureCardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  failureCardCount: {
    fontSize: fontSize.sm,
  },
  failureArrow: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reasonText: {
    fontSize: fontSize.sm,
    flex: 1,
    fontWeight: fontWeight.medium,
  },
  reasonBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  reasonCount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  emptySubtitle: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: spacing['4xl'],
  },
  modalContent: {
    borderWidth: 1,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  modalHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
  },
  detailStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  detailStatLabel: {
    fontSize: fontSize.sm,
  },
  detailStatValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  archiveList: {
    maxHeight: 360,
  },
  archiveListTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  archiveRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  archiveRowContent: {
    gap: 2,
  },
  archiveRowName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  archiveRowMeta: {
    fontSize: fontSize.sm,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
