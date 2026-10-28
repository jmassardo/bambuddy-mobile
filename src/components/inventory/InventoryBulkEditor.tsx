import { nativeLabelTuple, translateNative, useNativeLocale } from '@/i18n';

import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { inventoryBackend, inventoryRequest } from '@/api/inventoryManagement';
import type { InventoryRecord } from '@/types/api';
import { number, selectivePatch, text } from '@/utils/inventory';
import {
  InventoryButton as PrimaryButton,
  InventoryField as TextField,
  useInventoryToast as useToast,
  ChoiceField,
  InventoryModal,
  InventoryText,
  Toggle,
} from './InventoryControls';

const bulkFields = [
  nativeLabelTuple(['brand', 'Brand']),
  nativeLabelTuple(['material', 'Material']),
  nativeLabelTuple(['subtype', 'Subtype']),
  nativeLabelTuple(['color_name', 'Color name']),
  nativeLabelTuple(['rgba', 'Color RGBA']),
  nativeLabelTuple(['slicer_filament_name', 'Slicer filament name']),
  nativeLabelTuple(['slicer_filament', 'Slicer filament ID']),
  nativeLabelTuple(['cost_per_kg', 'Actual cost per kg']),
  nativeLabelTuple(['note', 'Note']),
  nativeLabelTuple(['label_weight', 'Label weight (g)']),
  nativeLabelTuple(['core_weight', 'Core weight (g)']),
  nativeLabelTuple(['category', 'Category']),
  nativeLabelTuple(['low_stock_threshold_pct', 'Low-stock threshold override %']),
  nativeLabelTuple(['material_number', 'Material number']),
];
const numeric = [
  'cost_per_kg',
  'label_weight',
  'core_weight',
  'low_stock_threshold_pct',
  'location_id',
];
export function InventoryBulkEditor({
  ids,
  spoolman,
  onClose,
  onSaved,
}: {
  ids: number[];
  spoolman: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  useNativeLocale();
  const { showToast } = useToast();
  const [changed, setChanged] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const locations = useQuery({
    queryKey: ['inventoryLocations'],
    queryFn: () => inventoryRequest<InventoryRecord[]>('/inventory/locations'),
  });
  const save = useMutation({
    mutationFn: () => {
      const update = selectivePatch(values, changed, numeric);
      if (changed.includes('material') && !update.material)
        throw new Error(translateNative('native.9269228e74dd600f'));
      for (const key of ['label_weight', 'core_weight']) {
        if (changed.includes(key) && update[key] === null)
          throw new Error(translateNative('native.04e9a71bae972aee', { value0: String(key) }));
      }
      if ('label_weight' in update && Number(update.label_weight) < 1)
        throw new Error(translateNative('native.90fcfc37a64eccfa'));
      if (spoolman && update.cost_per_kg === null)
        throw new Error(
          translateNative('native.1eabedd3063ab2da'),
        );
      if (spoolman)
        Object.entries(update).forEach(([key, value]) => {
          if (value === null && !numeric.includes(key)) update[key] = '';
        });
      if (update.rgba && !/^[a-f\d]{8}$/i.test(String(update.rgba)))
        throw new Error(translateNative('native.08d66cb3ea484655'));
      if (update.low_stock_threshold_pct === 0)
        throw new Error(
          translateNative('native.1e51b93c1e6dd88e'),
        );
      if ('location_id' in update)
        update.storage_location = update.location_id
          ? text(
              locations.data?.find(
                row => number(row, 'id') === update.location_id,
              ),
              'name',
            )
          : '';
      return inventoryBackend(spoolman).bulk('bulk-update', ids, update);
    },
    onSuccess: result => {
      if (
        result.errors &&
        Array.isArray(result.errors) &&
        result.errors.length
      ) {
        showToast(JSON.stringify(result.errors), 'error');
        onSaved();
        return;
      }
      onSaved();
      onClose();
      showToast(translateNative('native.6d9e1632aaa9e75c'), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const toggle = (key: string, value: boolean) =>
    setChanged(old =>
      value ? [...old, key] : old.filter(field => field !== key),
    );
  return (
    <InventoryModal
      title={translateNative('native.fde252be8b3d69c3', { value0: String(ids.length) })}
      onClose={onClose}
    >
      <InventoryText>
        {translateNative('native.a25334bda94adade')}</InventoryText>
      {bulkFields
        .filter(
          ([key]) =>
            !spoolman ||
            ![
              'category',
              'low_stock_threshold_pct',
              'material_number',
            ].includes(key),
        )
        .map(([key, label]) => (
          <React.Fragment key={key}>
            <Toggle
              label={translateNative('native.a5c0d3fd5d7724a8', { value0: String(label) })}
              value={changed.includes(key)}
              onChange={value => toggle(key, value)}
            />
            {changed.includes(key) && (
              <TextField
                label={label}
                value={values[key] ?? ''}
                onChangeText={value =>
                  setValues(old => ({ ...old, [key]: value }))
                }
              />
            )}
          </React.Fragment>
        ))}
      <Toggle
        label={translateNative('native.000c1d4bd37afb2b')}
        value={changed.includes('location_id')}
        onChange={value => toggle('location_id', value)}
      />
      {changed.includes('location_id') && (
        <ChoiceField
          label={translateNative('native.3f0938415158756a')}
          value={values.location_id ?? ''}
          options={[
            { value: '', get label() { return translateNative('native.2d9e6cefc650193a'); } },
            ...(locations.data ?? []).map(row => ({
              value: text(row, 'id'),
              label: text(row, 'name'),
            })),
          ]}
          onChange={value => setValues(old => ({ ...old, location_id: value }))}
        />
      )}
      <PrimaryButton
        label={translateNative('native.0a2c18adbc9f7929')}
        loading={save.isPending}
        disabled={!changed.length}
        onPress={() => save.mutate()}
      />
    </InventoryModal>
  );
}
