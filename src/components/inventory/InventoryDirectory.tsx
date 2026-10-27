import React, { useMemo, useState } from 'react';
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
    ['name', 'Name'],
    ['weight', 'Core weight (g)'],
  ],
  colors: [
    ['manufacturer', 'Manufacturer'],
    ['material', 'Material'],
    ['color_name', 'Color name'],
    ['hex_color', 'Hex color (#RRGGBB or #RRGGBBAA)'],
    ['extra_colors', 'Extra colors (comma-separated hex)'],
  ],
  suppliers: [
    ['name', 'Name'],
    ['website', 'Website'],
    ['customer_number', 'Customer number'],
    ['note', 'Notes'],
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
].map(value => ({ value, label: value || 'None' }));

export function InventoryDirectory({
  kind,
  onClose,
}: {
  kind: Directory;
  onClose: () => void;
}) {
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
  const rows = useMemo(() => query.data ?? [], [query.data]);
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
          if (!form.name?.trim()) throw new Error('Name is required.');
          row.weight = parseNumber(form.weight ?? '', 'Core weight', 0);
        }
        if (kind === 'colors') {
          if (
            !form.manufacturer?.trim() ||
            !form.color_name?.trim() ||
            !/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(form.hex_color ?? '')
          )
            throw new Error(
              'Manufacturer, color name and valid hex color are required.',
            );
          row.effect_type = form.effect_type || null;
        }
        if (
          kind === 'suppliers' &&
          (!form.name?.trim() || form.name.includes(';'))
        )
          throw new Error('Enter a supplier name without semicolons.');
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
        throw new Error('JSON must contain an array of entries.');
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
      showToast('Saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <InventoryModal
      title={
        kind === 'catalog'
          ? 'Spool core catalog'
          : kind === 'colors'
          ? 'Color catalog'
          : 'Suppliers'
      }
      onClose={onClose}
    >
      {query.isError && <InventoryText>{query.error.message}</InventoryText>}
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search" />
      {kind === 'colors' && (
        <ChoiceField
          label="Manufacturer"
          value={manufacturer}
          onChange={setManufacturer}
          options={[
            { value: '', label: 'All' },
            ...[...new Set(rows.map(row => text(row, 'manufacturer')))].map(
              value => ({ value, label: value }),
            ),
          ]}
        />
      )}
      {canWrite && (
        <>
          <PrimaryButton
            label="Create"
            onPress={() => {
              setEditing(null);
              setForm({});
            }}
          />
          <Toggle
            label="Select all visible"
            value={
              !!visible.length &&
              visible.every(row => selected.includes(number(row, 'id')))
            }
            onChange={value =>
              setSelected(value ? visible.map(row => number(row, 'id')) : [])
            }
          />
          <PrimaryButton
            label={`Delete selected (${selected.length})`}
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
              label="Edit"
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
              label="Open website"
              variant="secondary"
              onPress={() => {
                const url = text(row, 'website');
                if (!/^https?:\/\//i.test(url))
                  return showToast('Use an HTTP or HTTPS website.', 'error');
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
            label="Export JSON"
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
                label="Import JSON"
                variant="secondary"
                onPress={() => setImportJson('')}
              />
              <PrimaryButton
                label="Reset defaults"
                variant="danger"
                onPress={() => setConfirm('reset')}
              />
              {kind === 'colors' && (
                <PrimaryButton
                  label="Sync FilamentColors catalog"
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
          title={editing === null ? 'Create entry' : 'Edit entry'}
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
              label="Effect"
              value={form.effect_type ?? ''}
              options={effectOptions}
              onChange={value =>
                setForm(old => ({ ...old, effect_type: value }))
              }
            />
          )}
          <PrimaryButton
            label="Save"
            loading={mutate.isPending}
            onPress={() => mutate.mutate('save')}
          />
        </InventoryModal>
      )}
      {importJson !== null && (
        <InventoryModal
          title="Import JSON entries"
          onClose={() => setImportJson(null)}
        >
          <Fields
            fields={[['json', 'Paste exported JSON array']]}
            values={{ json: importJson }}
            onChange={(_key, value) => setImportJson(value)}
          />
          <PrimaryButton
            label="Import"
            loading={mutate.isPending}
            onPress={() => mutate.mutate('import')}
          />
        </InventoryModal>
      )}
      <ConfirmModal
        visible={confirm !== null}
        title={
          confirm === 'reset' ? 'Reset defaults?' : 'Delete selected entries?'
        }
        message={
          confirm === 'reset'
            ? 'The catalog will be reset to the built-in entries.'
            : `${selected.length} entries will be removed. Linked supplier deletion may be refused by the server.`
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
