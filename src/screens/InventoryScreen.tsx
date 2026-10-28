import { NativeTranslation, nativeLabelTuple, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
import { inventoryApi } from '@/api/inventory';
import {
  inventoryBackend,
  inventoryManagementApi as management,
  inventoryRequest,
} from '@/api/inventoryManagement';
import { settingsApi } from '@/api/settings';
import { InlineTabBar } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { InventoryBulkEditor } from '@/components/inventory/InventoryBulkEditor';
import {
  InventoryButton as PrimaryButton,
  InventoryConfirm as ConfirmModal,
  InventorySection as SectionCard,
  InventorySearch as SearchBar,
  useInventoryToast as useToast,
  ChoiceField,
  InventoryModal,
  InventoryText,
  Toggle,
} from '@/components/inventory/InventoryControls';
import { InventoryDirectory } from '@/components/inventory/InventoryDirectory';
import {
  EnvironmentBindings,
  EnvironmentDefaults,
  LocationEnvironmentReadings,
} from '@/components/inventory/InventoryEnvironment';
import { InventoryForecast } from '@/components/inventory/InventoryForecast';
import { InventoryLabels } from '@/components/inventory/InventoryLabels';
import {
  AmsThresholdSettings,
  SpoolmanPolicySettings,
} from '@/components/inventory/InventoryPolicySettings';
import { LocationsModal } from '@/components/inventory/LocationsModal';
import { NfcInventoryScanModal } from '@/components/inventory/NfcInventoryScanModal';
import { SpoolEditor } from '@/components/inventory/SpoolEditor';
import { SpoolDetails, SpoolSwatch } from '@/components/inventory/SpoolDetails';
import { useAuth } from '@/contexts/AuthContext';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { InventoryRecord } from '@/types/api';
import type { RootNavigationProp } from '@/navigation/types';
import {
  colorOrder,
  copySpool,
  filterInventory,
  groupInventory,
  inventoryColorName,
  lowStock,
  NO_INVENTORY_VALUE,
  number,
  records,
  remaining,
  spoolMatchesQuery,
  text,
  type InventoryFilters,
} from '@/utils/inventory';
import { shareBlob } from '@/utils/share';

const INVENTORY_FILTER_LABELS: Record<string, string> = {
  get material() { return translateNative('native.d9621937608f6468'); }, get brand() { return translateNative('native.c6e3d939851b066b'); }, get category() { return translateNative('native.1d391aa0521102b6'); },
  get material_number() { return translateNative('native.c691b8219b077f90'); }, get core_weight_catalog_id() { return translateNative('native.305fc440b54b012d'); },
  get location_id() { return translateNative('native.db579643a2c06c8e'); },
};

export default function InventoryScreen() {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<RootNavigationProp<'Inventory'>>();
  const client = useQueryClient();
  const canWrite = hasPermission('inventory:update');
  const canDelete = hasPermission('inventory:delete');
  const canSettings = hasPermission('settings:update');
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState('active');
  const [view, setView] = useState('cards');
  const [filters, setFilters] = useState<InventoryFilters>({});
  const [sort, setSort] = useState('id');
  const [descending, setDescending] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [editor, setEditor] = useState<InventoryRecord | null | undefined>();
  const [detail, setDetail] = useState<InventoryRecord | null>(null);
  const [tool, setTool] = useState('');
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [scan, setScan] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    operation: string;
    ids: number[];
  } | null>(null);
  const [csv, setCsv] = useState<{
    preview: InventoryRecord;
    file: { uri: string; name: string; type: string };
  } | null>(null);
  const spoolmanSettings = useQuery({
    queryKey: ['inventorySpoolmanSettings'],
    queryFn: () => inventoryRequest('/settings/spoolman'),
  });
  const spoolman =
    spoolmanSettings.data?.spoolman_enabled === 'true' &&
    !!spoolmanSettings.data?.spoolman_url;
  const backend = useLocalizedMemo(() => inventoryBackend(spoolman), [spoolman]);
  const spools = useQuery({
    queryKey: ['inventorySpools', spoolman],
    queryFn: backend.spools,
    enabled: spoolmanSettings.isSuccess,
  });
  const assignments = useQuery({
    queryKey: ['inventoryAssignments', spoolman],
    queryFn: () =>
      inventoryRequest<InventoryRecord[]>(
        spoolman
          ? '/spoolman/inventory/slot-assignments/all'
          : '/inventory/assignments',
      ),
    enabled: spoolmanSettings.isSuccess,
  });
  const settings = useQuery({
    queryKey: useServerSettingsKey(),
    queryFn: () => settingsApi.getSettings(),
  });
  const catalog = useQuery({
    queryKey: ['inventoryDirectory', 'colors'],
    queryFn: () => management.list('colors'),
  });
  const coreCatalog = useQuery({
    queryKey: ['inventoryDirectory', 'catalog'],
    queryFn: () => management.list('catalog'),
  });
  const locations = useQuery({
    queryKey: ['inventoryLocations'],
    queryFn: () => inventoryRequest<InventoryRecord[]>('/inventory/locations'),
  });
  const rows = useLocalizedMemo(() => spools.data ?? [], [spools.data]);
  const assignmentId = (row: InventoryRecord) =>
    number(row, spoolman ? 'spoolman_spool_id' : 'spool_id');
  const assignedIds = new Set((assignments.data ?? []).map(assignmentId));
  const colorName = (row: InventoryRecord) =>
    inventoryColorName(row, catalog.data ?? []);
  const environmentLocations = [
    ...new Set(
      rows.map(row => number(row, 'location_id')).filter(id => id > 0),
    ),
  ];
  const sortReadings = useQueries({
    queries: environmentLocations.map(locationId => ({
      queryKey: ['inventoryLocationReadings', locationId],
      queryFn: () => management.readings(locationId),
      enabled:
        hasPermission('smart_plugs:read') &&
        ['temperature', 'humidity', 'battery'].includes(sort),
      refetchInterval:
        number(settings.data, 'location_sensor_poll_interval', 120) * 1000,
    })),
  });
  const sortValue = (row: InventoryRecord): string | number => {
    if (sort === 'remaining') return remaining(row);
    if (sort === 'remaining_pct')
      return remaining(row) / Math.max(1, number(row, 'label_weight'));
    if (sort === 'gross') return remaining(row) + number(row, 'core_weight');
    if (sort === 'color') return colorName(row);
    if (sort === 'rgba') return colorOrder(text(row, 'rgba'));
    if (sort === 'stock') return row.slicer_filament ? 1 : 0;
    if (sort === 'location') {
      const assignment = assignments.data?.find(
        entry => assignmentId(entry) === number(row, 'id'),
      );
      return assignment
        ? `${text(assignment, 'printer_name')} ${number(
            assignment,
            'ams_id',
          )} ${number(assignment, 'tray_id')}`
        : '';
    }
    if (sort === 'suppliers') {
      const links = records(row.suppliers);
      return text(
        links.find(link => !!link.is_purchase_source) ?? links[0],
        'supplier_name',
      );
    }
    if (sort === 'spool_name') return number(row, 'core_weight_catalog_id');
    if (sort === 'weight_check')
      return row.last_scale_weight == null
        ? -1
        : Math.abs(
            number(row, 'last_scale_weight') -
              remaining(row) -
              number(row, 'core_weight'),
          );
    if (['temperature', 'humidity', 'battery'].includes(sort)) {
      const readings =
        sortReadings[environmentLocations.indexOf(number(row, 'location_id'))]
          ?.data;
      return number(
        readings?.find(reading => reading.device_class === sort),
        'value',
        -Infinity,
      );
    }
    if (
      [
        'id',
        'label_weight',
        'core_weight',
        'weight_used',
        'cost_per_kg',
      ].includes(sort)
    )
      return number(row, sort);
    return text(row, sort).toLowerCase();
  };
  const threshold = number(settings.data, 'low_stock_threshold', 20);
  const filtered = filterInventory(
    rows.filter(
      row =>
        (archive === 'archived') === !!row.archived_at &&
        spoolMatchesQuery(row, search, colorName(row)),
    ),
    filters,
    assignedIds,
    threshold,
  ).sort((a, b) => {
    const av = sortValue(a),
      bv = sortValue(b);
    const result =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return descending ? -result : result;
  });
  const groups = grouped
    ? groupInventory(filtered)
    : filtered.map(row => ({
        key: String(row.id),
        spools: [row],
        remaining: remaining(row),
      }));
  const refresh = async () => {
    await Promise.all(
      [
        'inventorySpools',
        'inventoryAssignments',
        'inventorySpool',
        'inventorySpoolUsage',
        'inventoryUsageHistory',
        'inventoryDirectory',
        'inventoryLocationReadings',
      ].map(key => client.invalidateQueries({ queryKey: [key] })),
    );
  };
  const action = useMutation({
    mutationFn: async ({
      operation,
      ids,
    }: {
      operation: string;
      ids: number[];
    }) => {
      if (operation === 'import') {
        if (!csv || number(csv.preview, 'valid_count') < 1)
          throw new Error(
            t('inventory.import.noValid', {
              defaultValue: 'No valid rows to import.',
            }),
          );
        return inventoryApi.importSpoolsCsv(csv.file);
      }
      if (operation === 'export') {
        await shareBlob(
          await inventoryApi.exportSpoolsCsv(),
          'bambuddy-inventory.csv',
        );
        return {};
      }
      return backend.bulk(operation, ids);
    },
    onSuccess: async (result, variables) => {
      await refresh();
      const failures = records(result.errors);
      if (failures.length) {
        showToast(JSON.stringify(failures), 'error');
        return;
      }
      setConfirmation(null);
      if (variables.operation === 'import') setCsv(null);
      else if (variables.operation !== 'export') setSelected([]);
      showToast(
        t('inventory.actionComplete', {
          defaultValue: 'Inventory action complete.',
        }),
        'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const pickCsv = async () => {
    try {
      const [asset] = await pick({ type: [types.allFiles] });
      const file = {
        uri: asset.uri,
        name: asset.name ?? 'inventory.csv',
        type: asset.type ?? 'text/csv',
      };
      setCsv({
        file,
        preview: await inventoryApi.importSpoolsCsvPreview(file),
      });
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      )
        return;
      showToast(
        error instanceof Error
          ? error.message
          : t('inventory.import.failed', {
              defaultValue: 'Unable to preview CSV.',
            }),
        'error',
      );
    }
  };
  const toggleIds = (ids: number[], value: boolean) =>
    setSelected(old =>
      value
        ? [...new Set([...old, ...ids])]
        : old.filter(id => !ids.includes(id)),
    );
  const filterOptions = (key: string) => [
    { value: '', get label() { return translateNative('common.all'); } },
    { value: NO_INVENTORY_VALUE, get label() { return translateNative('native.c98ecd8e14a17650'); } },
    ...[...new Set(rows.map(row => text(row, key)).filter(Boolean))].map(
      value => ({ value, label: value }),
    ),
  ];
  if (spoolmanSettings.isLoading || spools.isLoading)
    return (
      <LoadingScreen
        message={t('inventory.loading', { defaultValue: 'Loading inventory…' })}
      />
    );
  if (spoolmanSettings.isError || spools.isError)
    return (
      <ErrorState
        message={
          spoolmanSettings.error?.message ??
          spools.error?.message ??
          translateNative('native.9ede148fd3fc1677')
        }
        onRetry={() => {
          void spoolmanSettings.refetch();
          void spools.refetch();
        }}
      />
    );
  const title = (row: InventoryRecord) =>
    `#${number(row, 'id')} ${text(row, 'brand')} ${text(
      row,
      'material',
    )} ${text(row, 'subtype')} ${colorName(row)}`;
  const setFilter = (key: string, value: string) =>
    setFilters(old => ({ ...old, [key]: value }));
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={view === 'cards' ? groups : []}
        keyExtractor={group => group.key}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={spools.isRefetching}
            onRefresh={() => {
              void refresh();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.stack}>
            <InventoryText>
              {spoolman ? translateNative('native.abc6c7724d1a761e') : translateNative('native.05b96edeaae0e309')} ·{' '}
              {filtered.length} {translateNative('native.622adb6be883b3ee')}{' '}
              {rows
                .reduce(
                  (sum, row) =>
                    sum +
                    Math.max(
                      0,
                      number(row, 'weight_used') -
                        number(row, 'weight_used_baseline'),
                    ),
                  0,
                )
                .toFixed(0)}{' '}
              {translateNative('native.e9862d079a16d262')}</InventoryText>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder={t('inventory.search', {
                defaultValue:
                  'Search #ID, brand, preset, color, purchasing metadata…',
              })}
            />
            <InlineTabBar
              value={archive}
              tabs={[
                {
                  key: 'active',
                  get label() { return translateNative('inventory.active', { defaultValue: 'Active' }); },
                },
                {
                  key: 'archived',
                  get label() { return translateNative('inventory.archived', { defaultValue: 'Archived' }); },
                },
              ]}
              onChange={setArchive}
            />
            <InlineTabBar
              value={view}
              tabs={[
                {
                  key: 'cards',
                  get label() { return translateNative('inventory.cards', { defaultValue: 'Cards' }); },
                },
                ...(hasPermission('inventory:forecast_read')
                  ? [
                      {
                        key: 'forecast',
                        get label() { return translateNative('inventory.forecast', {
                          defaultValue: 'Forecast',
                        }); },
                      },
                    ]
                  : []),
              ]}
              onChange={setView}
            />
            <ChoiceField
              label={translateNative('native.af0c0def77bf1df9')}
              value={tool}
              options={[
                { value: '', get label() { return translateNative('native.6b4ed3bb2d5558fd'); } },
                { value: 'filters', get label() { return translateNative('native.d7b9b1e7cc30f0b7'); } },
                { value: 'locations', get label() { return translateNative('native.fae26139f3ce4483'); } },
                { value: 'suppliers', get label() { return translateNative('native.695ec3c3d8d36b4e'); } },
                { value: 'catalog', get label() { return translateNative('native.1dd36ca1babacbca'); } },
                { value: 'colors', get label() { return translateNative('native.92df6ffa4d005959'); } },
                ...(hasPermission('smart_plugs:read')
                  ? [
                      {
                        value: 'bindings',
                        get label() { return translateNative('native.309b6348e235209f'); },
                      },
                    ]
                  : []),
                ...(canSettings
                  ? [
                      {
                        value: 'environment',
                        get label() { return translateNative('native.316fe145309ad581'); },
                      },
                      {
                        value: 'policy',
                        get label() { return translateNative('native.347c2478527b4d37'); },
                      },
                    ]
                  : []),
              ]}
              onChange={setTool}
            />
            <PrimaryButton
              label={t('inventory.clearFilters', {
                defaultValue: 'Clear all filters',
              })}
              variant="secondary"
              onPress={() => {
                setFilters({});
                setSearch('');
                setArchive('active');
              }}
            />
            {canWrite && (
              <>
                <PrimaryButton
                  label={t('inventory.add', {
                    defaultValue: 'Add spool / quick stock',
                  })}
                  onPress={() => setEditor(null)}
                />
                <PrimaryButton
                  label={translateNative('native.0184b3e475a8c900')}
                  variant="secondary"
                  onPress={() => setScan(true)}
                />
                {!spoolman && (
                  <>
                    <PrimaryButton
                      label={translateNative('native.1313a7e043c6a4a2')}
                      variant="secondary"
                      loading={action.isPending}
                      onPress={() => {
                        void pickCsv();
                      }}
                    />
                    <PrimaryButton
                      label={translateNative('native.0b34e87efafc8013')}
                      variant="secondary"
                      loading={action.isPending}
                      onPress={() =>
                        action.mutate({ operation: 'export', ids: [] })
                      }
                    />
                  </>
                )}
                <PrimaryButton
                  label={translateNative('native.e167006e1fceeb5a')}
                  variant="secondary"
                  onPress={() =>
                    setConfirmation({
                      operation: 'reset-consumed-counter-bulk',
                      ids: rows.map(row => number(row, 'id')),
                    })
                  }
                />
              </>
            )}
            <PrimaryButton
              label={translateNative('native.16bad5912d6c178c')}
              variant="secondary"
              onPress={() => navigation.navigate('SpoolAssignmentHistory')}
            />
            <Toggle
              label={translateNative('native.37b27bb6c1f8cc18', { value0: String(filtered.length) })}
              value={
                !!filtered.length &&
                filtered.every(row => selected.includes(number(row, 'id')))
              }
              onChange={value =>
                toggleIds(
                  filtered.map(row => number(row, 'id')),
                  value,
                )
              }
            />
            {!!selected.length && (
              <SectionCard title={translateNative('native.df8179da1ed8585c', { value0: String(selected.length) })}>
                <View style={styles.stack}>
                  <PrimaryButton
                    label={translateNative('native.51263f4b09e9ffc9')}
                    variant="secondary"
                    onPress={() => setLabelIds(selected)}
                  />
                  {canWrite && (
                    <>
                      <PrimaryButton
                        label={translateNative('native.f9be0e70a808435f')}
                        variant="secondary"
                        onPress={() => setTool('bulk')}
                      />
                      <PrimaryButton
                        label={translateNative('native.d97806b061f7da52')}
                        variant="secondary"
                        onPress={() => setTool('locations')}
                      />
                      {[
                        'bulk-archive',
                        'bulk-restore',
                        'reset-consumed-counter-bulk',
                      ].map(operation => (
                        <PrimaryButton
                          key={operation}
                          label={operation
                            .replace('bulk-', '')
                            .replace('-bulk', '')
                            .replace(/-/g, ' ')}
                          variant="secondary"
                          onPress={() =>
                            setConfirmation({ operation, ids: selected })
                          }
                        />
                      ))}
                    </>
                  )}
                  {canDelete && (
                    <PrimaryButton
                      label={translateNative('native.083338609db94db9')}
                      variant="danger"
                      onPress={() =>
                        setConfirmation({
                          operation: 'bulk-delete',
                          ids: selected,
                        })
                      }
                    />
                  )}
                  <PrimaryButton
                    label={translateNative('native.1a163117d04ef04b')}
                    variant="secondary"
                    onPress={() => setSelected([])}
                  />
                </View>
              </SectionCard>
            )}
            {view === 'forecast' && (
              <InventoryForecast spools={filtered} spoolman={spoolman} />
            )}
          </View>
        }
        ListEmptyComponent={
          view === 'cards' ? (
            <InventoryText>{translateNative('native.70ae44e5e2bd7b5d')}</InventoryText>
          ) : null
        }
        renderItem={({ item: group }) => (
          <SectionCard
            title={
              group.spools.length > 1
                ? translateNative('native.886137838efe0604', { value0: String(title(group.spools[0])), value1: String(group.spools.length), value2: String(Math.round(group.remaining)) })
                : title(group.spools[0])
            }
          >
            <View style={styles.stack}>
              {group.spools.length > 1 && (
                <>
                  <Toggle
                    label={translateNative('native.e127fc7d67596d04')}
                    value={group.spools.every(row =>
                      selected.includes(number(row, 'id')),
                    )}
                    onChange={value =>
                      toggleIds(
                        group.spools.map(row => number(row, 'id')),
                        value,
                      )
                    }
                  />
                  <PrimaryButton
                    label={
                      expanded.includes(group.key)
                        ? translateNative('native.f84c8f02215e11be')
                        : translateNative('native.2d6584818854d802')
                    }
                    variant="secondary"
                    onPress={() =>
                      setExpanded(old =>
                        old.includes(group.key)
                          ? old.filter(key => key !== group.key)
                          : [...old, group.key],
                      )
                    }
                  />
                </>
              )}
              {(group.spools.length === 1 || expanded.includes(group.key)) &&
                group.spools.map(row => (
                  <View key={number(row, 'id')} style={styles.stack}>
                    <Pressable
                      onPress={() => setDetail(row)}
                      accessibilityRole="button"
                      accessibilityLabel={title(row)}
                    >
                      <SpoolSwatch spool={row} />
                      <Text style={{ color: colors.text }}>{title(row)}</Text>
                      <InventoryText>
                        {Math.round(remaining(row))} {translateNative('native.5e9d633a8be5a275')}{' '}
                        {Math.round(
                          Math.max(
                            0,
                            number(row, 'weight_used') -
                              number(row, 'weight_used_baseline'),
                          ),
                        )}{' '}
                        {translateNative('native.d81cb8e388831ec1')}{lowStock(row, threshold) ? translateNative('native.232f898e8661a99a') : ''}
                      </InventoryText>
                      <InventoryText>
                        {text(row, 'storage_location', translateNative('native.768998b76a4dd100'))} ·{' '}
                        {row.slicer_filament ? translateNative('native.77b12cea493c6ee5') : translateNative('native.16c3fd3158cb0666')}
                        {assignedIds.has(number(row, 'id')) ? translateNative('native.741ea09338e89cef') : ''}
                      </InventoryText>
                      <LocationEnvironmentReadings
                        locationId={number(row, 'location_id')}
                      />
                    </Pressable>
                    <Toggle
                      label={translateNative('native.79ffe26ef144caaf', { value0: String(number(row, 'id')) })}
                      value={selected.includes(number(row, 'id'))}
                      onChange={value => toggleIds([number(row, 'id')], value)}
                    />
                    {canWrite && (
                      <PrimaryButton
                        label={translateNative('native.060e4f38051c717e')}
                        variant="secondary"
                        onPress={() => setEditor(row)}
                      />
                    )}
                  </View>
                ))}
            </View>
          </SectionCard>
        )}
      />
      {tool === 'filters' && (
        <InventoryModal
          title={translateNative('native.d7b9b1e7cc30f0b7')}
          onClose={() => setTool('')}
        >
          {[
            'material',
            'brand',
            ...(!spoolman
              ? ['category', 'material_number', 'core_weight_catalog_id']
              : []),
            'location_id',
          ].map(key => (
            <ChoiceField
              key={key}
              label={INVENTORY_FILTER_LABELS[key]}
              value={filters[key] ?? ''}
              options={
                key === 'location_id'
                  ? [
                      { value: '', get label() { return translateNative('common.all'); } },
                      { value: NO_INVENTORY_VALUE, get label() { return translateNative('common.none'); } },
                      ...(locations.data ?? []).map(row => ({
                        value: text(row, 'id'),
                        label: text(row, 'name'),
                      })),
                    ]
                  : key === 'core_weight_catalog_id'
                  ? [
                      { value: '', get label() { return translateNative('common.all'); } },
                      { value: NO_INVENTORY_VALUE, get label() { return translateNative('common.none'); } },
                      ...(coreCatalog.data ?? []).map(row => ({
                        value: text(row, 'id'),
                        label: text(row, 'name'),
                      })),
                    ]
                  : filterOptions(key)
              }
              onChange={value => setFilter(key, value)}
            />
          ))}
          <ChoiceField
            label={translateNative('native.04cc704850e6a9f5')}
            value={filters.supplier_id ?? ''}
            options={[
              { value: '', get label() { return translateNative('common.all'); } },
              { value: NO_INVENTORY_VALUE, get label() { return translateNative('common.none'); } },
              ...[
                ...new Map(
                  rows
                    .flatMap(row => records(row.suppliers))
                    .map(link => [
                      text(link, 'supplier_id'),
                      {
                        value: text(link, 'supplier_id'),
                        label: text(link, 'supplier_name'),
                      },
                    ]),
                ).values(),
              ],
            ]}
            onChange={value => setFilter('supplier_id', value)}
          />
          {(
            [
              nativeLabelTuple(['usage', 'Used / new', ['', 'new', 'used']]),
              nativeLabelTuple(['stock', 'Stock / configured', ['', 'stock', 'configured']]),
              nativeLabelTuple(['ams', 'native.60c275cd2ebda7d8', ['', 'assigned', 'unassigned']]),
            ] as const
          ).map(([key, name, options]) => (
            <ChoiceField
              key={key}
              label={name}
              value={filters[key] ?? ''}
              options={options.map(value => ({ value, label: value || translateNative('common.all') }))}
              onChange={value => setFilter(key, value)}
            />
          ))}
          <Toggle
            label={translateNative('native.962de5e4ef350861')}
            value={!!filters.low}
            onChange={value => setFilter('low', value ? 'yes' : '')}
          />
          <ChoiceField
            label={translateNative('native.37ba518147ea4546')}
            value={sort}
            options={[
              'id',
              'brand',
              'material',
              'subtype',
              'color',
              'rgba',
              'remaining',
              'remaining_pct',
              'gross',
              'label_weight',
              'core_weight',
              'weight_used',
              'cost_per_kg',
              'location',
              'storage_location',
              'category',
              'material_number',
              'suppliers',
              'spool_name',
              'note',
              'data_origin',
              'tag_type',
              'stock',
              'weight_check',
              'created_at',
              'encode_time',
              'last_used',
              'slicer_filament_name',
              'temperature',
              'humidity',
              'battery',
            ].map(value => ({
              value,
              label:
                value === 'rgba'
                  ? translateNative('native.05047c5b1f8214e3')
                  : value.replace(/_/g, ' '),
            }))}
            onChange={setSort}
          />
          <Toggle
            label={translateNative('native.ace0f76a3ac2199a')}
            value={descending}
            onChange={setDescending}
          />
          <Toggle
            label={translateNative('native.d16b125369e3048b')}
            value={grouped}
            onChange={setGrouped}
          />
        </InventoryModal>
      )}
      {editor !== undefined && (
        <SpoolEditor
          spool={editor}
          spoolman={spoolman}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            void refresh();
          }}
        />
      )}
      {detail && (
        <SpoolDetails
          spool={detail}
          spoolman={spoolman}
          assignments={assignments.data ?? []}
          onClose={() => setDetail(null)}
          onEdit={row => {
            setDetail(null);
            setEditor(row);
          }}
          onCopy={row => {
            setDetail(null);
            setEditor(copySpool(row));
          }}
          onLabels={ids => {
            setDetail(null);
            setLabelIds(ids);
          }}
          onChanged={refresh}
        />
      )}
      {tool === 'bulk' && (
        <InventoryBulkEditor
          ids={selected}
          spoolman={spoolman}
          onClose={() => setTool('')}
          onSaved={() => {
            void refresh();
          }}
        />
      )}
      {(['catalog', 'colors', 'suppliers'] as const).map(kind =>
        tool === kind ? (
          <InventoryDirectory
            key={kind}
            kind={kind}
            onClose={() => setTool('')}
          />
        ) : null,
      )}
      {tool === 'bindings' && (
        <EnvironmentBindings onClose={() => setTool('')} />
      )}
      {tool === 'environment' && (
        <EnvironmentDefaults onClose={() => setTool('')} />
      )}
      {tool === 'policy' && (
        <InventoryModal
          title={translateNative('native.b3a869768750fb79')}
          onClose={() => setTool('')}
        >
          <SpoolmanPolicySettings />
          <AmsThresholdSettings />
        </InventoryModal>
      )}
      <LocationsModal
        visible={tool === 'locations'}
        spoolman={spoolman}
        selectedSpoolIds={selected}
        onClose={() => setTool('')}
        onAssigned={() => {
          void refresh();
        }}
      />
      {!!labelIds.length && (
        <InventoryLabels
          spools={rows}
          initialIds={labelIds}
          spoolman={spoolman}
          onClose={() => setLabelIds([])}
        />
      )}
      <NfcInventoryScanModal
        visible={scan}
        spoolman={spoolman}
        onClose={() => setScan(false)}
        onAdd={uid => setEditor({ tag_uid: uid })}
        onEdit={row => setEditor(row as unknown as InventoryRecord)}
        onAssign={row => setDetail(row as unknown as InventoryRecord)}
      />
      {csv && (
        <InventoryModal title={translateNative('native.d86c8d047127fb02')} onClose={() => setCsv(null)}>
          <InventoryText><NativeTranslation id="native.1cb9fdc341531e8b" values={{ value0: (number(csv.preview, 'total')), value1: (number(csv.preview, 'valid_count')), value2: (number(csv.preview, 'error_count')), value3: (number(csv.preview, 'skipped_count')) }} /></InventoryText>
          {(Array.isArray(csv.preview.warnings)
            ? csv.preview.warnings
            : []
          ).map((warning, index) => (
            <InventoryText key={index}>{String(warning)}</InventoryText>
          ))}
          {records(csv.preview.rows).map(row => (
            <SectionCard
              key={number(row, 'row_number')}
              title={translateNative('native.206e4ad98470128c', { value0: String(number(row, 'row_number')), value1: String(text(
                row,
                'status',
              )) })}
            >
              <InventoryText>
                {text(row, 'material')} · {text(row, 'brand')} ·{' '}
                {text(row, 'color_name')} · {text(row, 'rgba')}
              </InventoryText>
              <InventoryText>
                {text(row, 'reason')}
                {row.resolved_color ? translateNative('native.9be21c646cca5a05') : ''}
                {row.cross_material_color
                  ? translateNative('native.6dee7ccc370d415e')
                  : ''}
                {row.duplicate_of_existing
                  ? translateNative('native.46d57e88523b14a5')
                  : ''}
              </InventoryText>
            </SectionCard>
          ))}
          <PrimaryButton
            label={translateNative('native.47a78adf457aaf70')}
            disabled={!number(csv.preview, 'valid_count')}
            loading={action.isPending}
            onPress={() => action.mutate({ operation: 'import', ids: [] })}
          />
        </InventoryModal>
      )}
      <ConfirmModal
        visible={confirmation !== null}
        title={
          confirmation?.operation === 'reset-consumed-counter-bulk'
            ? translateNative('native.73ac3e6430231782')
            : translateNative('native.4dfde8b9c16ab2e4')
        }
        message={
          confirmation?.operation === 'reset-consumed-counter-bulk'
            ? translateNative('native.c9e925c35d9918c5', { value0: String(confirmation.ids.length) })
            : translateNative('native.ba157c69d570f1b8', { value0: String(confirmation?.operation ?? ''), value1: String(confirmation?.ids.length ?? 0) })
        }
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) action.mutate(confirmation);
        }}
        loading={action.isPending}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  stack: { gap: spacing.sm },
});
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
