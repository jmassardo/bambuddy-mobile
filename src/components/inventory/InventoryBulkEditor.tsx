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
  ['brand', 'Brand'],
  ['material', 'Material'],
  ['subtype', 'Subtype'],
  ['color_name', 'Color name'],
  ['rgba', 'Color RGBA'],
  ['slicer_filament_name', 'Slicer filament name'],
  ['slicer_filament', 'Slicer filament ID'],
  ['cost_per_kg', 'Actual cost per kg'],
  ['note', 'Note'],
  ['label_weight', 'Label weight (g)'],
  ['core_weight', 'Core weight (g)'],
  ['category', 'Category'],
  ['low_stock_threshold_pct', 'Low-stock threshold override %'],
  ['material_number', 'Material number'],
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
        throw new Error('Material cannot be blank.');
      for (const key of ['label_weight', 'core_weight']) {
        if (changed.includes(key) && update[key] === null)
          throw new Error(`${key} cannot be blank.`);
      }
      if ('label_weight' in update && Number(update.label_weight) < 1)
        throw new Error('Label weight must be positive.');
      if (spoolman && update.cost_per_kg === null)
        throw new Error(
          'Spoolman cannot clear a price through this endpoint. Enter a price, including zero, or leave this field unchecked.',
        );
      if (spoolman)
        Object.entries(update).forEach(([key, value]) => {
          if (value === null && !numeric.includes(key)) update[key] = '';
        });
      if (update.rgba && !/^[a-f\d]{8}$/i.test(String(update.rgba)))
        throw new Error('RGBA must contain 8 hex digits.');
      if (update.low_stock_threshold_pct === 0)
        throw new Error(
          'Threshold must be between 1 and 99, or blank to inherit.',
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
      showToast('Selected spools updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const toggle = (key: string, value: boolean) =>
    setChanged(old =>
      value ? [...old, key] : old.filter(field => field !== key),
    );
  return (
    <InventoryModal
      title={`Edit ${ids.length} selected spools`}
      onClose={onClose}
    >
      <InventoryText>
        Only checked fields are patched. Check a nullable field and leave it
        blank to clear it.
      </InventoryText>
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
              label={`Change ${label}`}
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
        label="Change storage location"
        value={changed.includes('location_id')}
        onChange={value => toggle('location_id', value)}
      />
      {changed.includes('location_id') && (
        <ChoiceField
          label="Storage location"
          value={values.location_id ?? ''}
          options={[
            { value: '', label: 'None / clear' },
            ...(locations.data ?? []).map(row => ({
              value: text(row, 'id'),
              label: text(row, 'name'),
            })),
          ]}
          onChange={value => setValues(old => ({ ...old, location_id: value }))}
        />
      )}
      <PrimaryButton
        label="Apply checked fields"
        loading={save.isPending}
        disabled={!changed.length}
        onPress={() => save.mutate()}
      />
    </InventoryModal>
  );
}
