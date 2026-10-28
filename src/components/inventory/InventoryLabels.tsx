import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from '@tanstack/react-query';
import { inventoryBackend } from '@/api/inventoryManagement';
import { shareBlob } from '@/utils/share';

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
  get brand() { return translateNative('native.b8b1f93c63349f49'); },
  get material() { return translateNative('native.685bc64c252ef17e'); },
  get hex() { return translateNative('native.96c0ba2839ca89bd'); },
  get name() { return translateNative('native.10e67d0179cbc398'); },
  get location() { return translateNative('native.3f0938415158756a'); },
  get material_number() { return translateNative('native.32049a3126d997d6'); },
  get temps() { return translateNative('native.55c4b8dd107346de'); },
  get weight() { return translateNative('native.b724a949db084ad6'); },
  get note() { return translateNative('native.9f7a213739bc761c'); },
  get added() { return translateNative('native.fc23b528221fe7a3'); },
  get qr() { return translateNative('native.a766fd8f2fb213f0'); },
  get spool_id() { return translateNative('native.014dc4390592403a'); },
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
    reader.onerror = () => reject(new Error(translateNative('native.71f01e00cefb8030')));
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
  useNativeLocale();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const backend = useLocalizedMemo(() => inventoryBackend(spoolman), [spoolman]);
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
        throw new Error(translateNative('native.99d2b6e68a15ecc3'));
      const start = parseNumber(
        position,
        translateNative('native.f8c66cd145549501'),
        1,
        labelCapacity(options.template),
      );
      if (!Number.isInteger(start))
        throw new Error(translateNative('native.aaf719f2acc966b8'));
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
    <InventoryModal title={translateNative('native.0a29ab769393c3de')} onClose={onClose}>
      <ChoiceField
        label={translateNative('native.e3fa620a4cce5469')}
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
        label={translateNative('native.92f498b3788bffdf')}
        variant="secondary"
        onPress={() => setOptions(old => ({ ...old, fields: defaults }))}
      />
      <Toggle
        label={translateNative('native.438603c512cd64bc')}
        value={options.monochrome}
        onChange={value => setOptions(old => ({ ...old, monochrome: value }))}
      />
      {labelCapacity(options.template) > 1 && (
        <TextField
          label={translateNative('native.7e87e9a79e7064ae', { value0: String(labelCapacity(
            options.template,
          )) })}
          value={position}
          onChangeText={setPosition}
          keyboardType="number-pad"
        />
      )}
      <ChoiceField
        label={translateNative('native.3199e0a7bf3e8b01')}
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
          label={translateNative('native.7491daa12ddd9343')}
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
      <InventoryText><NativeTranslation id="native.f0be01a53f4ec632" values={{ value0: (ids.length) }} /></InventoryText>
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
        placeholder={translateNative('native.4ee99a3fac093034')}
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
        label={translateNative('native.b47c6ac3c97f8c66')}
        loading={generate.isPending}
        disabled={!ids.length || !loaded}
        onPress={() => generate.mutate()}
      />
    </InventoryModal>
  );
}
const styles = StyleSheet.create({ preview: { width: '100%', height: 230 } });
