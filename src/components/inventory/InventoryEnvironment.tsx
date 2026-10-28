import { nativeLabelTuple, translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventoryManagementApi as management,
  inventoryRequest,
} from '@/api/inventoryManagement';
import { settingsApi } from '@/api/settings';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';

import type { InventoryRecord } from '@/types/api';
import { number, parseNumber, text } from '@/utils/inventory';
import {
  InventoryButton as PrimaryButton,
  InventoryConfirm as ConfirmModal,
  InventoryField as TextField,
  InventorySearch as SearchBar,
  useInventoryToast as useToast,
  ChoiceField,
  Fields,
  InventoryModal,
  InventoryText,
  Toggle,
} from './InventoryControls';

const categories = ['temperature', 'humidity', 'battery'] as const;
type Category = (typeof categories)[number];
interface CategoryDefaults {
  alertAbove: string;
  alertBelow: string;
  notifyOnAlert: boolean;
  showOnCard: boolean;
}
type SensorDefaults = Record<Category, CategoryDefaults>;
interface SensorPreferences {
  defaults: SensorDefaults;
  colorize: boolean;
  below: string;
  optimal: string;
  above: string;
}
const initialDefaults: SensorDefaults = {
  temperature: {
    alertAbove: '30',
    alertBelow: '20',
    notifyOnAlert: false,
    showOnCard: true,
  },
  humidity: {
    alertAbove: '30',
    alertBelow: '10',
    notifyOnAlert: false,
    showOnCard: true,
  },
  battery: {
    alertAbove: '',
    alertBelow: '10',
    notifyOnAlert: false,
    showOnCard: true,
  },
};
const initialPrefs: SensorPreferences = {
  defaults: initialDefaults,
  colorize: true,
  below: 'blue',
  optimal: 'green',
  above: 'purple',
};
const prefsKey = 'inventory-environment-preferences';
const palette: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
};
function mergeDefaults(raw: unknown, prefs: SensorPreferences): SensorDefaults {
  let server: Partial<SensorDefaults> = {};
  try {
    server =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Partial<SensorDefaults>)
        : {};
  } catch {
    /* Older servers may not have defaults. */
  }
  return Object.fromEntries(
    categories.map(category => [
      category,
      {
        ...initialDefaults[category],
        ...prefs.defaults[category],
        ...server[category],
        showOnCard: prefs.defaults[category].showOnCard,
      },
    ]),
  ) as SensorDefaults;
}
export function useEnvironmentPreferences() {
  return useQuery({
    queryKey: ['inventoryEnvironmentPreferences'],
    queryFn: async () => {
      const raw = await AsyncStorage.getItem(prefsKey);
      if (!raw) return initialPrefs;
      try {
        return { ...initialPrefs, ...(JSON.parse(raw) as SensorPreferences) };
      } catch {
        return initialPrefs;
      }
    },
  });
}
export function LocationEnvironmentReadings({
  locationId,
}: {
  locationId: number;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const prefs = useEnvironmentPreferences().data ?? initialPrefs;
  const settings = useQuery({
    queryKey: useServerSettingsKey(),
    queryFn: () => settingsApi.getSettings(),
  });
  const readings = useQuery({
    queryKey: ['inventoryLocationReadings', locationId],
    queryFn: () => management.readings(locationId),
    enabled: locationId > 0 && hasPermission('smart_plugs:read'),
    refetchInterval:
      number(settings.data, 'location_sensor_poll_interval', 120) * 1000,
  });
  return (
    <View style={styles.readings}>
      {(readings.data ?? [])
        .filter(row => row.show_on_card !== false)
        .map(row => {
          const value = row.value;
          const below =
            value != null &&
            row.alert_below != null &&
            Number(value) < Number(row.alert_below);
          const above =
            value != null &&
            row.alert_above != null &&
            Number(value) > Number(row.alert_above);
          const color = prefs.colorize
            ? palette[
                (row.kind === 'binary' && row.alerting) || above
                  ? prefs.above
                  : below
                  ? prefs.below
                  : prefs.optimal
              ]
            : colors.textSecondary;
          return (
            <Text
              key={number(row, 'id')}
              style={[styles.reading, { color }]}
              accessibilityLabel={t('inventory.sensorReading', {
                defaultValue: '{{name}}: {{state}}',
                name: text(row, 'name'),
                state: text(
                  row,
                  'state',
                  t('inventory.unavailable', { defaultValue: 'Unavailable' }),
                ),
              })}
            >
              {text(row, 'name')}:{' '}
              {row.reachable === false
                ? t('inventory.unavailable', { defaultValue: 'Unavailable' })
                : text(row, 'state', '—')}{' '}
              {text(row, 'unit')}
              {row.alerting ? ' ⚠' : ''}
            </Text>
          );
        })}
    </View>
  );
}
export function EnvironmentDefaults({ onClose }: { onClose: () => void }) {
  useNativeLocale();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: useServerSettingsKey(),
    queryFn: () => settingsApi.getSettings(),
  });
  const prefsQuery = useEnvironmentPreferences();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [interval, setInterval] = useState('120');
  const [ready, setReady] = useState(false);
  const [reset, setReset] = useState(false);
  useEffect(() => {
    if (settings.data && prefsQuery.data && !ready) {
      setPrefs({
        ...prefsQuery.data,
        defaults: mergeDefaults(
          settings.data.location_sensor_alert_defaults,
          prefsQuery.data,
        ),
      });
      setInterval(String(settings.data.location_sensor_poll_interval ?? 120));
      setReady(true);
    }
  }, [settings.data, prefsQuery.data, ready]);
  const save = useMutation({
    mutationFn: async (resetExisting: boolean) => {
      const pollInterval = parseNumber(interval, translateNative('native.b7baf88b4c0da1cc'), 60, 3600);
      for (const category of categories) {
        const row = prefs.defaults[category];
        const low = parseNumber(
          row.alertBelow,
          translateNative('native.68e5035e8c7fd946'),
          -Infinity,
          Infinity,
          true,
        );
        const high = parseNumber(
          row.alertAbove,
          translateNative('native.a486a816765db9de'),
          -Infinity,
          Infinity,
          true,
        );
        if (low !== null && high !== null && low >= high)
          throw new Error(
            translateNative('native.c4ddbea55c35ee0d'),
          );
        if (row.notifyOnAlert && low === null && high === null)
          throw new Error(translateNative('native.80f1e1a27aea6a04'));
      }
      if (resetExisting) {
        for (const printer of [false, true]) {
          const sensors = await management.sensors(printer);
          for (const row of sensors) {
            const category = text(row, 'device_class') as Category;
            if (!categories.includes(category) || row.kind !== 'numeric')
              continue;
            const chosen = prefs.defaults[category];
            await management.saveSensor(
              {
                alert_above:
                  category === 'battery'
                    ? null
                    : chosen.alertAbove === ''
                    ? null
                    : Number(chosen.alertAbove),
                alert_below:
                  chosen.alertBelow === '' ? null : Number(chosen.alertBelow),
                notify_on_alert: chosen.notifyOnAlert,
                [printer ? 'show_on_printer_card' : 'show_on_card']:
                  chosen.showOnCard,
              },
              printer,
              number(row, 'id'),
            );
          }
        }
      }
      await settingsApi.updateSettings({
        location_sensor_poll_interval: pollInterval,
        location_sensor_alert_defaults: JSON.stringify(
          Object.fromEntries(
            categories.map(category => [
              category,
              {
                alertAbove: prefs.defaults[category].alertAbove,
                alertBelow: prefs.defaults[category].alertBelow,
                notifyOnAlert: prefs.defaults[category].notifyOnAlert,
              },
            ]),
          ),
        ),
      });
      await AsyncStorage.setItem(prefsKey, JSON.stringify(prefs));
    },
    onSuccess: async () => {
      await Promise.all(
        [
          'inventoryEnvironmentPreferences',
          'inventorySensors',
          'inventoryLocationReadings',
          'settings',
        ].map(key => client.invalidateQueries({ queryKey: [key] })),
      );
      setReset(false);
      showToast(translateNative('native.7fe6b43129f2bdef'), 'success');
      onClose();
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const change = (
    category: Category,
    key: keyof CategoryDefaults,
    value: string | boolean,
  ) =>
    setPrefs(old => ({
      ...old,
      defaults: {
        ...old.defaults,
        [category]: { ...old.defaults[category], [key]: value },
      },
    }));
  return (
    <InventoryModal
      title={translateNative('native.308f983e172c24a2')}
      onClose={onClose}
    >
      {categories.map(category => (
        <React.Fragment key={category}>
          <InventoryText>{category}</InventoryText>
          {category !== 'battery' && (
            <TextField
              label={translateNative('native.7fad037d89f65bfa')}
              value={prefs.defaults[category].alertAbove}
              onChangeText={value => change(category, 'alertAbove', value)}
            />
          )}
          <TextField
            label={translateNative('native.350adbffee8b46f8')}
            value={prefs.defaults[category].alertBelow}
            onChangeText={value => change(category, 'alertBelow', value)}
          />
          <Toggle
            label={translateNative('native.eaba79aca5a6fa65')}
            value={prefs.defaults[category].notifyOnAlert}
            onChange={value => change(category, 'notifyOnAlert', value)}
          />
          <Toggle
            label={translateNative('native.74f0ff9b915594f7')}
            value={prefs.defaults[category].showOnCard}
            onChange={value => change(category, 'showOnCard', value)}
          />
        </React.Fragment>
      ))}
      <TextField
        label={translateNative('native.afd18dfe4254ba81')}
        value={interval}
        onChangeText={setInterval}
        keyboardType="number-pad"
      />
      <Toggle
        label={translateNative('native.a1be8f7a42ee452e')}
        value={prefs.colorize}
        onChange={value => setPrefs(old => ({ ...old, colorize: value }))}
      />
      {(['below', 'optimal', 'above'] as const).map(key => (
        <ChoiceField
          key={key}
          label={translateNative('native.03453f7d3f6bc8b6', { value0: String(key) })}
          value={prefs[key]}
          options={Object.keys(palette).map(value => ({ value, label: value }))}
          onChange={value => setPrefs(old => ({ ...old, [key]: value }))}
        />
      ))}
      <PrimaryButton
        label={translateNative('native.13795859a6130389')}
        loading={save.isPending}
        disabled={!ready}
        onPress={() => save.mutate(false)}
      />
      <PrimaryButton
        label={translateNative('native.4ce35182cb7564f6')}
        variant="danger"
        disabled={!ready || !hasPermission('smart_plugs:update')}
        onPress={() => setReset(true)}
      />
      <ConfirmModal
        visible={reset}
        title={translateNative('native.20284ef5a9a10136')}
        message={translateNative('native.75beaad25049013f')}
        onClose={() => setReset(false)}
        onConfirm={() => save.mutate(true)}
        loading={save.isPending}
      />
    </InventoryModal>
  );
}
export function EnvironmentBindings({ onClose }: { onClose: () => void }) {
  useNativeLocale();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('smart_plugs:create');
  const canUpdate = hasPermission('smart_plugs:update');
  const canDelete = hasPermission('smart_plugs:delete');
  const client = useQueryClient();
  const [printer, setPrinter] = useState(false);
  const [target, setTarget] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<InventoryRecord | null | undefined>();
  const [form, setForm] = useState<InventoryRecord>({});
  const [related, setRelated] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<
    'overwrite' | 'delete' | null
  >(null);
  const prefs = useEnvironmentPreferences().data ?? initialPrefs;
  const settings = useQuery({
    queryKey: useServerSettingsKey(),
    queryFn: () => settingsApi.getSettings(),
  });
  const sensors = useQuery({
    queryKey: ['inventorySensors', printer],
    queryFn: () => management.sensors(printer),
    refetchInterval: 30000,
  });
  const entities = useQuery({
    queryKey: ['inventorySensorEntities', printer],
    queryFn: () => management.entities(printer),
  });
  const targets = useQuery({
    queryKey: ['inventorySensorTargets', printer],
    queryFn: () =>
      inventoryRequest<InventoryRecord[]>(
        printer ? '/printers/' : '/inventory/locations',
      ),
  });
  const defaults = mergeDefaults(
    settings.data?.location_sensor_alert_defaults,
    prefs,
  );
  const existing = (sensors.data ?? []).find(
    row =>
      text(row, printer ? 'printer_id' : 'location_id') === target &&
      row.id !== editing?.id &&
      (row.entity_id === form.entity_id ||
        (!editing &&
          categories.includes(text(form, 'device_class') as Category) &&
          row.device_class === form.device_class)),
  );
  const chooseEntity = (entityId: string) => {
    const row = entities.data?.find(entry => entry.entity_id === entityId);
    const category = text(row, 'device_class') as Category;
    const chosen = categories.includes(category) ? defaults[category] : null;
    setForm(old => ({
      ...old,
      entity_id: entityId,
      name: text(row, 'friendly_name').slice(0, 100),
      kind: entityId.startsWith('binary_sensor.') ? 'binary' : 'numeric',
      device_class: row?.device_class ?? null,
      unit: text(row, 'unit_of_measurement').slice(0, 16) || null,
      alert_state: '',
      alert_above: chosen?.alertAbove ?? '',
      alert_below: chosen?.alertBelow ?? '',
      notify_on_alert: chosen?.notifyOnAlert ?? false,
      [printer ? 'show_on_printer_card' : 'show_on_card']:
        chosen?.showOnCard ?? true,
    }));
    setRelated([]);
  };
  const mutation = useMutation({
    mutationFn: async (operation: 'save' | 'overwrite' | 'delete') => {
      if (operation === 'delete')
        return management.deleteSensor(number(editing, 'id'), printer);
      if (!target || !text(form, 'entity_id') || !text(form, 'name').trim())
        throw new Error(translateNative('native.61028c9bf43470b9'));
      const numeric = form.kind === 'numeric';
      const below = numeric
        ? parseNumber(
            text(form, 'alert_below'),
            translateNative('native.350adbffee8b46f8'),
            -Infinity,
            Infinity,
            true,
          )
        : null;
      const above = numeric
        ? parseNumber(
            text(form, 'alert_above'),
            translateNative('native.7fad037d89f65bfa'),
            -Infinity,
            Infinity,
            true,
          )
        : null;
      if (below !== null && above !== null && below >= above)
        throw new Error(translateNative('native.a3343246fe53e8a4'));
      const payload = {
        ...form,
        name: text(form, 'name').trim(),
        [printer ? 'printer_id' : 'location_id']: Number(target),
        alert_above: above,
        alert_below: below,
        alert_state: !numeric && form.alert_state ? form.alert_state : null,
        sort_order: parseNumber(
          text(form, 'sort_order', '0'),
          translateNative('native.7b209e16efe1dbf2'),
          0,
          999,
        ),
      };
      await management.saveSensor(
        payload,
        printer,
        operation === 'overwrite'
          ? number(existing, 'id')
          : editing
          ? number(editing, 'id')
          : undefined,
      );
      for (const entityId of related) {
        const entity = entities.data?.find(row => row.entity_id === entityId);
        if (
          !entity ||
          sensors.data?.some(
            row =>
              row.entity_id === entityId &&
              text(row, printer ? 'printer_id' : 'location_id') === target,
          )
        )
          continue;
        const category = text(entity, 'device_class') as Category;
        const chosen = categories.includes(category)
          ? defaults[category]
          : null;
        const isNumeric = !entityId.startsWith('binary_sensor.');
        await management.saveSensor(
          {
            [printer ? 'printer_id' : 'location_id']: Number(target),
            name: text(entity, 'friendly_name').slice(0, 100),
            entity_id: entityId,
            kind: isNumeric ? 'numeric' : 'binary',
            device_class: entity.device_class,
            unit: text(entity, 'unit_of_measurement').slice(0, 16) || null,
            alert_above:
              isNumeric && chosen?.alertAbove
                ? Number(chosen.alertAbove)
                : null,
            alert_below:
              isNumeric && chosen?.alertBelow
                ? Number(chosen.alertBelow)
                : null,
            alert_state: null,
            notify_on_alert: chosen?.notifyOnAlert ?? false,
            [printer ? 'show_on_printer_card' : 'show_on_card']:
              chosen?.showOnCard ?? true,
          },
          printer,
        );
      }
    },
    onSuccess: async () => {
      await Promise.all(
        ['inventorySensors', 'inventoryLocationReadings'].map(key =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
      setEditing(undefined);
      setConfirmation(null);
      setRelated([]);
      showToast(translateNative('native.db0f2c07aaea6913'), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <InventoryModal title={translateNative('native.309b6348e235209f')} onClose={onClose}>
      <Toggle
        label={translateNative('native.8ca98e1c94b4b69e')}
        value={printer}
        onChange={value => {
          setPrinter(value);
          setTarget('');
          setEditing(undefined);
        }}
      />
      <ChoiceField
        label={printer ? translateNative('screen.printer') : translateNative('native.4fa01b8a6af1174b')}
        value={target}
        options={(targets.data ?? []).map(row => ({
          value: text(row, 'id'),
          label: text(row, 'name'),
        }))}
        onChange={setTarget}
      />
      {[sensors, entities, targets]
        .filter(query => query.isError)
        .map((query, index) => (
          <InventoryText key={index}>{query.error?.message}</InventoryText>
        ))}
      {canCreate && (
        <PrimaryButton
          label={translateNative('native.d7ad30056ebb6bb0')}
          disabled={!target}
          onPress={() => {
            setEditing(null);
            setForm({ sort_order: 0 });
          }}
        />
      )}
      {(sensors.data ?? [])
        .filter(
          row =>
            !target ||
            text(row, printer ? 'printer_id' : 'location_id') === target,
        )
        .map(row => (
          <PrimaryButton
            key={number(row, 'id')}
            variant="secondary"
            label={`${text(row, 'name')} · ${text(row, 'entity_id')} · ${text(
              row,
              'last_state',
              'Unavailable',
            )}`}
            onPress={() => {
              setEditing(row);
              setForm(row);
              setTarget(text(row, printer ? 'printer_id' : 'location_id'));
            }}
          />
        ))}
      {editing !== undefined && (
        <InventoryModal
          title={editing ? translateNative('native.9641da7c5bceeedf') : translateNative('native.d7ad30056ebb6bb0')}
          onClose={() => setEditing(undefined)}
        >
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={translateNative('native.43583b3c969b4904')}
          />
          <ChoiceField
            label={translateNative('native.11dffa658091c19e')}
            value={text(form, 'entity_id')}
            options={(entities.data ?? [])
              .filter(row =>
                `${text(row, 'friendly_name')} ${text(row, 'entity_id')}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map(row => ({
                value: text(row, 'entity_id'),
                label: `${text(row, 'friendly_name')} · ${text(
                  row,
                  'entity_id',
                )} · ${text(row, 'state')}`,
              }))}
            onChange={chooseEntity}
          />
          <Fields
            fields={[
              nativeLabelTuple(['name', 'native.a6034f05a5105e39']),
              nativeLabelTuple(['sort_order', 'native.7b209e16efe1dbf2']),
            ]}
            values={{
              name: text(form, 'name'),
              sort_order: text(form, 'sort_order', '0'),
            }}
            onChange={(key, value) =>
              setForm(old => ({ ...old, [key]: value }))
            }
          />
          {form.kind === 'numeric' ? (
            <Fields
              fields={[
                nativeLabelTuple(['alert_below', 'native.61c435f9f3460061']),
                nativeLabelTuple(['alert_above', 'native.1b5ef7865b338606']),
              ]}
              values={{
                alert_below: text(form, 'alert_below'),
                alert_above: text(form, 'alert_above'),
              }}
              onChange={(key, value) =>
                setForm(old => ({ ...old, [key]: value }))
              }
            />
          ) : (
            <ChoiceField
              label={translateNative('native.529085e0eadd5e4f')}
              value={text(form, 'alert_state')}
              options={['', 'on', 'off'].map(value => ({
                value,
                label: value || translateNative('native.2a2befaf4dca1f78'),
              }))}
              onChange={value =>
                setForm(old => ({ ...old, alert_state: value }))
              }
            />
          )}
          <Toggle
            label={translateNative('native.b9334be609ad095f')}
            value={!!form.notify_on_alert}
            onChange={value =>
              setForm(old => ({ ...old, notify_on_alert: value }))
            }
          />
          <Toggle
            label={translateNative('native.c8844c03d4ae37a8')}
            value={
              form[printer ? 'show_on_printer_card' : 'show_on_card'] !== false
            }
            onChange={value =>
              setForm(old => ({
                ...old,
                [printer ? 'show_on_printer_card' : 'show_on_card']: value,
              }))
            }
          />
          {printer && (
            <Toggle
              label={translateNative('native.891120515c2d6628')}
              value={!!form.block_print}
              onChange={value =>
                setForm(old => ({ ...old, block_print: value }))
              }
            />
          )}
          <InventoryText>
            {translateNative('native.c0b118de3fa44a7e')}</InventoryText>
          {(entities.data ?? [])
            .filter(
              row =>
                row.entity_id !== form.entity_id &&
                row.device_class !== form.device_class &&
                categories.includes(text(row, 'device_class') as Category) &&
                !(sensors.data ?? []).some(
                  bound =>
                    text(bound, printer ? 'printer_id' : 'location_id') ===
                      target &&
                    (bound.entity_id === row.entity_id ||
                      bound.device_class === row.device_class),
                ) &&
                text(row, 'entity_id')
                  .split('.')
                  .pop()
                  ?.split('_')
                  .slice(0, -1)
                  .join('_') ===
                  text(form, 'entity_id')
                    .split('.')
                    .pop()
                    ?.split('_')
                    .slice(0, -1)
                    .join('_'),
            )
            .map(row => (
              <Toggle
                key={text(row, 'entity_id')}
                label={`${text(row, 'friendly_name')} · ${text(row, 'state')}`}
                value={related.includes(text(row, 'entity_id'))}
                onChange={value =>
                  setRelated(old =>
                    value
                      ? [...old, text(row, 'entity_id')]
                      : old.filter(entity => entity !== row.entity_id),
                  )
                }
              />
            ))}
          {(editing ? canUpdate : canCreate) && (
            <PrimaryButton
              label={translateNative('native.fee04c4b3b991c3a')}
              disabled={!!existing && !canUpdate}
              loading={mutation.isPending}
              onPress={() =>
                existing
                  ? setConfirmation('overwrite')
                  : mutation.mutate('save')
              }
            />
          )}
          {!!editing && canDelete && (
            <PrimaryButton
              label={translateNative('native.72201c6ae14ac6b1')}
              variant="danger"
              onPress={() => setConfirmation('delete')}
            />
          )}
          <ConfirmModal
            visible={confirmation !== null}
            title={
              confirmation === 'delete'
                ? translateNative('native.481dfee2e13b4924')
                : translateNative('native.4e3e88e4aeb69359')
            }
            message={
              confirmation === 'delete'
                ? translateNative('native.d5be1db5a44c3cce')
                : translateNative('native.1ee92e4acb57084c', { value0: String(text(
                    existing,
                    'name',
                  )) })
            }
            onClose={() => setConfirmation(null)}
            onConfirm={() =>
              mutation.mutate(
                confirmation === 'delete' ? 'delete' : 'overwrite',
              )
            }
            loading={mutation.isPending}
          />
        </InventoryModal>
      )}
    </InventoryModal>
  );
}
const styles = StyleSheet.create({
  readings: { gap: 4, paddingVertical: 4 },
  reading: { fontSize: 12 },
});
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
