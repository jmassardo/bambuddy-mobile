import React, { useMemo, useState } from 'react';
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
import { useTranslation } from '@/i18n';
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

export default function InventoryScreen() {
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
  const backend = useMemo(() => inventoryBackend(spoolman), [spoolman]);
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
    queryKey: ['settings'],
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
  const rows = useMemo(() => spools.data ?? [], [spools.data]);
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
    { value: '', label: 'All' },
    { value: NO_INVENTORY_VALUE, label: 'None / unassigned' },
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
          'Unable to load inventory.'
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
              {spoolman ? 'Spoolman inventory' : 'Built-in inventory'} ·{' '}
              {filtered.length} visible ·{' '}
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
              g total consumed
            </InventoryText>
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
                  label: t('inventory.active', { defaultValue: 'Active' }),
                },
                {
                  key: 'archived',
                  label: t('inventory.archived', { defaultValue: 'Archived' }),
                },
              ]}
              onChange={setArchive}
            />
            <InlineTabBar
              value={view}
              tabs={[
                {
                  key: 'cards',
                  label: t('inventory.cards', { defaultValue: 'Cards' }),
                },
                ...(hasPermission('inventory:forecast_read')
                  ? [
                      {
                        key: 'forecast',
                        label: t('inventory.forecast', {
                          defaultValue: 'Forecast',
                        }),
                      },
                    ]
                  : []),
              ]}
              onChange={setView}
            />
            <ChoiceField
              label="Inventory tools"
              value={tool}
              options={[
                { value: '', label: 'Choose a tool' },
                { value: 'filters', label: 'Filters, sorting and grouping' },
                { value: 'locations', label: 'Locations' },
                { value: 'suppliers', label: 'Suppliers' },
                { value: 'catalog', label: 'Spool core catalog' },
                { value: 'colors', label: 'Color catalog' },
                ...(hasPermission('smart_plugs:read')
                  ? [
                      {
                        value: 'bindings',
                        label: 'Environmental sensor bindings',
                      },
                    ]
                  : []),
                ...(canSettings
                  ? [
                      {
                        value: 'environment',
                        label: 'Environmental defaults and colors',
                      },
                      {
                        value: 'policy',
                        label: 'Spoolman sync policy / AMS thresholds',
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
                  label="Scan spool NFC"
                  variant="secondary"
                  onPress={() => setScan(true)}
                />
                {!spoolman && (
                  <>
                    <PrimaryButton
                      label="Import CSV"
                      variant="secondary"
                      loading={action.isPending}
                      onPress={() => {
                        void pickCsv();
                      }}
                    />
                    <PrimaryButton
                      label="Export CSV"
                      variant="secondary"
                      loading={action.isPending}
                      onPress={() =>
                        action.mutate({ operation: 'export', ids: [] })
                      }
                    />
                  </>
                )}
                <PrimaryButton
                  label="Reset all consumed counters (including archived)"
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
              label="Assignment history"
              variant="secondary"
              onPress={() => navigation.navigate('SpoolAssignmentHistory')}
            />
            <Toggle
              label={`Select all visible (${filtered.length})`}
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
              <SectionCard title={`${selected.length} selected`}>
                <View style={styles.stack}>
                  <PrimaryButton
                    label="Compose labels"
                    variant="secondary"
                    onPress={() => setLabelIds(selected)}
                  />
                  {canWrite && (
                    <>
                      <PrimaryButton
                        label="Selective bulk edit"
                        variant="secondary"
                        onPress={() => setTool('bulk')}
                      />
                      <PrimaryButton
                        label="Assign location"
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
                      label="Delete selected"
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
                    label="Clear selection"
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
            <InventoryText>No spools match these filters.</InventoryText>
          ) : null
        }
        renderItem={({ item: group }) => (
          <SectionCard
            title={
              group.spools.length > 1
                ? `${title(group.spools[0])} · ${
                    group.spools.length
                  } similar spools · ${Math.round(group.remaining)} g total`
                : title(group.spools[0])
            }
          >
            <View style={styles.stack}>
              {group.spools.length > 1 && (
                <>
                  <Toggle
                    label="Select group"
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
                        ? 'Collapse group'
                        : 'Expand group'
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
                        {Math.round(remaining(row))} g remaining ·{' '}
                        {Math.round(
                          Math.max(
                            0,
                            number(row, 'weight_used') -
                              number(row, 'weight_used_baseline'),
                          ),
                        )}{' '}
                        g consumed
                        {lowStock(row, threshold) ? ' · ⚠ low stock' : ''}
                      </InventoryText>
                      <InventoryText>
                        {text(row, 'storage_location', 'No location')} ·{' '}
                        {row.slicer_filament ? 'Configured' : 'Stock'}
                        {assignedIds.has(number(row, 'id')) ? ' · In AMS' : ''}
                      </InventoryText>
                      <LocationEnvironmentReadings
                        locationId={number(row, 'location_id')}
                      />
                    </Pressable>
                    <Toggle
                      label={`Select spool #${number(row, 'id')}`}
                      value={selected.includes(number(row, 'id'))}
                      onChange={value => toggleIds([number(row, 'id')], value)}
                    />
                    {canWrite && (
                      <PrimaryButton
                        label="Edit spool"
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
          title="Filters, sorting and grouping"
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
              label={key.replace(/_/g, ' ')}
              value={filters[key] ?? ''}
              options={
                key === 'location_id'
                  ? [
                      { value: '', label: 'All' },
                      { value: NO_INVENTORY_VALUE, label: 'None' },
                      ...(locations.data ?? []).map(row => ({
                        value: text(row, 'id'),
                        label: text(row, 'name'),
                      })),
                    ]
                  : key === 'core_weight_catalog_id'
                  ? [
                      { value: '', label: 'All' },
                      { value: NO_INVENTORY_VALUE, label: 'None' },
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
            label="Supplier"
            value={filters.supplier_id ?? ''}
            options={[
              { value: '', label: 'All' },
              { value: NO_INVENTORY_VALUE, label: 'None' },
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
              ['usage', 'Used / new', ['', 'new', 'used']],
              ['stock', 'Stock / configured', ['', 'stock', 'configured']],
              ['ams', 'AMS assignment', ['', 'assigned', 'unassigned']],
            ] as const
          ).map(([key, name, options]) => (
            <ChoiceField
              key={key}
              label={name}
              value={filters[key] ?? ''}
              options={options.map(value => ({ value, label: value || 'All' }))}
              onChange={value => setFilter(key, value)}
            />
          ))}
          <Toggle
            label="Low stock only (per-spool override respected)"
            value={!!filters.low}
            onChange={value => setFilter('low', value ? 'yes' : '')}
          />
          <ChoiceField
            label="Sort by"
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
                  ? 'Color swatch (rainbow order)'
                  : value.replace(/_/g, ' '),
            }))}
            onChange={setSort}
          />
          <Toggle
            label="Descending sort"
            value={descending}
            onChange={setDescending}
          />
          <Toggle
            label="Group similar spools"
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
          title="Inventory integration settings"
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
        <InventoryModal title="CSV import preview" onClose={() => setCsv(null)}>
          <InventoryText>
            Total {number(csv.preview, 'total')} · valid{' '}
            {number(csv.preview, 'valid_count')} · errors{' '}
            {number(csv.preview, 'error_count')} · skipped{' '}
            {number(csv.preview, 'skipped_count')}
          </InventoryText>
          {(Array.isArray(csv.preview.warnings)
            ? csv.preview.warnings
            : []
          ).map((warning, index) => (
            <InventoryText key={index}>{String(warning)}</InventoryText>
          ))}
          {records(csv.preview.rows).map(row => (
            <SectionCard
              key={number(row, 'row_number')}
              title={`Row ${number(row, 'row_number')} · ${text(
                row,
                'status',
              )}`}
            >
              <InventoryText>
                {text(row, 'material')} · {text(row, 'brand')} ·{' '}
                {text(row, 'color_name')} · {text(row, 'rgba')}
              </InventoryText>
              <InventoryText>
                {text(row, 'reason')}
                {row.resolved_color ? ' · Catalog-resolved color' : ''}
                {row.cross_material_color
                  ? ' · ⚠ Color from another material'
                  : ''}
                {row.duplicate_of_existing
                  ? ' · ⚠ Duplicate of existing spool'
                  : ''}
              </InventoryText>
            </SectionCard>
          ))}
          <PrimaryButton
            label="Import valid rows"
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
            ? 'Reset consumed counters?'
            : 'Confirm inventory action'
        }
        message={
          confirmation?.operation === 'reset-consumed-counter-bulk'
            ? `Reset ${confirmation.ids.length} consumption baselines without changing remaining filament or usage history.`
            : `${confirmation?.operation ?? ''} affects ${
                confirmation?.ids.length ?? 0
              } spools. Deletion is permanent.`
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
