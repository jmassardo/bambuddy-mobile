import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useTheme } from '../../theme';
import { fontSize, spacing } from '../../theme/tokens';
import { SearchBar } from '../../components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '../../components/common/StateScreens';
import { PrinterCard } from '../../components/printers/PrinterCard';
import { normalizeStatus, pickId, pickString, type ApiRecord } from '../../utils/data';

const FILTERS = ['all', 'printing', 'idle', 'issues'] as const;
type FilterMode = (typeof FILTERS)[number];

function PrinterStatusRow({ printer }: { printer: ApiRecord }) {
  const router = useRouter();
  const printerId = Number(pickId(printer));
  const statusQuery = useQuery({
    queryKey: ['printerStatus', printerId],
    queryFn: () => api.getPrinterStatus(printerId),
    enabled: Number.isFinite(printerId),
    refetchInterval: 15_000,
  });

  return (
    <PrinterCard
      printer={printer}
      status={(statusQuery.data ?? {}) as ApiRecord}
      loading={statusQuery.isLoading || statusQuery.isRefetching}
      onPress={() => router.push(`/printer/${printerId}`)}
      onCameraPress={() => router.push(`/camera/${printerId}`)}
    />
  );
}

export default function PrintersDashboardScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
  });

  const printers = (printersQuery.data ?? []) as ApiRecord[];
  const filteredPrinters = useMemo(() => {
    const term = search.trim().toLowerCase();

    return printers.filter((printer) => {
      const matchesSearch = !term || [
        pickString(printer, ['name', 'display_name']),
        pickString(printer, ['model', 'printer_model']),
        pickString(printer, ['location']),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);

      if (!matchesSearch) return false;
      if (filter === 'all') return true;

      const state = normalizeStatus(pickString(printer, ['status', 'state', 'print_status'])).toLowerCase();
      if (filter === 'printing') return state.includes('print');
      if (filter === 'idle') return state.includes('idle') || state.includes('ready');
      return state.includes('error') || state.includes('offline') || state.includes('pause');
    });
  }, [filter, printers, search]);

  const handleRefresh = async () => {
    await Promise.all([
      printersQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['printerStatus'] }),
    ]);
  };

  if (printersQuery.isLoading) {
    return <LoadingScreen message="Loading printers…" />;
  }

  if (printersQuery.isError) {
    return <ErrorState message="Unable to load printers." onRetry={() => void printersQuery.refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={filteredPrinters}
        keyExtractor={(item) => pickId(item)}
        renderItem={({ item }) => <PrinterStatusRow printer={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={printersQuery.isRefetching} onRefresh={() => void handleRefresh()} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Printer Fleet</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{printers.length} printers connected</Text>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search printers, models, or locations"
              onFilterPress={() => setFilter((current) => FILTERS[(FILTERS.indexOf(current) + 1) % FILTERS.length])}
            />
            <Text style={[styles.filterLabel, { color: colors.textTertiary }]}>Filter: {filter}</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🖨️"
            title={printers.length === 0 ? 'No printers configured' : 'No printers match this filter'}
            message={printers.length === 0 ? 'Connect a printer from your Bambuddy server to see live status here.' : 'Try adjusting your search or filter.'}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
  },
  subtitle: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  filterLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  separator: { height: spacing.md },
});
