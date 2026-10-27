import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { archivesApi } from '@/api/archives';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { api } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import {
  Chip,
  KeyValueRow,
  PrimaryButton,
  SearchBar,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { ArchiveDialog } from '@/components/archives/ArchiveWorkflowUI';
import { EmptyState, ErrorState } from '@/components/common/StateScreens';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatWeight,
} from '@/utils/data';
import { shareBlob } from '@/utils/share';
import { isIsoArchiveDay } from '@/utils/archiveWorkflows';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import type { PrintLogEntry } from '@/types/api';

const FIELD_KEYS = [
  'date',
  'print_name',
  'printer',
  'user',
  'status',
  'duration',
  'completed_at',
  'filament',
  'filament_used',
  'cost',
  'energy',
  'energy_cost',
] as const;
type Field = (typeof FIELD_KEYS)[number];
const FIELD_LABELS: Record<Field, string> = {
  date: 'Started',
  print_name: 'Print name',
  printer: 'Printer',
  user: 'User',
  status: 'Status',
  duration: 'Duration',
  completed_at: 'Completed',
  filament: 'Filament',
  filament_used: 'Filament used (g)',
  cost: 'Cost',
  energy: 'Energy (kWh)',
  energy_cost: 'Energy cost',
};
const REASONS = [
  '',
  'adhesionFailure',
  'spaghettiDetached',
  'layerShift',
  'cloggedNozzle',
  'filamentRunout',
  'warping',
  'stringing',
  'underExtrusion',
  'powerFailure',
  'userCancelled',
  'noStatusUpdate',
  'other',
];
const STATUSES = ['completed', 'failed', 'stopped', 'cancelled', 'skipped'];
const PREFERENCES_KEY = 'print-log-fields-v1';

function valueFor(entry: PrintLogEntry, field: Field): string {
  switch (field) {
    case 'date':
      return formatDateTime(entry.started_at ?? entry.created_at);
    case 'completed_at':
      return entry.completed_at ? formatDateTime(entry.completed_at) : '—';
    case 'print_name':
      return entry.print_name ?? '—';
    case 'printer':
      return entry.printer_name ?? '—';
    case 'user':
      return entry.created_by_username ?? '—';
    case 'status':
      return entry.status;
    case 'duration':
      return entry.duration_seconds == null
        ? '—'
        : formatDuration(entry.duration_seconds);
    case 'filament':
      return (
        [entry.filament_type, entry.filament_color]
          .filter(Boolean)
          .join(' · ') || '—'
      );
    case 'filament_used':
      return entry.filament_used_grams == null
        ? '—'
        : formatWeight(entry.filament_used_grams);
    case 'cost':
      return entry.cost == null ? '—' : formatCurrency(entry.cost);
    case 'energy':
      return entry.energy_kwh == null ? '—' : `${entry.energy_kwh} kWh`;
    case 'energy_cost':
      return entry.energy_cost == null
        ? '—'
        : formatCurrency(entry.energy_cost);
  }
}

export default function PrintLogScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const route = useRoute<RootRouteProp<'PrintLog'>>();
  const navigation = useNavigation<RootNavigationProp<'PrintLog'>>();
  const archiveId = route.params?.archiveId;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [printerId, setPrinterId] = useState<number | undefined>();
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortBy, setSortBy] = useState<Field>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [fields, setFields] = useState<Field[]>([...FIELD_KEYS]);
  const [draftFields, setDraftFields] = useState<Field[]>([...FIELD_KEYS]);
  const [fieldDialog, setFieldDialog] = useState(false);
  const [editing, setEditing] = useState<PrintLogEntry | null>(null);
  const [editStatus, setEditStatus] = useState('completed');
  const [editReason, setEditReason] = useState('');
  const dateValid =
    (!from || isIsoArchiveDay(from)) &&
    (!to || isIsoArchiveDay(to)) &&
    (!from || !to || from <= to);
  const parameters = useMemo(
    () => ({
      search: search || undefined,
      printerId,
      createdByUsername: username || undefined,
      status: status || undefined,
      dateFrom: from ? `${from}T00:00:00` : undefined,
      dateTo: to ? `${to}T23:59:59.999` : undefined,
      sortBy,
      sortDir,
    }),
    [search, printerId, username, status, from, to, sortBy, sortDir],
  );
  useEffect(() => {
    setPage(0);
  }, [parameters, pageSize]);
  useEffect(() => {
    void AsyncStorage.getItem(PREFERENCES_KEY)
      .then(value => {
        if (!value) return;
        try {
          const parsed: unknown = JSON.parse(value);
          if (Array.isArray(parsed)) {
            const valid = [
              ...new Set(
                parsed.filter((field): field is Field =>
                  FIELD_KEYS.includes(field as Field),
                ),
              ),
            ];
            if (valid.length) setFields(valid);
          }
        } catch {}
      })
      .catch(() => {});
  }, []);
  const query = useQuery({
    queryKey: ['printLogs', archiveId, parameters, page, pageSize],
    enabled: dateValid,
    queryFn: async () => {
      if (archiveId != null) {
        const rows = (await archivesApi.getArchivePrintLog(
          archiveId,
        )) as unknown as PrintLogEntry[];
        const filtered = rows
          .filter(entry => {
            if (
              search &&
              !entry.print_name?.toLowerCase().includes(search.toLowerCase())
            )
              return false;
            if (printerId !== undefined && entry.printer_id !== printerId)
              return false;
            if (username && entry.created_by_username !== username)
              return false;
            if (status && entry.status !== status) return false;
            if (from && entry.created_at < parameters.dateFrom!) return false;
            if (to && entry.created_at > parameters.dateTo!) return false;
            return true;
          })
          .sort((a, b) => {
            const keyMap: Partial<Record<Field, keyof PrintLogEntry>> = {
              date: 'started_at',
              printer: 'printer_name',
              user: 'created_by_username',
              duration: 'duration_seconds',
              filament: 'filament_type',
              filament_used: 'filament_used_grams',
              energy: 'energy_kwh',
            };
            const key = keyMap[sortBy] ?? (sortBy as keyof PrintLogEntry);
            const aValue = a[key] ?? (sortBy === 'date' ? a.created_at : null);
            const bValue = b[key] ?? (sortBy === 'date' ? b.created_at : null);
            if (aValue == null) return bValue == null ? b.id - a.id : 1;
            if (bValue == null) return -1;
            const order =
              typeof aValue === 'number' && typeof bValue === 'number'
                ? aValue - bValue
                : String(aValue).localeCompare(String(bValue));
            return (sortDir === 'asc' ? order : -order) || b.id - a.id;
          });
        return {
          items: filtered.slice(page * pageSize, (page + 1) * pageSize),
          total: filtered.length,
        };
      }
      return archivesApi.getPrintLogs({
        ...parameters,
        offset: page * pageSize,
        limit: pageSize,
      });
    },
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: api.getPrinters,
  });
  const users = useQuery({
    queryKey: ['printLogUsers'],
    queryFn: () => api.getUsers(),
    enabled: hasPermission('users:read'),
  });
  const refresh = async () => {
    await Promise.all(
      [
        'printLogs',
        'archiveRuns',
        'archivePrintLog',
        'archiveStats',
        'stats',
        'failureAnalysis',
      ].map(key => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
  const mutate = useMutation({
    mutationFn: (
      operation:
        | { type: 'edit'; id: number }
        | { type: 'delete'; id: number }
        | { type: 'clear' },
    ) =>
      operation.type === 'edit'
        ? archiveWorkflows.updateRun(operation.id, {
            status: editStatus,
            failure_reason: editReason || null,
          })
        : operation.type === 'delete'
        ? archiveWorkflows.deleteRun(operation.id)
        : archiveWorkflows.clearRuns(),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const exportPage = useMutation({
    mutationFn: async (format: 'csv' | 'json') => {
      const entries = query.data?.items ?? [];
      const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = [
        fields.map(field => escape(FIELD_LABELS[field])).join(','),
        ...entries.map(entry =>
          fields.map(field => escape(valueFor(entry, field))).join(','),
        ),
      ].join('\n');
      const blob = new Blob(
        [format === 'json' ? JSON.stringify(entries, null, 2) : csv],
        {
          type: format === 'json' ? 'application/json' : 'text/csv',
          lastModified: Date.now(),
        },
      );
      await shareBlob(blob, `print-log-page-${page + 1}.${format}`);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const total = query.data?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const canEdit = (entry: PrintLogEntry) =>
    hasPermission('archives:update_all') ||
    (entry.created_by_id === user?.id && hasPermission('archives:update_own'));
  const canDelete = (entry: PrintLogEntry) =>
    hasPermission('archives:delete_all') ||
    (entry.created_by_id === user?.id && hasPermission('archives:delete_own'));
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={query.data?.items ?? []}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.content}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        ListHeaderComponent={
          <View style={styles.stack}>
            <SectionCard
              title={
                archiveId == null
                  ? t('archives.printLog', { defaultValue: 'Print log' })
                  : t('archives.archivePrintLog', {
                      defaultValue: 'Runs for archive #{{id}}',
                      id: archiveId,
                    })
              }
            >
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder={t('archives.searchPrints', {
                  defaultValue: 'Search print names',
                })}
              />
              <ScrollView horizontal>
                <View style={styles.row}>
                  <Chip
                    label={t('archives.allPrinters', {
                      defaultValue: 'All printers',
                    })}
                    selected={printerId === undefined}
                    onPress={() => setPrinterId(undefined)}
                  />
                  {printers.data?.map(printer => (
                    <Chip
                      key={printer.id}
                      label={printer.name}
                      selected={printerId === printer.id}
                      onPress={() => setPrinterId(printer.id)}
                    />
                  ))}
                </View>
              </ScrollView>
              <TextField
                label={t('archives.usernameFilter', {
                  defaultValue: 'Exact user name (blank = all)',
                })}
                value={username}
                onChangeText={setUsername}
              />
              <ScrollView horizontal>
                <View style={styles.row}>
                  {users.data?.map(account => (
                    <Chip
                      key={account.id}
                      label={account.username}
                      selected={username === account.username}
                      onPress={() =>
                        setUsername(
                          username === account.username ? '' : account.username,
                        )
                      }
                    />
                  ))}
                </View>
              </ScrollView>
              <ScrollView horizontal>
                <View style={styles.row}>
                  {['', ...STATUSES].map(value => (
                    <Chip
                      key={value}
                      label={
                        value ||
                        t('archives.allStatuses', {
                          defaultValue: 'All statuses',
                        })
                      }
                      selected={status === value}
                      onPress={() => setStatus(value)}
                    />
                  ))}
                </View>
              </ScrollView>
              <TextField
                label={t('archives.dateFrom', {
                  defaultValue: 'From date (YYYY-MM-DD, inclusive)',
                })}
                value={from}
                onChangeText={setFrom}
              />
              <TextField
                label={t('archives.dateTo', {
                  defaultValue: 'To date (YYYY-MM-DD, inclusive)',
                })}
                value={to}
                onChangeText={setTo}
              />
              {!dateValid ? (
                <Text style={{ color: colors.error }}>
                  {t('archives.invalidDates', {
                    defaultValue: 'Enter valid dates, with From not after To.',
                  })}
                </Text>
              ) : null}
              <Text style={{ color: colors.text }}>
                {t('archives.sortBy', { defaultValue: 'Sort by' })}
              </Text>
              <ScrollView horizontal>
                <View style={styles.row}>
                  {FIELD_KEYS.map(field => (
                    <Chip
                      key={field}
                      label={t(`archives.log.${field}`, {
                        defaultValue: FIELD_LABELS[field],
                      })}
                      selected={sortBy === field}
                      onPress={() => setSortBy(field)}
                    />
                  ))}
                </View>
              </ScrollView>
              <Chip
                label={
                  sortDir === 'asc'
                    ? t('archives.ascending', { defaultValue: 'Ascending' })
                    : t('archives.descending', { defaultValue: 'Descending' })
                }
                selected={sortDir === 'asc'}
                onPress={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              />
              <PrimaryButton
                label={t('archives.configureFields', {
                  defaultValue: 'Configure visible fields / order',
                })}
                variant="secondary"
                onPress={() => {
                  setDraftFields([...fields]);
                  setFieldDialog(true);
                }}
              />
              <Text style={{ color: colors.textSecondary }}>
                {t('archives.pageTotals', {
                  defaultValue:
                    '{{count}} matching runs · page {{page}} / {{pages}}. Exports include this page only.',
                  count: total,
                  page: page + 1,
                  pages: maxPage + 1,
                })}
              </Text>
              <View style={styles.row}>
                {[25, 50, 100, 250, 500].map(size => (
                  <Chip
                    key={size}
                    label={String(size)}
                    selected={pageSize === size}
                    onPress={() => setPageSize(size)}
                  />
                ))}
              </View>
              <View style={styles.row}>
                <PrimaryButton
                  label={t('common.first', { defaultValue: 'First' })}
                  disabled={page === 0}
                  onPress={() => setPage(0)}
                />
                <PrimaryButton
                  label={t('common.previous', { defaultValue: 'Previous' })}
                  disabled={page === 0}
                  onPress={() => setPage(page - 1)}
                />
                <PrimaryButton
                  label={t('common.next', { defaultValue: 'Next' })}
                  disabled={page >= maxPage}
                  onPress={() => setPage(page + 1)}
                />
                <PrimaryButton
                  label={t('common.last', { defaultValue: 'Last' })}
                  disabled={page >= maxPage}
                  onPress={() => setPage(maxPage)}
                />
              </View>
              <View style={styles.row}>
                {(['csv', 'json'] as const).map(format => (
                  <PrimaryButton
                    key={format}
                    label={t('archives.exportPage', {
                      defaultValue: 'Export page as {{format}}',
                      format: format.toUpperCase(),
                    })}
                    loading={exportPage.isPending}
                    onPress={() => exportPage.mutate(format)}
                  />
                ))}
              </View>
              {hasPermission('archives:delete_all') && archiveId == null ? (
                <PrimaryButton
                  label={t('archives.clearLog', {
                    defaultValue: 'Clear entire print log',
                  })}
                  variant="danger"
                  disabled={mutate.isPending}
                  onPress={() =>
                    Alert.alert(
                      t('archives.clearLog', {
                        defaultValue: 'Clear entire print log?',
                      }),
                      t('archives.clearLogWarning', {
                        defaultValue:
                          'All run history and its statistical contributions will be removed. Archives and queue items remain.',
                      }),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('common.delete'),
                          style: 'destructive',
                          onPress: () => mutate.mutate({ type: 'clear' }),
                        },
                      ],
                    )
                  }
                />
              ) : null}
            </SectionCard>
            {query.error ? (
              <ErrorState
                message={query.error.message}
                onRetry={() => void query.refetch()}
              />
            ) : null}
            {query.isLoading ? (
              <Text style={{ color: colors.text }}>{t('common.loading')}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !query.isLoading && !query.error ? (
            <EmptyState
              icon="🧾"
              title={t('archives.noRuns', {
                defaultValue: 'No matching print runs',
              })}
              message={t('archives.adjustRunFilters', {
                defaultValue: 'Adjust filters or dates to browse history.',
              })}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <SectionCard
            title={
              item.print_name ??
              t('archives.untitled', { defaultValue: 'Untitled print' })
            }
          >
            {fields.map(field => (
              <KeyValueRow
                key={field}
                label={t(`archives.log.${field}`, {
                  defaultValue: FIELD_LABELS[field],
                })}
                value={valueFor(item, field)}
              />
            ))}
            {item.failure_reason ? (
              <KeyValueRow
                label={t('archives.failureReason', {
                  defaultValue: 'Failure / rejection reason',
                })}
                value={item.failure_reason}
              />
            ) : null}
            {(item as unknown as { user_verdict?: string }).user_verdict ? (
              <KeyValueRow
                label={t('archives.qualityVerdict', {
                  defaultValue: 'Quality verdict',
                })}
                value={String(
                  (item as unknown as { user_verdict: string }).user_verdict,
                )}
              />
            ) : null}
            <View style={styles.row}>
              {item.archive_id ? (
                <PrimaryButton
                  label={t('archives.openArchive', {
                    defaultValue: 'Open archive',
                  })}
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate('ArchiveDetail', {
                      id: String(item.archive_id),
                    })
                  }
                />
              ) : null}
              {canEdit(item) ? (
                <PrimaryButton
                  label={t('archives.correctRun', {
                    defaultValue: 'Correct this run',
                  })}
                  variant="secondary"
                  onPress={() => {
                    setEditing(item);
                    setEditStatus(item.status);
                    setEditReason(item.failure_reason ?? '');
                  }}
                />
              ) : null}
              {canDelete(item) ? (
                <PrimaryButton
                  label={t('archives.deleteRun', {
                    defaultValue: 'Delete run',
                  })}
                  variant="danger"
                  disabled={mutate.isPending}
                  onPress={() =>
                    Alert.alert(
                      t('archives.deleteRun', {
                        defaultValue: 'Delete this run?',
                      }),
                      t('archives.deleteRunWarning', {
                        defaultValue:
                          'This removes the run and its statistics, not its archive.',
                      }),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('common.delete'),
                          style: 'destructive',
                          onPress: () =>
                            mutate.mutate({ type: 'delete', id: item.id }),
                        },
                      ],
                    )
                  }
                />
              ) : null}
            </View>
          </SectionCard>
        )}
      />
      {editing ? (
        <ArchiveDialog
          title={t('archives.correctRun', { defaultValue: 'Correct this run' })}
          onClose={() => setEditing(null)}
        >
          <View style={styles.row}>
            {STATUSES.map(value => (
              <Chip
                key={value}
                label={value}
                selected={editStatus === value}
                onPress={() => setEditStatus(value)}
              />
            ))}
          </View>
          <View style={styles.row}>
            {REASONS.map(reason => (
              <Chip
                key={reason}
                label={
                  reason ||
                  t('archives.clearReason', { defaultValue: 'Clear reason' })
                }
                selected={editReason === reason}
                onPress={() => setEditReason(reason)}
              />
            ))}
          </View>
          <PrimaryButton
            label={t('common.save')}
            loading={mutate.isPending}
            onPress={() => mutate.mutate({ type: 'edit', id: editing.id })}
          />
          <PrimaryButton
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setEditing(null)}
          />
        </ArchiveDialog>
      ) : null}
      {fieldDialog ? (
        <ArchiveDialog
          title={t('archives.configureFields', {
            defaultValue: 'Visible fields and ordering',
          })}
          onClose={() => setFieldDialog(false)}
        >
          {FIELD_KEYS.map(field => (
            <Chip
              key={field}
              label={t(`archives.log.${field}`, {
                defaultValue: FIELD_LABELS[field],
              })}
              selected={draftFields.includes(field)}
              onPress={() =>
                setDraftFields(current =>
                  current.includes(field)
                    ? current.filter(value => value !== field)
                    : [...current, field],
                )
              }
            />
          ))}
          {draftFields.map((field, index) => (
            <View key={field} style={styles.row}>
              <Text style={{ color: colors.text }}>
                {index + 1}.{' '}
                {t(`archives.log.${field}`, {
                  defaultValue: FIELD_LABELS[field],
                })}
              </Text>
              {([-1, 1] as const).map(direction => (
                <PrimaryButton
                  key={direction}
                  label={
                    direction === -1
                      ? t('common.moveUp', { defaultValue: 'Move up' })
                      : t('common.moveDown', { defaultValue: 'Move down' })
                  }
                  disabled={
                    index + direction < 0 ||
                    index + direction >= draftFields.length
                  }
                  onPress={() => {
                    const next = [...draftFields];
                    [next[index], next[index + direction]] = [
                      next[index + direction],
                      next[index],
                    ];
                    setDraftFields(next);
                  }}
                />
              ))}
            </View>
          ))}
          <PrimaryButton
            label={t('common.reset', { defaultValue: 'Reset' })}
            variant="secondary"
            onPress={() => setDraftFields([...FIELD_KEYS])}
          />
          <PrimaryButton
            label={t('common.save')}
            disabled={!draftFields.length}
            onPress={() => {
              void AsyncStorage.setItem(
                PREFERENCES_KEY,
                JSON.stringify(draftFields),
              )
                .then(() => {
                  setFields([...draftFields]);
                  setFieldDialog(false);
                })
                .catch((error: Error) => showToast(error.message, 'error'));
            }}
          />
        </ArchiveDialog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  stack: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
