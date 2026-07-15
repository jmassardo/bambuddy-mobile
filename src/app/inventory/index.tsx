import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { Chip, FloatingActionButton, PrimaryButton, SearchBar, TextField } from '../../components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '../../components/common/StateScreens';
import { formatWeight, pickId, pickString, type ApiRecord } from '../../utils/data';

export default function InventoryScreen() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState('All');
  const [colorFilter, setColorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [brand, setBrand] = useState('');
  const [material, setMaterial] = useState('PLA');
  const [colorName, setColorName] = useState('');
  const [weight, setWeight] = useState('1000');

  const spoolsQuery = useQuery({ queryKey: ['spools'], queryFn: () => api.getSpools() });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createSpool({
        brand,
        material,
        color_name: colorName,
        weight_remaining_g: Number(weight) || 0,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['spools'] });
      showToast('Spool added.', 'success');
      setShowModal(false);
      setBrand('');
      setColorName('');
      setWeight('1000');
    },
    onError: () => showToast('Could not create spool.', 'error'),
  });

  const spools = (spoolsQuery.data ?? []) as ApiRecord[];
  const materials = useMemo(() => ['All', ...new Set(spools.map((spool) => pickString(spool, ['material'], 'Unknown')).filter(Boolean))], [spools]);
  const colorsList = useMemo(() => ['All', ...new Set(spools.map((spool) => pickString(spool, ['color_name', 'color'], 'Unknown')).filter(Boolean))], [spools]);
  const statuses = useMemo(() => ['All', ...new Set(spools.map((spool) => pickString(spool, ['status'], 'Active')).filter(Boolean))], [spools]);

  const filteredSpools = useMemo(() => {
    const term = search.trim().toLowerCase();
    return spools.filter((spool) => {
      const spoolMaterial = pickString(spool, ['material'], 'Unknown');
      const spoolColor = pickString(spool, ['color_name', 'color'], 'Unknown');
      const spoolStatus = pickString(spool, ['status'], 'Active');
      const matchesSearch = !term || [
        pickString(spool, ['brand', 'vendor']),
        spoolMaterial,
        spoolColor,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
      const matchesMaterial = materialFilter === 'All' || spoolMaterial === materialFilter;
      const matchesColor = colorFilter === 'All' || spoolColor === colorFilter;
      const matchesStatus = statusFilter === 'All' || spoolStatus === statusFilter;
      return matchesSearch && matchesMaterial && matchesColor && matchesStatus;
    });
  }, [colorFilter, materialFilter, search, spools, statusFilter]);

  if (spoolsQuery.isLoading) {
    return <LoadingScreen message="Loading spool inventory…" />;
  }

  if (spoolsQuery.isError) {
    return <ErrorState message="Unable to load spool inventory." onRetry={() => void spoolsQuery.refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={filteredSpools}
        keyExtractor={(item) => pickId(item)}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={spoolsQuery.isRefetching} onRefresh={() => void spoolsQuery.refetch()} tintColor={colors.accent} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search spools" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {materials.map((entry) => <Chip key={entry} label={entry} selected={materialFilter === entry} onPress={() => setMaterialFilter(entry)} />)}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {colorsList.map((entry) => <Chip key={entry} label={entry} selected={colorFilter === entry} onPress={() => setColorFilter(entry)} />)}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {statuses.map((entry) => <Chip key={entry} label={entry} selected={statusFilter === entry} onPress={() => setStatusFilter(entry)} />)}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => {
          const colorHex = pickString(item, ['color_hex', 'hex', 'color_code'], colors.surfaceHover);
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <View style={[styles.swatch, { backgroundColor: colorHex || colors.surfaceHover }]} />
              <View style={styles.cardText}>
                <Text style={[styles.title, { color: colors.text }]}>{pickString(item, ['brand', 'vendor'], 'Unknown brand')}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{pickString(item, ['material'], 'Unknown material')} • {pickString(item, ['color_name', 'color'], 'Unknown color')}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>Remaining: {formatWeight(pickString(item, ['weight_remaining_g', 'remaining_g']))}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="🧵" title="No matching spools" message="Add a spool or clear one of the filters." />}
      />

      <FloatingActionButton icon="plus" label="Add Spool" onPress={() => setShowModal(true)} />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add new spool</Text>
            <TextField label="Brand" value={brand} onChangeText={setBrand} />
            <TextField label="Material" value={material} onChangeText={setMaterial} />
            <TextField label="Color" value={colorName} onChangeText={setColorName} />
            <TextField label="Weight remaining (g)" value={weight} onChangeText={setWeight} keyboardType="number-pad" />
            <View style={styles.modalButtons}>
              <View style={styles.modalButton}><PrimaryButton label="Cancel" onPress={() => setShowModal(false)} variant="secondary" /></View>
              <View style={styles.modalButton}><PrimaryButton label={createMutation.isPending ? 'Saving…' : 'Save'} onPress={() => void createMutation.mutateAsync()} loading={createMutation.isPending} disabled={brand.trim().length === 0} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 96 },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  chipsRow: { gap: spacing.sm },
  separator: { height: spacing.md },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
  },
  cardText: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  meta: { fontSize: fontSize.sm },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    gap: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: { flex: 1 },
});
