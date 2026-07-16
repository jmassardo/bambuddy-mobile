import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DocumentPicker, { isCancel } from 'react-native-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { InlineTabBar, PrimaryButton, ProgressBar, SearchBar, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { FloatingActionButton } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDateTime, formatWeight, pickArray, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { shareBlob } from '@/utils/share';

type ArchiveFilter = 'active' | 'archived';
type ViewMode = 'cards' | 'forecast';

interface SpoolFormState {
  brand: string;
  material: string;
  subtype: string;
  colorName: string;
  rgba: string;
  labelWeight: string;
  coreWeight: string;
  weightUsed: string;
  costPerKg: string;
  category: string;
  storageLocation: string;
  note: string;
  tagUid: string;
  trayUuid: string;
}

const DEFAULT_FORM: SpoolFormState = {
  brand: '',
  material: 'PLA',
  subtype: '',
  colorName: '',
  rgba: '',
  labelWeight: '1000',
  coreWeight: '250',
  weightUsed: '0',
  costPerKg: '',
  category: '',
  storageLocation: '',
  note: '',
  tagUid: '',
  trayUuid: '',
};

export default function InventoryScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Inventory' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [materialFilter, setMaterialFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'tagged'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingSpool, setEditingSpool] = useState<ApiRecord | null>(null);
  const [form, setForm] = useState<SpoolFormState>(DEFAULT_FORM);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkLocation, setBulkLocation] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [csvPreview, setCsvPreview] = useState<ApiRecord | null>(null);
  const [csvFile, setCsvFile] = useState<{ uri: string; name: string; type: string } | null>(null);

  const spoolsQuery = useQuery({
    queryKey: ['inventorySpools'],
    queryFn: () => api.getSpools(true),
  });
  const assignmentsQuery = useQuery({
    queryKey: ['inventoryAssignments'],
    queryFn: () => api.getAssignments(),
  });
  const locationsQuery = useQuery({
    queryKey: ['inventoryLocations'],
    queryFn: () => api.getLocations(),
  });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const refreshAll = async () => {
    await Promise.all([
      spoolsQuery.refetch(),
      assignmentsQuery.refetch(),
      locationsQuery.refetch(),
      settingsQuery.refetch(),
    ]);
  };

  const closeForm = () => {
    setShowFormModal(false);
    setEditingSpool(null);
    setForm(DEFAULT_FORM);
  };

  const invalidateInventory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inventorySpools'] }),
      queryClient.invalidateQueries({ queryKey: ['inventoryAssignments'] }),
      queryClient.invalidateQueries({ queryKey: ['inventoryLocations'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createSpool({
        brand: form.brand.trim() || null,
        material: form.material.trim() || 'PLA',
        subtype: form.subtype.trim() || null,
        color_name: form.colorName.trim() || null,
        rgba: form.rgba.trim() || null,
        label_weight: Number(form.labelWeight) || 1000,
        core_weight: Number(form.coreWeight) || 250,
        weight_used: Number(form.weightUsed) || 0,
        cost_per_kg: form.costPerKg.trim() ? Number(form.costPerKg) : null,
        category: form.category.trim() || null,
        storage_location: form.storageLocation.trim() || null,
        note: form.note.trim() || null,
        tag_uid: form.tagUid.trim() || null,
        tray_uuid: form.trayUuid.trim() || null,
      }),
    onSuccess: async () => {
      await invalidateInventory();
      closeForm();
      showToast('Spool added.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to add spool.', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateSpool(pickNumber(editingSpool, ['id']), {
        brand: form.brand.trim() || null,
        material: form.material.trim() || 'PLA',
        subtype: form.subtype.trim() || null,
        color_name: form.colorName.trim() || null,
        rgba: form.rgba.trim() || null,
        label_weight: Number(form.labelWeight) || 1000,
        core_weight: Number(form.coreWeight) || 250,
        weight_used: Number(form.weightUsed) || 0,
        cost_per_kg: form.costPerKg.trim() ? Number(form.costPerKg) : null,
        category: form.category.trim() || null,
        storage_location: form.storageLocation.trim() || null,
        note: form.note.trim() || null,
        tag_uid: form.tagUid.trim() || null,
        tray_uuid: form.trayUuid.trim() || null,
      }),
    onSuccess: async () => {
      await invalidateInventory();
      closeForm();
      showToast('Spool updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update spool.', 'error'),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: () =>
      api.bulkUpdateSpools(selectedIds, {
        brand: bulkBrand.trim() || undefined,
        storage_location: bulkLocation.trim() || undefined,
        category: bulkCategory.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidateInventory();
      setShowBulkEdit(false);
      setSelectedIds([]);
      setBulkBrand('');
      setBulkLocation('');
      setBulkCategory('');
      showToast('Selected spools updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update selected spools.', 'error'),
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: (mode: 'archive' | 'restore' | 'delete') => {
      if (mode === 'archive') return api.bulkArchiveSpools(selectedIds);
      if (mode === 'restore') return api.bulkRestoreSpools(selectedIds);
      return api.bulkDeleteSpools(selectedIds);
    },
    onSuccess: async () => {
      await invalidateInventory();
      setSelectedIds([]);
      showToast('Bulk action complete.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Bulk action failed.', 'error'),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const blob = await api.exportSpoolsCsv();
      await shareBlob(blob, 'bambuddy-inventory.csv');
    },
    onSuccess: () => showToast('Inventory CSV ready to share.', 'success'),
    onError: (error: Error) => showToast(error.message || 'Unable to export CSV.', 'error'),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile) throw new Error('Missing CSV file.');
      return api.importSpoolsCsv(csvFile);
    },
    onSuccess: async data => {
      await invalidateInventory();
      setCsvPreview(null);
      setCsvFile(null);
      showToast(`Imported ${pickNumber(data, ['created'], 0)} spools.`, 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to import CSV.', 'error'),
  });

  const spools = useMemo(() => ((spoolsQuery.data ?? []) as ApiRecord[]), [spoolsQuery.data]);
  const assignments = useMemo(() => ((assignmentsQuery.data ?? []) as ApiRecord[]), [assignmentsQuery.data]);
  const materials = useMemo(() => ['All', ...new Set(spools.map(spool => pickString(spool, ['material'], 'Unknown')).filter(Boolean))], [spools]);
  const brands = useMemo(() => ['All', ...new Set(spools.map(spool => pickString(spool, ['brand'], 'Unknown')).filter(Boolean))], [spools]);
  const lowStockThreshold = pickNumber(settingsQuery.data, ['low_stock_threshold'], 20);
  const leadTimeDays = pickNumber(settingsQuery.data, ['forecast_global_lead_time_days'], 14);

  const assignmentMap = useMemo(() => {
    const map = new Map<number, string>();
    assignments.forEach(assignment => {
      map.set(
        pickNumber(assignment, ['spool_id']),
        `${pickString(assignment, ['printer_name'], 'Printer')} • AMS ${pickNumber(assignment, ['ams_id'], 0)} Slot ${pickNumber(assignment, ['tray_id'], 0)}`,
      );
    });
    return map;
  }, [assignments]);

  const filteredSpools = useMemo(() => {
    const term = search.trim().toLowerCase();
    return spools.filter(spool => {
      const archived = !!pickString(spool, ['archived_at']);
      if (archiveFilter === 'active' && archived) return false;
      if (archiveFilter === 'archived' && !archived) return false;
      if (materialFilter !== 'All' && pickString(spool, ['material'], 'Unknown') !== materialFilter) return false;
      if (brandFilter !== 'All' && pickString(spool, ['brand'], 'Unknown') !== brandFilter) return false;
      const remaining = Math.max(0, pickNumber(spool, ['label_weight'], 0) - pickNumber(spool, ['weight_used'], 0));
      const remainingPct = pickNumber(spool, ['label_weight'], 0) > 0 ? (remaining / pickNumber(spool, ['label_weight'], 1)) * 100 : 0;
      if (stockFilter === 'low' && remainingPct > lowStockThreshold) return false;
      if (stockFilter === 'tagged' && !pickString(spool, ['tag_uid', 'tray_uuid'])) return false;
      if (!term) return true;
      return [
        pickString(spool, ['brand']),
        pickString(spool, ['material']),
        pickString(spool, ['subtype']),
        pickString(spool, ['color_name']),
        pickString(spool, ['category']),
        pickString(spool, ['storage_location']),
        assignmentMap.get(pickNumber(spool, ['id'])) ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [archiveFilter, assignmentMap, brandFilter, lowStockThreshold, materialFilter, search, spools, stockFilter]);

  const forecastRows = useMemo(() => {
    const map = new Map<string, { material: string; grams: number; lowStock: number; spools: number }>();
    filteredSpools.forEach(spool => {
      const material = pickString(spool, ['material'], 'Unknown');
      const remaining = Math.max(0, pickNumber(spool, ['label_weight'], 0) - pickNumber(spool, ['weight_used'], 0));
      const remainingPct = pickNumber(spool, ['label_weight'], 0) > 0 ? (remaining / pickNumber(spool, ['label_weight'], 1)) * 100 : 0;
      const current = map.get(material) ?? { material, grams: 0, lowStock: 0, spools: 0 };
      current.grams += remaining;
      current.spools += 1;
      if (remainingPct <= lowStockThreshold) current.lowStock += 1;
      map.set(material, current);
    });
    return Array.from(map.values()).sort((a, b) => b.grams - a.grams);
  }, [filteredSpools, lowStockThreshold]);

  const openEdit = (spool: ApiRecord) => {
    setEditingSpool(spool);
    setForm({
      brand: pickString(spool, ['brand']),
      material: pickString(spool, ['material'], 'PLA'),
      subtype: pickString(spool, ['subtype']),
      colorName: pickString(spool, ['color_name']),
      rgba: pickString(spool, ['rgba']),
      labelWeight: pickString(spool, ['label_weight']),
      coreWeight: pickString(spool, ['core_weight']),
      weightUsed: pickString(spool, ['weight_used']),
      costPerKg: pickString(spool, ['cost_per_kg']),
      category: pickString(spool, ['category']),
      storageLocation: pickString(spool, ['storage_location']),
      note: pickString(spool, ['note']),
      tagUid: pickString(spool, ['tag_uid']),
      trayUuid: pickString(spool, ['tray_uuid']),
    });
    setShowFormModal(true);
  };

  const pickCsvFile = async () => {
    try {
      const asset = await DocumentPicker.pickSingle({ type: [DocumentPicker.types.allFiles] });
      const file = {
        uri: asset.fileCopyUri ?? asset.uri,
        name: asset.name ?? 'inventory.csv',
        type: asset.type ?? 'text/csv',
      };
      setCsvFile(file);
      const preview = await api.importSpoolsCsvPreview(file);
      setCsvPreview(preview as ApiRecord);
    } catch (error) {
      if (isCancel(error)) return;
      showToast(error instanceof Error ? error.message : 'Unable to read the CSV file.', 'error');
    }
  };

  if (spoolsQuery.isLoading) {
    return <LoadingScreen message="Loading inventory…" />;
  }

  if (spoolsQuery.isError) {
    return <ErrorState message="Unable to load inventory." onRetry={() => void refreshAll()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={viewMode === 'cards' ? filteredSpools : []}
        keyExtractor={item => pickString(item, ['id'])}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          <RefreshControl
            refreshing={spoolsQuery.isRefetching || assignmentsQuery.isRefetching}
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search spools, brands, colors, tags, or locations" />
            <InlineTabBar
              value={archiveFilter}
              tabs={[
                { key: 'active', label: 'Active' },
                { key: 'archived', label: 'Archived' },
              ]}
              onChange={value => setArchiveFilter(value as ArchiveFilter)}
            />
            <InlineTabBar
              value={viewMode}
              tabs={[
                { key: 'cards', label: 'Cards' },
                { key: 'forecast', label: 'Forecast' },
              ]}
              onChange={value => setViewMode(value as ViewMode)}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {materials.map(item => (
                <FilterChip key={item} selected={materialFilter === item} label={item} onPress={() => setMaterialFilter(item)} colors={colors} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {brands.map(item => (
                <FilterChip key={item} selected={brandFilter === item} label={item} onPress={() => setBrandFilter(item)} colors={colors} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {[
                { key: 'all', label: 'All stock' },
                { key: 'low', label: 'Low stock' },
                { key: 'tagged', label: 'Tagged' },
              ].map(item => (
                <FilterChip key={item.key} selected={stockFilter === item.key} label={item.label} onPress={() => setStockFilter(item.key as 'all' | 'low' | 'tagged')} colors={colors} />
              ))}
            </ScrollView>

            <View style={styles.toolbar}>
              <PrimaryButton label="Import CSV" variant="secondary" onPress={() => void pickCsvFile()} />
              <PrimaryButton label={exportMutation.isPending ? 'Exporting…' : 'Export CSV'} variant="secondary" onPress={() => void exportMutation.mutateAsync()} loading={exportMutation.isPending} />
              {selectedIds.length > 0 ? <PrimaryButton label="Bulk edit" variant="secondary" onPress={() => setShowBulkEdit(true)} /> : null}
            </View>

            {selectedIds.length > 0 ? (
              <SectionCard title={`${selectedIds.length} selected`} subtitle="Bulk actions for the selected spools.">
                <View style={styles.actions}>
                  {archiveFilter === 'archived' ? (
                    <PrimaryButton label="Restore" variant="secondary" onPress={() => void bulkArchiveMutation.mutateAsync('restore')} />
                  ) : (
                    <PrimaryButton label="Archive" variant="secondary" onPress={() => void bulkArchiveMutation.mutateAsync('archive')} />
                  )}
                  <PrimaryButton label="Delete" variant="danger" onPress={() => void bulkArchiveMutation.mutateAsync('delete')} />
                  <PrimaryButton label="Clear selection" variant="secondary" onPress={() => setSelectedIds([])} />
                </View>
              </SectionCard>
            ) : null}

            {viewMode === 'forecast' ? (
              <SectionCard title="Forecast panel" subtitle={`Lead time: ${leadTimeDays} days • Low-stock threshold: ${lowStockThreshold}%`}>
                {forecastRows.length > 0 ? (
                  forecastRows.map(row => (
                    <View key={row.material} style={[styles.forecastRow, { borderBottomColor: colors.borderSubtle }]}> 
                      <View style={styles.rowText}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>{row.material}</Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{row.spools} spool(s) • {row.lowStock} low-stock</Text>
                      </View>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{formatWeight(row.grams)}</Text>
                    </View>
                  ))
                ) : (
                  <EmptyState icon="📉" title="No forecast data" message="Adjust filters or add spools to see material forecast totals." />
                )}
              </SectionCard>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <InventoryCard
            spool={item}
            colors={colors}
            assignment={assignmentMap.get(pickNumber(item, ['id']))}
            lowStockThreshold={lowStockThreshold}
            selected={selectedIds.includes(pickNumber(item, ['id']))}
            onToggleSelected={() =>
              setSelectedIds(current =>
                current.includes(pickNumber(item, ['id']))
                  ? current.filter(id => id !== pickNumber(item, ['id']))
                  : [...current, pickNumber(item, ['id'])],
              )
            }
            onEdit={() => openEdit(item)}
            onArchive={() =>
              archiveFilter === 'archived'
                ? void api.restoreSpool(pickNumber(item, ['id'])).then(async () => {
                    await invalidateInventory();
                    showToast('Spool restored.', 'success');
                  })
                : void api.archiveSpool(pickNumber(item, ['id'])).then(async () => {
                    await invalidateInventory();
                    showToast('Spool archived.', 'success');
                  })
            }
            onDelete={() =>
              Alert.alert('Delete spool', `Delete ${pickString(item, ['brand'], 'this spool')}?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () =>
                    void api.deleteSpool(pickNumber(item, ['id'])).then(async () => {
                      await invalidateInventory();
                      showToast('Spool deleted.', 'success');
                    }),
                },
              ])
            }
          />
        )}
        ListEmptyComponent={
          viewMode === 'cards' ? (
            <EmptyState icon="🧵" title="No spools found" message="Adjust filters or add a new spool to your inventory." />
          ) : null
        }
      />

      <FloatingActionButton icon="plus" label="Spool" onPress={() => { setEditingSpool(null); setForm(DEFAULT_FORM); setShowFormModal(true); }} />

      <Modal visible={showFormModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{editingSpool ? 'Edit spool' : 'Add spool'}</Text>
              <TextField label="Brand" value={form.brand} onChangeText={value => setForm(current => ({ ...current, brand: value }))} />
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label="Material" value={form.material} onChangeText={value => setForm(current => ({ ...current, material: value }))} /></View>
                <View style={styles.splitField}><TextField label="Subtype" value={form.subtype} onChangeText={value => setForm(current => ({ ...current, subtype: value }))} /></View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label="Color name" value={form.colorName} onChangeText={value => setForm(current => ({ ...current, colorName: value }))} /></View>
                <View style={styles.splitField}><TextField label="Color hex / RGBA" value={form.rgba} onChangeText={value => setForm(current => ({ ...current, rgba: value }))} /></View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label="Label weight (g)" value={form.labelWeight} onChangeText={value => setForm(current => ({ ...current, labelWeight: value }))} keyboardType="number-pad" /></View>
                <View style={styles.splitField}><TextField label="Core weight (g)" value={form.coreWeight} onChangeText={value => setForm(current => ({ ...current, coreWeight: value }))} keyboardType="number-pad" /></View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label="Weight used (g)" value={form.weightUsed} onChangeText={value => setForm(current => ({ ...current, weightUsed: value }))} keyboardType="number-pad" /></View>
                <View style={styles.splitField}><TextField label="Cost / kg" value={form.costPerKg} onChangeText={value => setForm(current => ({ ...current, costPerKg: value }))} keyboardType="decimal-pad" /></View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label="Category" value={form.category} onChangeText={value => setForm(current => ({ ...current, category: value }))} /></View>
                <View style={styles.splitField}><TextField label="Storage location" value={form.storageLocation} onChangeText={value => setForm(current => ({ ...current, storageLocation: value }))} placeholder={pickString(locationsQuery.data, ['0.name'], 'Shelf A')} /></View>
              </View>
              <TextField label="NFC tag UID" value={form.tagUid} onChangeText={value => setForm(current => ({ ...current, tagUid: value }))} />
              <TextField label="AMS tray UUID" value={form.trayUuid} onChangeText={value => setForm(current => ({ ...current, trayUuid: value }))} />
              <TextField label="Note" value={form.note} onChangeText={value => setForm(current => ({ ...current, note: value }))} multiline />
              <View style={styles.actions}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={closeForm} />
                <PrimaryButton
                  label={editingSpool ? (updateMutation.isPending ? 'Saving…' : 'Save') : (createMutation.isPending ? 'Creating…' : 'Create')}
                  onPress={() => void (editingSpool ? updateMutation.mutateAsync() : createMutation.mutateAsync())}
                  disabled={!form.material.trim() || createMutation.isPending || updateMutation.isPending}
                  loading={createMutation.isPending || updateMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showBulkEdit} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Bulk edit {selectedIds.length} spools</Text>
              <TextField label="Brand" value={bulkBrand} onChangeText={setBulkBrand} />
              <TextField label="Storage location" value={bulkLocation} onChangeText={setBulkLocation} />
              <TextField label="Category" value={bulkCategory} onChangeText={setBulkCategory} />
              <View style={styles.actions}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={() => setShowBulkEdit(false)} />
                <PrimaryButton
                  label={bulkUpdateMutation.isPending ? 'Saving…' : 'Apply'}
                  onPress={() => void bulkUpdateMutation.mutateAsync()}
                  disabled={bulkUpdateMutation.isPending}
                  loading={bulkUpdateMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!csvPreview} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>CSV preview</Text>
              <Text style={[styles.previewText, { color: colors.textSecondary }]}>Total rows: {pickNumber(csvPreview, ['total'], 0)}</Text>
              <Text style={[styles.previewText, { color: colors.textSecondary }]}>Valid rows: {pickNumber(csvPreview, ['valid_count'], 0)}</Text>
              <Text style={[styles.previewText, { color: colors.textSecondary }]}>Errors: {pickNumber(csvPreview, ['error_count'], 0)}</Text>
              {pickArray(csvPreview, ['warnings']).map((warning, index) => (
                <Text key={`${warning}-${index}`} style={[styles.previewText, { color: colors.warning }]}>{String(warning)}</Text>
              ))}
              <View style={styles.actions}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setCsvPreview(null); setCsvFile(null); }} />
                <PrimaryButton
                  label={importMutation.isPending ? 'Importing…' : 'Import CSV'}
                  onPress={() => void importMutation.mutateAsync()}
                  disabled={importMutation.isPending}
                  loading={importMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FilterChip({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      <Text style={[styles.filterChipText, { color: selected ? colors.accentLight : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

function InventoryCard({
  spool,
  colors,
  assignment,
  lowStockThreshold,
  selected,
  onToggleSelected,
  onEdit,
  onArchive,
  onDelete,
}: {
  spool: ApiRecord;
  colors: ReturnType<typeof useTheme>['colors'];
  assignment?: string;
  lowStockThreshold: number;
  selected: boolean;
  onToggleSelected: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const labelWeight = pickNumber(spool, ['label_weight'], 0);
  const coreWeight = pickNumber(spool, ['core_weight'], 0);
  const weightUsed = pickNumber(spool, ['weight_used'], 0);
  const remaining = Math.max(0, labelWeight - weightUsed);
  const gross = remaining + coreWeight;
  const remainingPct = labelWeight > 0 ? (remaining / labelWeight) * 100 : 0;
  const color = remainingPct <= lowStockThreshold ? colors.warning : colors.accent;
  const swatchColor = pickString(spool, ['rgba'], colors.surfaceHover);
  const tagValue = pickString(spool, ['tag_uid', 'tray_uuid'], 'Unlinked');
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: selected ? colors.accent : colors.cardBorder }]}> 
      <View style={styles.cardHeader}>
        <Pressable onPress={onToggleSelected} style={[styles.checkCircle, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentBg : 'transparent' }]}> 
          {selected ? <Text style={[styles.checkMark, { color: colors.accentLight }]}>✓</Text> : null}
        </Pressable>
        <View style={[styles.swatch, { backgroundColor: swatchColor || colors.surfaceHover }]} />
        <View style={styles.cardText}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{pickString(spool, ['brand'], 'Unknown brand')}</Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{pickString(spool, ['material'], 'Unknown material')} • {pickString(spool, ['subtype', 'color_name'], 'No subtype')}</Text>
        </View>
        <StatusBadge label={pickString(spool, ['archived_at']) ? 'archived' : 'active'} color={pickString(spool, ['archived_at']) ? colors.textTertiary : colors.success} />
      </View>

      <View style={styles.weightGrid}>
        <View style={styles.weightCell}>
          <Text style={[styles.label, { color: colors.textTertiary }]}>Net</Text>
          <Text style={[styles.value, { color: colors.text }]}>{formatWeight(remaining)}</Text>
        </View>
        <View style={styles.weightCell}>
          <Text style={[styles.label, { color: colors.textTertiary }]}>Gross</Text>
          <Text style={[styles.value, { color: colors.text }]}>{formatWeight(gross)}</Text>
        </View>
        <View style={styles.weightCell}>
          <Text style={[styles.label, { color: colors.textTertiary }]}>Cost / kg</Text>
          <Text style={[styles.value, { color: colors.text }]}>{pickString(spool, ['cost_per_kg'], '—')}</Text>
        </View>
      </View>

      <ProgressBar progress={remainingPct} color={color} />
      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Remaining: {Math.round(remainingPct)}%</Text>
      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Storage location: {pickString(spool, ['storage_location'], 'Unassigned')}</Text>
      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>AMS mapping: {assignment || 'Not mapped to a printer slot'}</Text>
      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>NFC / tag: {tagValue}</Text>
      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Tag type: {pickString(spool, ['tag_type'], 'Unknown')} • Origin: {pickString(spool, ['data_origin'], 'Manual')}</Text>
      {pickString(spool, ['note']) ? <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Note: {pickString(spool, ['note'])}</Text> : null}
      <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>Last used: {formatDateTime(pickString(spool, ['last_used']))}</Text>

      <View style={styles.actions}>
        <PrimaryButton label="Edit" variant="secondary" onPress={onEdit} />
        <PrimaryButton label={pickString(spool, ['archived_at']) ? 'Restore' : 'Archive'} variant="secondary" onPress={onArchive} />
        <PrimaryButton label="Delete" variant="danger" onPress={onDelete} />
      </View>
    </View>
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
  filterRow: {
    gap: spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
  },
  cardText: { flex: 1, gap: spacing.xs },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  cardMeta: { fontSize: fontSize.sm },
  weightGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  weightCell: {
    minWidth: 80,
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  forecastRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  rowMeta: {
    fontSize: fontSize.sm,
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
  previewText: {
    fontSize: fontSize.sm,
  },
});
