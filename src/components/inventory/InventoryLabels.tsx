import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from '@tanstack/react-query';
import { inventoryBackend } from '@/api/inventoryManagement';
import { shareBlob } from '@/utils/share';
import { useTranslation } from '@/i18n';
import {
  number,
  parseNumber,
  spoolMatchesQuery,
  text,
} from '@/utils/inventory';
import type { InventoryLabelOptions, InventoryRecord } from '@/types/api';
import {
  InventoryButton as PrimaryButton,
  InventoryField as TextField,
  InventorySearch as SearchBar,
  useInventoryToast as useToast,
  ChoiceField,
  InventoryModal,
  InventoryText,
  Toggle,
} from './InventoryControls';

const fieldLabels = {
  brand: 'Brand',
  material: 'Material and subtype',
  hex: 'Colour code',
  name: 'Colour / filament name',
  location: 'Storage location',
  material_number: 'Material number',
  temps: 'Nozzle temperatures',
  weight: 'Net weight',
  note: 'Note',
  added: 'Date added',
  qr: 'QR code',
  spool_id: 'Spool ID',
};
const defaults = [
  'brand',
  'material',
  'hex',
  'name',
  'location',
  'qr',
  'spool_id',
];
const templates = [
  'ams_holder_74x33',
  'ams_holder_75x55',
  'box_40x30',
  'box_62x29',
  'avery_5160',
  'avery_l7160',
];
export const labelCapacity = (template: string) =>
  template === 'avery_5160' ? 30 : template === 'avery_l7160' ? 21 : 1;
const blobUri = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to render preview.'));
    reader.readAsDataURL(blob);
  });
export function InventoryLabels({
  spools,
  initialIds,
  spoolman,
  onClose,
}: {
  spools: InventoryRecord[];
  initialIds: number[];
  spoolman: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const backend = useMemo(() => inventoryBackend(spoolman), [spoolman]);
  const [ids, setIds] = useState(initialIds);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<InventoryLabelOptions>({
    spool_ids: [],
    template: templates[0],
    fields: defaults,
    monochrome: false,
    starting_position: 1,
    format: 'pdf',
    dpi: 300,
  });
  const [position, setPosition] = useState('1');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('inventory-label-options')
      .then(raw => {
        if (raw) {
          const saved = JSON.parse(raw) as InventoryLabelOptions;
          if (
            templates.includes(saved.template) &&
            Array.isArray(saved.fields)
          ) {
            setOptions({
              ...saved,
              fields: saved.fields.filter(key => key in fieldLabels),
              spool_ids: [],
            });
            setPosition(String(saved.starting_position || 1));
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  const preview = useQuery({
    queryKey: [
      'inventoryLabelPreview',
      spoolman,
      ids[0],
      options.template,
      options.fields,
      options.monochrome,
    ],
    queryFn: async () =>
      blobUri(await backend.preview({ ...options, spool_id: ids[0] })),
    enabled: loaded && ids.length > 0,
  });
  const generate = useMutation({
    mutationFn: async () => {
      if (!ids.length || ids.length > 500)
        throw new Error('Choose between 1 and 500 spools per label job.');
      const start = parseNumber(
        position,
        'Starting position',
        1,
        labelCapacity(options.template),
      );
      if (!Number.isInteger(start))
        throw new Error('Starting position must be a whole number.');
      const request = {
        ...options,
        spool_ids: ids,
        starting_position: start as number,
      };
      const blob = await backend.labels(request);
      await AsyncStorage.setItem(
        'inventory-label-options',
        JSON.stringify(request),
      );
      await shareBlob(blob, `spool-labels.${options.format}`);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <InventoryModal title="Compose spool labels" onClose={onClose}>
      <ChoiceField
        label="Template"
        value={options.template}
        options={templates.map(value => ({ value, label: value }))}
        onChange={value => {
          setOptions(old => ({ ...old, template: value }));
          setPosition('1');
        }}
      />
      {Object.entries(fieldLabels).map(([field, label]) => (
        <Toggle
          key={field}
          label={label}
          value={options.fields.includes(field)}
          onChange={value =>
            setOptions(old => ({
              ...old,
              fields: value
                ? [...old.fields, field]
                : old.fields.filter(key => key !== field),
            }))
          }
        />
      ))}
      <PrimaryButton
        label="Reset content fields"
        variant="secondary"
        onPress={() => setOptions(old => ({ ...old, fields: defaults }))}
      />
      <Toggle
        label="Monochrome"
        value={options.monochrome}
        onChange={value => setOptions(old => ({ ...old, monochrome: value }))}
      />
      {labelCapacity(options.template) > 1 && (
        <TextField
          label={`Sheet starting position (1–${labelCapacity(
            options.template,
          )})`}
          value={position}
          onChangeText={setPosition}
          keyboardType="number-pad"
        />
      )}
      <ChoiceField
        label="Output"
        value={options.format}
        options={['pdf', 'png'].map(value => ({
          value,
          label: value.toUpperCase(),
        }))}
        onChange={value =>
          setOptions(old => ({ ...old, format: value as 'pdf' | 'png' }))
        }
      />
      {options.format === 'png' && (
        <ChoiceField
          label="PNG DPI"
          value={String(options.dpi)}
          options={[203, 300, 600].map(value => ({
            value: String(value),
            label: String(value),
          }))}
          onChange={value =>
            setOptions(old => ({
              ...old,
              dpi: Number(value) as 203 | 300 | 600,
            }))
          }
        />
      )}
      <InventoryText>Live preview · {ids.length} spools selected</InventoryText>
      {preview.data && (
        <Image
          accessibilityLabel={t('inventory.labelPreview', {
            defaultValue: 'Label preview',
          })}
          source={{ uri: preview.data }}
          style={styles.preview}
          resizeMode="contain"
        />
      )}
      {preview.isError && (
        <InventoryText>{preview.error.message}</InventoryText>
      )}
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Refine spool selection"
      />
      {spools
        .filter(row => spoolMatchesQuery(row, search))
        .map(row => (
          <Toggle
            key={number(row, 'id')}
            label={`#${number(row, 'id')} ${text(row, 'brand')} ${text(
              row,
              'material',
            )} ${text(row, 'color_name')}`}
            value={ids.includes(number(row, 'id'))}
            onChange={value =>
              setIds(old =>
                value
                  ? [...old, number(row, 'id')]
                  : old.filter(id => id !== number(row, 'id')),
              )
            }
          />
        ))}
      <PrimaryButton
        label="Generate and share / print"
        loading={generate.isPending}
        disabled={!ids.length || !loaded}
        onPress={() => generate.mutate()}
      />
    </InventoryModal>
  );
}
const styles = StyleSheet.create({ preview: { width: '100%', height: 230 } });
