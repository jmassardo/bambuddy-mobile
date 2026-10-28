import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import {
  PrimaryButton,
  SearchBar,
  SectionCard,
  StatusBadge,
  TextField,
} from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDateTime, formatWeight, pickString } from '@/utils/data';
import type { InventorySpool, Printer, SpoolAssignmentHistoryRecord } from '@/types/api';

type HistoryFilterTab = 'all' | 'active' | 'completed';
type SortMode = 'newest' | 'oldest' | 'spool' | 'printer';

interface AssignmentFormState {
  spoolId: string;
  printerId: string;
  amsId: string;
  trayId: string;
}

const DEFAULT_FORM: AssignmentFormState = {
  spoolId: '',
  printerId: '',
  amsId: '0',
  trayId: '0',
};

export default function SpoolAssignmentHistoryScreen() {
  useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'SpoolAssignmentHistory'>>();
  useEffect(() => {
    navigation.setOptions({ get title() { return translateNative('screen.assignmentHistory'); } });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<HistoryFilterTab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [spoolFilter, setSpoolFilter] = useState<number | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [form, setForm] = useState<AssignmentFormState>(DEFAULT_FORM);
  const [selectedHistory, setSelectedHistory] = useState<SpoolAssignmentHistoryRecord | null>(
    null,
  );
  const [pendingConfirm, setPendingConfirm] = useState<{
    type: 'unassign';
    record: SpoolAssignmentHistoryRecord;
  } | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['assignmentHistory'],
    queryFn: () => api.getAssignments(),
  });

  const historyQuery = useQuery({
    queryKey: ['assignmentHistoryList'],
    queryFn: () => api.getAssignmentHistory({ limit: 500 }),
  });

  const statsQuery = useQuery({
    queryKey: ['assignmentHistoryStats'],
    queryFn: () => api.getAssignmentHistoryStats(),
  });

  const spoolsQuery = useQuery({
    queryKey: ['spoolAssignmentSpools'],
    queryFn: () => api.getSpools(true),
  });

  const printersQuery = useQuery({
    queryKey: ['spoolAssignmentPrinters'],
    queryFn: () => api.getPrinters(),
  });

  const assignMutation = useMutation({
    mutationFn: (data: {
      spool_id: number;
      printer_id: number;
      ams_id: number;
      tray_id: number;
    }) => api.assignSpool(data.spool_id, data.printer_id, data.ams_id, data.tray_id),
    onSuccess: async () => {
      await invalidateAll();
      setShowAssignModal(false);
      setForm(DEFAULT_FORM);
      showToast(translateNative('native.2956cafb935d053d'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || translateNative('native.410ce58cbd32a366'), 'error'),
  });

  const unassignMutation = useMutation({
    mutationFn: (data: { printer_id: number; ams_id: number; tray_id: number }) =>
      api.unassignSpool(data.printer_id, data.ams_id, data.tray_id),
    onSuccess: async () => {
      await invalidateAll();
      showToast(translateNative('native.c3433976d24113dc'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || translateNative('native.4e6a92e509672538'), 'error'),
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['assignmentHistory'] }),
      queryClient.invalidateQueries({ queryKey: ['assignmentHistoryList'] }),
      queryClient.invalidateQueries({ queryKey: ['assignmentHistoryStats'] }),
      queryClient.invalidateQueries({ queryKey: ['spoolAssignmentSpools'] }),
      queryClient.invalidateQueries({ queryKey: ['spoolAssignmentPrinters'] }),
    ]);
  };

  const refreshAll = async () => {
    await Promise.all([
      assignmentsQuery.refetch(),
      historyQuery.refetch(),
      statsQuery.refetch(),
      spoolsQuery.refetch(),
      printersQuery.refetch(),
    ]);
  };

  const spools = useLocalizedMemo(
    () => (spoolsQuery.data ?? []) as unknown as InventorySpool[],
    [spoolsQuery.data],
  );

  const history = useLocalizedMemo(
    () => (historyQuery.data ?? []) as SpoolAssignmentHistoryRecord[],
    [historyQuery.data],
  );
  const stats = useLocalizedMemo(
    () => (statsQuery.data ?? {}) as {
      total_assignments: number;
      active_assignments: number;
      total_spools_tracked: number;
      total_prints_tracked: number;
    },
    [statsQuery.data],
  );
  const printers = useLocalizedMemo(
    () => (printersQuery.data ?? []) as unknown as Printer[],
    [printersQuery.data],
  );

  const activeSlotAssignments = useLocalizedMemo(() => {
    const map = new Map<string, SpoolAssignmentHistoryRecord>();
    history.forEach(record => {
      if (!record.assignment_deleted_at) {
        const key = `${record.printer_id}_${record.ams_id}_${record.tray_id}`;
        const existing = map.get(key);
        if (!existing || (record.assignment_updated_at && (!existing.assignment_updated_at || record.assignment_updated_at > existing.assignment_updated_at))) {
          map.set(key, record);
        }
      }
    });
    return Array.from(map.values());
  }, [history]);

  const filteredHistory = useLocalizedMemo(() => {
    const term = search.trim().toLowerCase();
    let result = history.filter(record => {
      if (filterTab === 'active' && record.assignment_deleted_at) return false;
      if (filterTab === 'completed' && !record.assignment_deleted_at) return false;
      if (spoolFilter && record.spool_id !== spoolFilter) return false;
      if (term) {
        const haystack = [
          pickString(record, ['spool_name']),
          pickString(record, ['printer_name']),
          pickString(record, ['print_name']),
          pickString(record, ['ams_label']),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      switch (sortMode) {
        case 'newest':
          return new Date(b.assignment_created_at).getTime() - new Date(a.assignment_created_at).getTime();
        case 'oldest':
          return new Date(a.assignment_created_at).getTime() - new Date(b.assignment_created_at).getTime();
        case 'spool':
          return (a.spool_name || '').localeCompare(b.spool_name || '');
        case 'printer':
          return (a.printer_name || '').localeCompare(b.printer_name || '');
        default:
          return 0;
      }
    });

    return result;
  }, [history, search, filterTab, sortMode, spoolFilter]);

  const availableSpools = useLocalizedMemo(() => {
    const assignedSpoolIds = new Set(activeSlotAssignments.map(a => a.spool_id));
    return spools.filter(s => !assignedSpoolIds.has(s.id));
  }, [spools, activeSlotAssignments]);

  const handleAssign = () => {
    const spoolId = Number(form.spoolId);
    const printerId = Number(form.printerId);
    if (!spoolId || !printerId) return;
    assignMutation.mutateAsync({
      spool_id: spoolId,
      printer_id: printerId,
      ams_id: Number(form.amsId) || 0,
      tray_id: Number(form.trayId) || 0,
    });
  };

  if (historyQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.408b38be57a79ca7')} />;
  }

  if (historyQuery.isError) {
    return <ErrorState message={translateNative('native.eb73813af2aefc46')} onRetry={() => void refreshAll()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredHistory}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              historyQuery.isRefetching ||
              assignmentsQuery.isRefetching ||
              statsQuery.isRefetching
            }
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder={translateNative('native.81127fb58063e688')}
            />

            <View style={styles.statsRow}>
              <StatBadge label={translateNative('common.total')} value={String(stats.total_assignments || 0)} colors={colors} />
              <StatBadge label={translateNative('native.338a8c40557b22a0')} value={String(stats.active_assignments || 0)} colors={colors} />
              <StatBadge label={translateNative('native.b48c1e090dd857f2')} value={String(stats.total_spools_tracked || 0)} colors={colors} />
              <StatBadge label={translateNative('native.d3484bee79a505c4')} value={String(stats.total_prints_tracked || 0)} colors={colors} />
            </View>

            <View style={styles.tabsRow}>
              {([
                { key: 'all', get label() { return translateNative('common.all'); } },
                { key: 'active', get label() { return translateNative('native.338a8c40557b22a0'); } },
                { key: 'completed', get label() { return translateNative('native.e8d25c3ab5a7be5d'); } },
              ] as { key: HistoryFilterTab; label: string }[]).map(tab => (
                <Pressable
                  key={tab.key}
                  onPress={() => setFilterTab(tab.key)}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: filterTab === tab.key ? colors.accentBg : colors.surfaceElevated,
                      borderColor: filterTab === tab.key ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: filterTab === tab.key ? colors.accentLight : colors.textSecondary },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sortRow}>
              <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>{translateNative('native.06ad8eaea1d4cd05')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
                {([
                  { key: 'newest', get label() { return translateNative('native.4f6a34533ed98043'); } },
                  { key: 'oldest', get label() { return translateNative('native.ee5e0d151047f55c'); } },
                  { key: 'spool', get label() { return translateNative('native.e67fa85ab3af118d'); } },
                  { key: 'printer', get label() { return translateNative('native.e64a88b19dd00970'); } },
                ] as { key: SortMode; label: string }[]).map(mode => (
                  <Pressable
                    key={mode.key}
                    onPress={() => setSortMode(mode.key)}
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: sortMode === mode.key ? colors.accent : colors.surface,
                        borderColor: sortMode === mode.key ? colors.accentLight : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortChipText,
                        { color: sortMode === mode.key ? colors.accentLight : colors.textSecondary },
                      ]}
                    >
                      {mode.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {spoolFilter ? (
              <View style={[styles.filterBar, { borderColor: colors.accent + '40', backgroundColor: colors.accentBg + '40' }]}>
                <Text style={[styles.filterLabel, { color: colors.text }]}>
                  {translateNative('native.c33e231e658e12ab')}</Text>
                <Pressable onPress={() => setSpoolFilter(null)}>
                  <Text style={[styles.clearFilter, { color: colors.accent }]}>{translateNative('native.1f62863691c7afa1')}</Text>
                </Pressable>
              </View>
            ) : null}

            {activeSlotAssignments.length > 0 ? (
              <SectionCard title={translateNative('native.6d9738ef7022627b')} subtitle={translateNative('native.1c935c15a493886b', { value0: String(activeSlotAssignments.length) })}>
                {activeSlotAssignments.slice(0, 10).map(slot => (
                  <View key={String(slot.id)} style={[styles.activeSlotRow, { borderBottomColor: colors.borderSubtle }]}>
                    <View style={styles.activeSlotText}>
                      <Text style={[styles.activeSlotTitle, { color: colors.text }]}>
                        {slot.printer_name || translateNative('native.cce5106f9222d909', { value0: String(slot.printer_id) })}
                      </Text>
                      <Text style={[styles.activeSlotMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.0ff04412da2ba859" values={{ value0: (slot.ams_id), value1: (slot.tray_id), value2: (slot.spool_name ? ` • ${slot.spool_name}` : '') }} /></Text>
                    </View>
                    <PrimaryButton
                      label={translateNative('native.62617bedf02de543')}
                      variant="secondary"
                      onPress={() => {
                        setShowAssignModal(true);
                        setForm(prev => ({
                          ...prev,
                          printerId: String(slot.printer_id),
                          amsId: String(slot.ams_id),
                          trayId: String(slot.tray_id),
                        }));
                      }}
                    />
                  </View>
                ))}
              </SectionCard>
            ) : null}

            <View style={styles.toolbar}>
              <PrimaryButton
                label={translateNative('native.d1012ee93efbd04a')}
                variant="secondary"
                onPress={() => {
                  setForm(DEFAULT_FORM);
                  setShowAssignModal(true);
                }}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <AssignmentHistoryCard
            record={item}
            spoolName={
              (() => {
                const spool = spools.find(s => s.id === item.spool_id);
                if (!spool) return null;
                return [spool.brand, spool.material, spool.color_name]
                  .filter(Boolean)
                  .join(' ') || null;
              })()
            }
            colors={colors}
            onPress={() => setSelectedHistory(item)}
            onFilterSpool={() => setSpoolFilter(item.spool_id)}
            onUnassign={() =>
              setPendingConfirm({ type: 'unassign', record: item })
            }
            isActive={!item.assignment_deleted_at}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="📋"
            title={translateNative('native.303bfbbd87a54117')}
            message={translateNative('native.8018c7ac813f4fbe')}
          />
        }
      />

      <FloatingActionButton
        icon="plus"
        label={translateNative('native.aff9b055e1df6025')}
        onPress={() => {
          setForm(DEFAULT_FORM);
          setShowAssignModal(true);
        }}
      />

      {/* Assign Modal */}
      <Modal visible={showAssignModal} animationType="slide" transparent onRequestClose={() => setShowAssignModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{translateNative('native.e05012ae768022fa')}</Text>

              <TextField
                label={translateNative('native.014dc4390592403a')}
                value={form.spoolId}
                onChangeText={value => setForm(prev => ({ ...prev, spoolId: value }))}
                placeholder={translateNative('native.ff444c0ebbdec289')}
                keyboardType="number-pad"
              />

              {availableSpools.length > 0 && (
                <SectionCard title={translateNative('native.20ead0f85e208f42')} subtitle={translateNative('native.88b998cd1fce0866')}>
                  {availableSpools.slice(0, 15).map(spool => {
                    const name = [
                      spool.brand,
                      spool.material,
                      spool.color_name,
                    ]
                      .filter(Boolean)
                      .join(' ') || `Spool #${spool.id}`;
                    return (
                      <Pressable
                        key={spool.id}
                        onPress={() => setForm(prev => ({ ...prev, spoolId: String(spool.id) }))}
                        style={[
                          styles.spoolOption,
                          {
                            backgroundColor: form.spoolId === String(spool.id) ? colors.accentBg : colors.surface,
                            borderColor: form.spoolId === String(spool.id) ? colors.accent : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.spoolOptionText, { color: colors.text }]}>{name}</Text>
                        {form.spoolId === String(spool.id) && (
                          <Text style={[styles.spoolOptionCheck, { color: colors.accent }]}>✓</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </SectionCard>
              )}

              {printers.length > 0 ? (
                <View style={styles.splitRow}>
                  <View style={styles.splitField}>
                    <TextField
                      label={translateNative('native.f0df85dad6f839e1')}
                      value={form.printerId}
                      onChangeText={value => setForm(prev => ({ ...prev, printerId: value }))}
                      placeholder={translateNative('native.24e7147ee443af3e')}
                      keyboardType="number-pad"
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {printers.map(printer => (
                        <Pressable
                          key={printer.id}
                          onPress={() => setForm(prev => ({ ...prev, printerId: String(printer.id) }))}
                          style={[
                            styles.filterChip,
                            {
                              backgroundColor: form.printerId === String(printer.id) ? colors.accentBg : colors.surfaceElevated,
                              borderColor: form.printerId === String(printer.id) ? colors.accent : colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.filterChipText, { color: form.printerId === String(printer.id) ? colors.accentLight : colors.textSecondary }]}>
                            {printer.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              ) : null}

              <View style={styles.splitRow}>
                <View style={styles.splitField}>
                  <TextField
                    label={translateNative('native.a66abd595876fb98')}
                    value={form.amsId}
                    onChangeText={value => setForm(prev => ({ ...prev, amsId: value }))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.splitField}>
                  <TextField
                    label={translateNative('native.101b985f7b5571ae')}
                    value={form.trayId}
                    onChangeText={value => setForm(prev => ({ ...prev, trayId: value }))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View style={styles.actions}>
                <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => setShowAssignModal(false)} />
                <PrimaryButton
                  label={assignMutation.isPending ? translateNative('native.a02e16d8e3452166') : translateNative('native.aff9b055e1df6025')}
                  onPress={handleAssign}
                  disabled={!form.spoolId || !form.printerId || assignMutation.isPending}
                  loading={assignMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* History Detail Modal */}
      <Modal visible={selectedHistory !== null} animationType="slide" transparent onRequestClose={() => setSelectedHistory(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {selectedHistory ? (
                <>
                  <View style={styles.detailHeader}>
                    <View style={styles.detailHeaderText}>
                      <Text style={[styles.modalTitle, { color: colors.text }]}>
                        {selectedHistory.spool_name || translateNative('native.695cc238a31cecd5', { value0: String(selectedHistory.spool_id) })}
                      </Text>
                      <StatusBadge
                        label={selectedHistory.assignment_deleted_at ? translateNative('native.e8d25c3ab5a7be5d') : translateNative('native.338a8c40557b22a0')}
                        color={selectedHistory.assignment_deleted_at ? colors.textTertiary : colors.success}
                      />
                    </View>
                    <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={() => setSelectedHistory(null)} />
                  </View>

                  <SectionCard title={translateNative('native.974abb01c0099c59')} subtitle={translateNative('native.26cc379ce1bf020c')}>
                    <Text style={[styles.detailText, { color: colors.text }]}><NativeTranslation id="native.d9a7bdd2824cf968" values={{ value0: (selectedHistory.printer_name || `Printer #${selectedHistory.printer_id}` || 'N/A') }} /></Text>
                    <Text style={[styles.detailText, { color: colors.text }]}><NativeTranslation id="native.9717b8124b06753a" values={{ value0: (selectedHistory.ams_id), value1: (selectedHistory.tray_id), value2: (selectedHistory.ams_label ? ` (${selectedHistory.ams_label})` : '') }} /></Text>
                    <Text style={[styles.detailText, { color: colors.text }]}><NativeTranslation id="native.75017285974a1956" values={{ value0: (formatDateTime(selectedHistory.assignment_created_at)) }} /></Text>
                    {selectedHistory.assignment_updated_at ? (
                      <Text style={[styles.detailText, { color: colors.text }]}><NativeTranslation id="native.d14e8886ef25f592" values={{ value0: (formatDateTime(selectedHistory.assignment_updated_at)) }} /></Text>
                    ) : null}
                    {selectedHistory.assignment_deleted_at ? (
                      <Text style={[styles.detailText, { color: colors.textSecondary }]}><NativeTranslation id="native.72b71fe8ed6e4a66" values={{ value0: (formatDateTime(selectedHistory.assignment_deleted_at)) }} /></Text>
                    ) : null}
                  </SectionCard>

                  {selectedHistory.print_name ? (
                    <SectionCard title={translateNative('native.cacebdea46717227')} subtitle={translateNative('native.5938e338b63261da')}>
                      <Text style={[styles.detailText, { color: colors.text }]}><NativeTranslation id="native.430958d5f25bfead" values={{ value0: (selectedHistory.print_name) }} /></Text>
                      {selectedHistory.print_id ? (
                        <Text style={[styles.detailText, { color: colors.text }]}><NativeTranslation id="native.095ab479aee634b9" values={{ value0: (selectedHistory.print_id) }} /></Text>
                      ) : null}
                      {selectedHistory.status ? (
                        <Text style={[styles.detailText, { color: colors.text }]}><NativeTranslation id="native.7072d41b013a7b0f" values={{ value0: (selectedHistory.status) }} /></Text>
                      ) : null}
                      {selectedHistory.filament_used_grams != null ? (
                        <Text style={[styles.detailText, { color: colors.text }]}><NativeTranslation id="native.03f216af227d91a0" values={{ value0: (formatWeight(selectedHistory.filament_used_grams)) }} /></Text>
                      ) : null}
                    </SectionCard>
                  ) : null}

                  <View style={styles.actions}>
                    {!selectedHistory.assignment_deleted_at ? (
                      <PrimaryButton
                        label={translateNative('native.1cc819b2aa2fbd6a')}
                        variant="danger"
                        onPress={() => {
                          setPendingConfirm({ type: 'unassign', record: selectedHistory });
                          setSelectedHistory(null);
                        }}
                      />
                    ) : null}
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirm Unassign Modal */}
      <Modal visible={pendingConfirm !== null} animationType="slide" transparent onRequestClose={() => setPendingConfirm(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{translateNative('native.e58d2ec23dc75890')}</Text>
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {translateNative('native.04e3d03aaa33b3ef')}</Text>
              {pendingConfirm ? (
                <Text style={[styles.detailText, { color: colors.textSecondary }]}><NativeTranslation id="native.910c9a5b0928183d" values={{ value0: (pendingConfirm.record.spool_name || pendingConfirm.record.spool_id), value1: (pendingConfirm.record.printer_name || pendingConfirm.record.printer_id), value2: (pendingConfirm.record.ams_id), value3: (pendingConfirm.record.tray_id) }} /></Text>
              ) : null}
              <View style={styles.actions}>
                <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => setPendingConfirm(null)} />
                <PrimaryButton
                  label={unassignMutation.isPending ? translateNative('native.38573dd4274479a3') : translateNative('native.1cc819b2aa2fbd6a')}
                  variant="danger"
                  onPress={() => {
                    if (!pendingConfirm) return;
                    unassignMutation.mutateAsync({
                      printer_id: pendingConfirm.record.printer_id!,
                      ams_id: pendingConfirm.record.ams_id,
                      tray_id: pendingConfirm.record.tray_id,
                    });
                    setPendingConfirm(null);
                  }}
                  disabled={unassignMutation.isPending}
                  loading={unassignMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatBadge({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  useNativeLocale();
  return (
    <View style={[styles.statBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function AssignmentHistoryCard({
  record,
  spoolName,
  colors,
  onPress,
  onFilterSpool,
  onUnassign,
  isActive,
}: {
  record: SpoolAssignmentHistoryRecord;
  spoolName: string | null;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
  onFilterSpool: () => void;
  onUnassign: () => void;
  isActive: boolean;
}) {
  useNativeLocale();
  const displaySpool = spoolName || `Spool #${record.spool_id}`;
  const displayName = record.print_name || displaySpool || `Assignment #${record.id}`;

  return (
    <Pressable onPress={onPress} style={[styles.historyCard, { backgroundColor: colors.card, borderColor: isActive ? colors.success + '40' : colors.cardBorder }]}>
      <View style={styles.historyCardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.historyCardTitle, { color: colors.text }]} numberOfLines={2}>{displayName}</Text>
          <Text style={[styles.historyCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {displaySpool}
          </Text>
          <Text style={[styles.historyCardMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.7525e72ab587b786" values={{ value0: (record.printer_name || `Printer #${record.printer_id}`), value1: (record.ams_id), value2: (record.tray_id) }} /></Text>
        </View>
        <StatusBadge label={isActive ? translateNative('native.0882f126ac69b221') : translateNative('native.18a497944ff09bc7')} color={isActive ? colors.success : colors.textTertiary} />
      </View>
      <View style={styles.historyCardFooter}>
        <Text style={[styles.historyCardTime, { color: colors.textTertiary }]}>
          {formatDateTime(record.assignment_created_at)}
        </Text>
        {record.filament_used_grams != null ? (
          <Text style={[styles.historyCardTime, { color: colors.textSecondary }]}><NativeTranslation id="native.dfeecbce757ef8f8" values={{ value0: (formatWeight(record.filament_used_grams)) }} /></Text>
        ) : null}
      </View>
      <View style={styles.historyCardActions}>
        <PrimaryButton label={translateNative('native.cc7a9a68235c2367')} variant="secondary" onPress={onFilterSpool} />
        {!isActive ? (
          <PrimaryButton label={translateNative('native.19c4ccf07e5b405d')} variant="secondary" onPress={onUnassign} />
        ) : null}
      </View>
    </Pressable>
  );
}

function FloatingActionButton({ icon: _icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  useNativeLocale();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.fab, { backgroundColor: colors.accent, shadowColor: colors.accent }]}>
      <Text style={[styles.fabLabel, { color: colors.accentLight }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: 96,
  },
  headerArea: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statBadge: {
    flex: 1,
    minWidth: 70,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tab: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sortLabel: {
    fontSize: fontSize.sm,
  },
  sortScroll: {
    gap: spacing.xs,
  },
  sortChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sortChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  filterLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  clearFilter: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  historyCardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  historyCardMeta: {
    fontSize: fontSize.sm,
  },
  historyCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  historyCardTime: {
    fontSize: fontSize.xs,
  },
  historyCardActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  activeSlotRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeSlotText: {
    flex: 1,
    gap: 2,
  },
  activeSlotTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  activeSlotMeta: {
    fontSize: fontSize.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    maxHeight: '92%',
  },
  modalContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  splitRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  splitField: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  detailHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  detailText: {
    fontSize: fontSize.sm,
  },
  spoolOption: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  spoolOptionText: {
    fontSize: fontSize.sm,
  },
  spoolOptionCheck: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fabLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
});
