import { nativeLabelTuple, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryManagementApi as management } from '@/api/inventoryManagement';
import { useAuth } from '@/contexts/AuthContext';
import { shareBlob } from '@/utils/share';
import { number, records, text, parseNumber } from '@/utils/inventory';
import type { InventoryRecord } from '@/types/api';
import {
  InventoryButton as PrimaryButton,
  InventoryConfirm as ConfirmModal,
  InventorySearch as SearchBar,
  useInventoryToast as useToast,
  ChoiceField,
  Fields,
  InventoryModal,
  InventoryText,
  Toggle,
  inventoryControlStyles as styles,
} from './InventoryControls';

type Directory = 'catalog' | 'colors' | 'suppliers';
const fields = {
  catalog: [
    nativeLabelTuple(['name', 'Name']),
    nativeLabelTuple(['weight', 'Core weight (g)']),
  ],
  colors: [
    nativeLabelTuple(['manufacturer', 'Manufacturer']),
    nativeLabelTuple(['material', 'Material']),
    nativeLabelTuple(['color_name', 'Color name']),
    nativeLabelTuple(['hex_color', 'Hex color (#RRGGBB or #RRGGBBAA)']),
    nativeLabelTuple(['extra_colors', 'Extra colors (comma-separated hex)']),
  ],
  suppliers: [
    nativeLabelTuple(['name', 'Name']),
    nativeLabelTuple(['website', 'Website']),
    nativeLabelTuple(['customer_number', 'Customer number']),
    nativeLabelTuple(['note', 'Notes']),
  ],
} as const;
export const effectOptions = [
  '',
  'sparkle',
  'wood',
  'marble',
  'glow',
  'matte',
  'silk',
  'galaxy',
  'rainbow',
  'metal',
  'translucent',
  'gradient',
  'dual-color',
  'tri-color',
  'multicolor',
].map(value => ({ value, label: value || translateNative('common.none') }));

export function InventoryDirectory({
  kind,
  onClose,
}: {
  kind: Directory;
  onClose: () => void;
}) {
  useNativeLocale();
  const { showToast } = useToast();
  const { hasPermission, isAdmin } = useAuth();
  const canWrite = isAdmin || hasPermission('inventory:update');
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['inventoryDirectory', kind],
    queryFn: () => management.list(kind),
  });
  const [search, setSearch] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<number | null | undefined>();
  const [form, setForm] = useState<Record<string, string>>({});
  const [importJson, setImportJson] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'reset' | null>(null);
  const rows = useLocalizedMemo(() => query.data ?? [], [query.data]);
  const visible = rows.filter(
    row =>
      (!manufacturer || text(row, 'manufacturer') === manufacturer) &&
      fields[kind].some(([key]) =>
        text(row, key).toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const mutate = useMutation({
    mutationFn: async (
      action: 'save' | 'delete' | 'reset' | 'sync' | 'import',
    ) => {
      if (action === 'save') {
        const row: InventoryRecord = Object.fromEntries(
          fields[kind].map(([key]) => [key, form[key]?.trim() || null]),
        );
        if (kind === 'catalog') {
          if (!form.name?.trim()) throw new Error(translateNative('native.a2b696acb8798693'));
          row.weight = parseNumber(form.weight ?? '', translateNative('native.39774f0cafd36ef9'), 0);
        }
        if (kind === 'colors') {
          if (
            !form.manufacturer?.trim() ||
            !form.color_name?.trim() ||
            !/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(form.hex_color ?? '')
          )
            throw new Error(
              translateNative('native.a4d585eab916692d'),
            );
          row.effect_type = form.effect_type || null;
        }
        if (
          kind === 'suppliers' &&
          (!form.name?.trim() || form.name.includes(';'))
        )
          throw new Error(translateNative('native.e350ad7756e2823f'));
        return management.save(kind, row, editing ?? undefined);
      }
      if (action === 'delete') {
        if (kind === 'suppliers')
          return Promise.all(selected.map(id => management.remove(kind, id)));
        return management.removeMany(kind, selected);
      }
      if (action === 'reset') return management.reset(kind);
      if (action === 'sync') return management.syncColors();
      const imported: unknown = JSON.parse(importJson ?? '');
      const parsed = Array.isArray(imported)
        ? records(imported)
        : records((imported as InventoryRecord)?.[kind]);
      if (!parsed.length)
        throw new Error(translateNative('native.470477d60eb6a714'));
      for (const row of parsed) {
        const clean = Object.fromEntries(
          [
            ...fields[kind].map(([key]) => key),
            ...(kind === 'colors' ? ['effect_type'] : []),
          ].map(key => [key, row[key] ?? null]),
        );
        await management.save(kind, clean);
      }
      return parsed;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['inventoryDirectory'] });
      await client.invalidateQueries({ queryKey: ['inventorySpools'] });
      setConfirm(null);
      setSelected([]);
      setEditing(undefined);
      setImportJson(null);
      showToast(translateNative('native.19e2db0a704753e4'), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <InventoryModal
      title={
        kind === 'catalog'
          ? translateNative('native.1dd36ca1babacbca')
          : kind === 'colors'
          ? translateNative('native.92df6ffa4d005959')
          : translateNative('native.695ec3c3d8d36b4e')
      }
      onClose={onClose}
    >
      {query.isError && <InventoryText>{query.error.message}</InventoryText>}
      <SearchBar value={search} onChangeText={setSearch} placeholder={translateNative('common.search')} />
      {kind === 'colors' && (
        <ChoiceField
          label={translateNative('native.449b81d143585902')}
          value={manufacturer}
          onChange={setManufacturer}
          options={[
            { value: '', get label() { return translateNative('common.all'); } },
            ...[...new Set(rows.map(row => text(row, 'manufacturer')))].map(
              value => ({ value, label: value }),
            ),
          ]}
        />
      )}
      {canWrite && (
        <>
          <PrimaryButton
            label={translateNative('native.8c51de8cf3b30af0')}
            onPress={() => {
              setEditing(null);
              setForm({});
            }}
          />
          <Toggle
            label={translateNative('native.2422a7577810265f')}
            value={
              !!visible.length &&
              visible.every(row => selected.includes(number(row, 'id')))
            }
            onChange={value =>
              setSelected(value ? visible.map(row => number(row, 'id')) : [])
            }
          />
          <PrimaryButton
            label={translateNative('native.67a168df94dc71b4', { value0: String(selected.length) })}
            variant="danger"
            disabled={!selected.length}
            onPress={() => setConfirm('delete')}
          />
        </>
      )}
      {visible.map(row => (
        <View key={number(row, 'id')} style={styles.group}>
          <Toggle
            label={fields[kind]
              .map(([key]) => text(row, key))
              .filter(Boolean)
              .join(' · ')}
            value={selected.includes(number(row, 'id'))}
            onChange={value =>
              setSelected(ids =>
                value
                  ? [...ids, number(row, 'id')]
                  : ids.filter(id => id !== number(row, 'id')),
              )
            }
          />
          {canWrite && (
            <PrimaryButton
              label={translateNative('common.edit')}
              variant="secondary"
              onPress={() => {
                setEditing(number(row, 'id'));
                setForm(
                  Object.fromEntries(
                    Object.entries(row).map(([key, value]) => [
                      key,
                      value == null ? '' : String(value),
                    ]),
                  ),
                );
              }}
            />
          )}
          {kind === 'suppliers' && !!row.website && (
            <PrimaryButton
              label={translateNative('native.082b62276cf3e880')}
              variant="secondary"
              onPress={() => {
                const url = text(row, 'website');
                if (!/^https?:\/\//i.test(url))
                  return showToast(translateNative('native.44c535f23fb43be6'), 'error');
                Linking.openURL(url).catch((error: Error) =>
                  showToast(error.message, 'error'),
                );
              }}
            />
          )}
        </View>
      ))}
      {kind !== 'suppliers' && (
        <>
          <PrimaryButton
            label={translateNative('native.acf1a2579eb4526f')}
            variant="secondary"
            onPress={() => {
              shareBlob(
                new Blob([JSON.stringify(rows, null, 2)], {
                  type: 'application/json',
                  lastModified: Date.now(),
                }),
                `${kind}.json`,
              ).catch((error: Error) => showToast(error.message, 'error'));
            }}
          />
          {canWrite && (
            <>
              <PrimaryButton
                label={translateNative('native.45f13f61652829e1')}
                variant="secondary"
                onPress={() => setImportJson('')}
              />
              <PrimaryButton
                label={translateNative('native.ff12b7ccfde4724c')}
                variant="danger"
                onPress={() => setConfirm('reset')}
              />
              {kind === 'colors' && (
                <PrimaryButton
                  label={translateNative('native.4cffdeb6d7d62ee7')}
                  loading={mutate.isPending}
                  onPress={() => mutate.mutate('sync')}
                />
              )}
            </>
          )}
        </>
      )}
      {editing !== undefined && (
        <InventoryModal
          title={editing === null ? translateNative('native.0da11545182c20b2') : translateNative('native.698859ba131b4982')}
          onClose={() => setEditing(undefined)}
        >
          <Fields
            fields={fields[kind]}
            values={form}
            onChange={(key, value) =>
              setForm(old => ({ ...old, [key]: value }))
            }
          />
          {kind === 'colors' && (
            <ChoiceField
              label={translateNative('native.2f544b829f6b875a')}
              value={form.effect_type ?? ''}
              options={effectOptions}
              onChange={value =>
                setForm(old => ({ ...old, effect_type: value }))
              }
            />
          )}
          <PrimaryButton
            label={translateNative('common.save')}
            loading={mutate.isPending}
            onPress={() => mutate.mutate('save')}
          />
        </InventoryModal>
      )}
      {importJson !== null && (
        <InventoryModal
          title={translateNative('native.ae5e02f5ed670ad6')}
          onClose={() => setImportJson(null)}
        >
          <Fields
            fields={[nativeLabelTuple(['json', 'native.de95654d9457bc13'])]}
            values={{ json: importJson }}
            onChange={(_key, value) => setImportJson(value)}
          />
          <PrimaryButton
            label={translateNative('native.ee297a40ab51b625')}
            loading={mutate.isPending}
            onPress={() => mutate.mutate('import')}
          />
        </InventoryModal>
      )}
      <ConfirmModal
        visible={confirm !== null}
        title={
          confirm === 'reset' ? translateNative('native.6f38496c080ff508') : translateNative('native.9237cf3c21f04db9')
        }
        message={
          confirm === 'reset'
            ? translateNative('native.3063150c5705ef0f')
            : translateNative('native.15db4ef96f3f867e', { value0: String(selected.length) })
        }
        onClose={() => setConfirm(null)}
        loading={mutate.isPending}
        onConfirm={() =>
          mutate.mutate(confirm === 'reset' ? 'reset' : 'delete')
        }
      />
    </InventoryModal>
  );
}
