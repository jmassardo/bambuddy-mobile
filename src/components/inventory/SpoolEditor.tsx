import { NativeTranslation, nativeLabelTuple, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventoryBackend,
  inventoryManagementApi as management,
  inventoryRequest,
} from '@/api/inventoryManagement';
import { profilesApi } from '@/api/profiles';
import type { InventoryRecord } from '@/types/api';
import { number, parseNumber, records, text } from '@/utils/inventory';
import {
  autoMatchSpoolPresets,
  kProfileMatches,
} from '@/utils/inventoryPresets';
import {
  InventoryButton as PrimaryButton,
  useInventoryToast as useToast,
  ChoiceField,
  Fields,
  InventoryModal,
  InventoryText,
  Toggle,
  inventoryControlStyles as styles,
} from './InventoryControls';
import { effectOptions, InventoryDirectory } from './InventoryDirectory';
import { SpoolSwatch } from './SpoolDetails';

const commonFields = [
  nativeLabelTuple(['brand', 'Brand']),
  nativeLabelTuple(['material', 'Material']),
  nativeLabelTuple(['subtype', 'Subtype']),
  nativeLabelTuple(['color_name', 'Color / filament name']),
  nativeLabelTuple(['rgba', 'Color RGBA (8 hex digits)']),
  nativeLabelTuple(['label_weight', 'Label net weight (g)']),
  nativeLabelTuple(['core_weight', 'Core weight (g)']),
  nativeLabelTuple(['weight_used', 'Used weight (g)']),
  nativeLabelTuple(['cost_per_kg', 'Actual cost per kg']),
  nativeLabelTuple(['note', 'Note']),
  nativeLabelTuple(['slicer_filament', 'Default slicer filament ID']),
  nativeLabelTuple(['slicer_filament_name', 'Default slicer filament name']),
] as const;
const internalFields = [
  nativeLabelTuple(['category', 'Category']),
  nativeLabelTuple(['material_number', 'Material number']),
  nativeLabelTuple(['low_stock_threshold_pct', 'Low-stock override % (blank inherits global)']),
  nativeLabelTuple(['nozzle_temp_min', 'Minimum nozzle temperature']),
  nativeLabelTuple(['nozzle_temp_max', 'Maximum nozzle temperature']),
  nativeLabelTuple(['extra_colors', 'Extra colors (comma-separated hex)']),
] as const;
const numeric = [
  'label_weight',
  'core_weight',
  'weight_used',
  'cost_per_kg',
  'nozzle_temp_min',
  'nozzle_temp_max',
  'low_stock_threshold_pct',
];
const requiredNumeric = ['label_weight', 'core_weight', 'weight_used'];

export function SpoolEditor({
  spool,
  spoolman,
  onClose,
  onSaved,
}: {
  spool: InventoryRecord | null;
  spoolman: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  useNativeLocale();
  const { showToast } = useToast();
  const client = useQueryClient();
  const backend = useLocalizedMemo(() => inventoryBackend(spoolman), [spoolman]);
  const id = number(spool, 'id');
  const [values, setValues] = useState<Record<string, string>>(() => ({
    material: 'PLA',
    label_weight: '1000',
    core_weight: '250',
    weight_used: '0',
    ...Object.fromEntries(
      Object.entries(spool ?? {}).map(([key, value]) => [
        key,
        value == null ? '' : String(value),
      ]),
    ),
    quantity: '1',
  }));
  const supplierLinksChanged = useRef(false);
  const [supplierLinks, setSupplierLinksState] = useState<InventoryRecord[]>(
    records(spool?.suppliers),
  );
  const setSupplierLinks: React.Dispatch<
    React.SetStateAction<InventoryRecord[]>
  > = change => {
    supplierLinksChanged.current = true;
    setSupplierLinksState(change);
  };
  const [presetLinks, setPresetLinks] = useState<InventoryRecord[]>([]);
  const [kLinks, setKLinks] = useState<InventoryRecord[]>([]);
  const [directory, setDirectory] = useState(false);
  const [colorScope, setColorScope] = useState('suggested');
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [unlinkedTags, setUnlinkedTags] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const userFields = useRef(new Set<string>());
  const set = (key: string, value: string) => {
    userFields.current.add(key);
    setValues(old => ({ ...old, [key]: value }));
  };
  useEffect(() => {
    AsyncStorage.getItem('inventory-recent-colors')
      .then(raw => {
        if (raw) setRecentColors(JSON.parse(raw) as string[]);
      })
      .catch(() => undefined);
  }, []);
  const catalog = useQuery({
    queryKey: ['inventoryDirectory', 'catalog'],
    queryFn: () => management.list('catalog'),
  });
  const colors = useQuery({
    queryKey: ['inventoryDirectory', 'colors'],
    queryFn: () => management.list('colors'),
  });
  const suppliers = useQuery({
    queryKey: ['inventoryDirectory', 'suppliers'],
    queryFn: () => management.list('suppliers'),
  });
  const locations = useQuery({
    queryKey: ['inventoryLocations'],
    queryFn: () => inventoryRequest<InventoryRecord[]>('/inventory/locations'),
  });
  const presets = useQuery({
    queryKey: ['inventoryPresets'],
    queryFn: () => management.presets(),
  });
  const filaments = useQuery({
    queryKey: ['spoolmanFilaments'],
    queryFn: () =>
      inventoryRequest<InventoryRecord[]>('/spoolman/inventory/filaments'),
    enabled: spoolman,
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: () => inventoryRequest<InventoryRecord[]>('/printers/'),
  });
  const associations = useQuery({
    queryKey: ['inventoryEditorAssociations', spoolman, id],
    queryFn: async () => ({
      presets: await backend.associations(id, 'filament-presets'),
      k: await backend.associations(id, 'k-profiles'),
    }),
    enabled: id > 0,
  });
  useEffect(() => {
    if (associations.data) {
      setPresetLinks(associations.data.presets);
      setKLinks(associations.data.k);
    }
  }, [associations.data]);
  const presetRows = useLocalizedMemo(
    () =>
      (presets.data?.rows ?? []).map(row => ({
        ...row,
        id: text(row, 'id'),
        name: text(row, 'name'),
        source: text(row, 'source'),
      })),
    [presets.data],
  );
  const choosePreset = (index: string) => {
    const row = presetRows[Number(index)];
    if (!row) {
      set('slicer_filament', '');
      set('slicer_filament_name', '');
      return;
    }
    const material =
      /\b(PAHT-CF|PA6-CF|PA6-GF|PLA-CF|PETG-CF|ASA-CF|ABS-GF|PPA-CF|PPA-GF|PET-CF|PPS-CF|PC-ABS|PCTG|PETG|PLA|ABS|ASA|TPU|PVA|HIPS|BVOH|PPS|PEEK|PEI|PC|PA)\b/i.exec(
        row.name,
      );
    const attrs: Record<string, string> = {
      material: text(row, 'filament_type') || material?.[1] || '',
      brand:
        text(row, 'filament_vendor') ||
        (material ? row.name.slice(0, material.index).trim() : ''),
      subtype: material
        ? row.name
            .slice(material.index + material[0].length)
            .split('@')[0]
            .trim()
        : '',
      rgba: text(row, 'default_filament_colour').replace('#', ''),
      nozzle_temp_min: text(row, 'nozzle_temp_min'),
      nozzle_temp_max: text(row, 'nozzle_temp_max'),
    };
    setValues(old => ({
      ...old,
      slicer_filament: row.id,
      slicer_filament_name: row.name,
      ...Object.fromEntries(
        Object.entries(attrs)
          .filter(
            ([key, value]) =>
              value && !userFields.current.has(key) && (!id || !old[key]),
          )
          .map(([key, value]) => [
            key,
            key === 'rgba' ? value.padEnd(8, 'F') : value,
          ]),
      ),
    }));
  };
  const save = useMutation({
    mutationFn: async () => {
      if (id && !associations.isSuccess)
        throw new Error(
          translateNative('native.2210e87b2d212eb1'),
        );
      const quantity = id
        ? 1
        : parseNumber(values.quantity, 'Quantity', 1, spoolman ? 50 : 100);
      if (!Number.isInteger(quantity))
        throw new Error(translateNative('native.1e9f20a7b292c74e'));
      if (!values.material?.trim() && !values.spoolman_filament_id)
        throw new Error(translateNative('native.cb4911caf2f1aff3'));
      const fields = [...commonFields, ...(!spoolman ? internalFields : [])]
        .map(([key]) => key)
        .filter(
          key => key !== 'weight_used' || !id || userFields.current.has(key),
        );
      const payload: InventoryRecord = Object.fromEntries(
        fields.map(key => [
          key,
          numeric.includes(key)
            ? parseNumber(
                values[key] ?? '',
                key,
                key === 'low_stock_threshold_pct' ? 1 : 0,
                key === 'low_stock_threshold_pct' ? 99 : Infinity,
                !requiredNumeric.includes(key),
              )
            : values[key]?.trim() || (spoolman ? '' : null),
        ]),
      );
      if (
        spoolman &&
        !userFields.current.has('core_weight') &&
        (!id || spool?.core_weight_is_inherited)
      )
        delete payload.core_weight;
      if (number(payload, 'weight_used') > number(payload, 'label_weight'))
        throw new Error(translateNative('native.7960c786b524fb27'));
      if (payload.rgba && !/^[a-f\d]{8}$/i.test(String(payload.rgba)))
        throw new Error(translateNative('native.08d66cb3ea484655'));
      if (!spoolman) {
        payload.effect_type = values.effect_type || null;
        payload.core_weight_catalog_id = values.core_weight_catalog_id
          ? Number(values.core_weight_catalog_id)
          : null;
      }
      payload.location_id = values.location_id
        ? Number(values.location_id)
        : null;
      payload.storage_location = values.location_id
        ? text(
            locations.data?.find(
              row => number(row, 'id') === Number(values.location_id),
            ),
            'name',
          )
        : '';
      if (spoolman && values.spoolman_filament_id && !id)
        payload.spoolman_filament_id = Number(values.spoolman_filament_id);
      if (!spoolman) {
        payload.tag_uid = Number(quantity) > 1 ? null : values.tag_uid || null;
        payload.tray_uuid =
          Number(quantity) > 1 ? null : values.tray_uuid || null;
      }
      const ids = savedIds.length
        ? savedIds
        : id
        ? [id]
        : (await backend.create(payload, quantity as number)).map(row =>
            number(row, 'id'),
          );
      setSavedIds(ids);
      if (id) await backend.update(id, payload);
      if (id && spoolman && unlinkedTags)
        await backend.update(id, { tag_uid: null, tray_uuid: null });
      for (const savedId of ids) {
        if (
          id ||
          supplierLinksChanged.current ||
          spool?.suppliers !== undefined
        )
          await backend.saveAssociations(
            savedId,
            'suppliers',
            supplierLinks.map(link => ({
              supplier_id: number(link, 'supplier_id'),
              supplier_article_number:
                text(link, 'supplier_article_number') || null,
              quoted_price_per_kg:
                text(link, 'quoted_price_per_kg') === ''
                  ? null
                  : parseNumber(
                      text(link, 'quoted_price_per_kg'),
                      translateNative('native.24d0203cab6a6da2'),
                    ),
              is_purchase_source: !!link.is_purchase_source,
            })),
          );
        await backend.saveAssociations(
          savedId,
          'filament-presets',
          presetLinks,
        );
        await backend.saveAssociations(savedId, 'k-profiles', kLinks);
        if (
          spoolman &&
          !unlinkedTags &&
          Number(quantity) === 1 &&
          (values.tag_uid || values.tray_uuid)
        ) {
          await backend.tag(savedId, {
            tag_uid: values.tag_uid || null,
            tray_uuid: values.tray_uuid || null,
          });
        }
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['inventorySpools'] });
      onSaved();
      onClose();
      showToast(translateNative('native.e0134d75121b52ab'), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const linked =
    spoolman &&
    (!!values.spoolman_filament_id || !!spool?.spoolman_filament_id || id > 0);
  const colorRows = (colors.data ?? []).filter(
    row =>
      colorScope === 'all' ||
      (colorScope === 'recent'
        ? recentColors.includes(text(row, 'id'))
        : colorScope === 'common'
        ? !!row.is_default
        : (!values.brand ||
            text(row, 'manufacturer').toLowerCase() ===
              values.brand.toLowerCase()) &&
          (!values.material ||
            !row.material ||
            text(row, 'material') === values.material)),
  );
  return (
    <InventoryModal
      title={id ? translateNative('native.9b70417d447578c8', { value0: String(id) }) : translateNative('native.4495be2bf1636181')}
      onClose={onClose}
    >
      {associations.isError && (
        <InventoryText>{associations.error.message}</InventoryText>
      )}
      {spoolman && !id && (
        <ChoiceField
          label={translateNative('native.26a1e709587af868')}
          value={values.spoolman_filament_id ?? ''}
          options={[
            { value: '', get label() { return translateNative('native.f928f57d84c464fc'); } },
            ...(filaments.data ?? []).map(row => ({
              value: text(row, 'id'),
              label: [
                text(row, 'id'),
                text(row, 'name'),
                text(row, 'material'),
                text(row.vendor as InventoryRecord, 'name'),
              ].join(' · '),
            })),
          ]}
          onChange={value => {
            set('spoolman_filament_id', value);
            const row = filaments.data?.find(
              entry => text(entry, 'id') === value,
            );
            if (row) {
              const material = text(row, 'material'),
                name = text(row, 'name');
              const rgba = text(row, 'color_hex').replace('#', '');
              setValues(old => ({
                ...old,
                spoolman_filament_id: value,
                material,
                subtype: name.startsWith(material)
                  ? name.slice(material.length).trim()
                  : name,
                brand: text(row.vendor as InventoryRecord, 'name'),
                rgba: (/^[a-f\d]{6}([a-f\d]{2})?$/i.test(rgba)
                  ? rgba
                  : '808080'
                ).padEnd(8, 'F'),
                color_name: text(row, 'color_name'),
                label_weight: text(row, 'weight', old.label_weight),
              }));
            }
          }}
        />
      )}
      {linked && (
        <InventoryText>
          {translateNative('native.9f8b7ca6d6a10d4a')}</InventoryText>
      )}
      {linked && (
        <InventoryText>
          {values.brand} · {values.material} · {values.subtype} ·{' '}
          {values.color_name} · {values.rgba}
        </InventoryText>
      )}
      <SpoolSwatch spool={values} />
      <ChoiceField
        label={translateNative('native.2088f456d92f508d')}
        value={String(
          presetRows.findIndex(
            row =>
              row.id === values.slicer_filament &&
              row.name === values.slicer_filament_name,
          ),
        )}
        options={[
          { value: '-1', get label() { return translateNative('native.1a0bb137947f702d'); } },
          ...presetRows.map((row, index) => ({
            value: String(index),
            label: `${row.source} · ${row.name} · ${row.id}`,
          })),
        ]}
        onChange={choosePreset}
      />
      {!!presets.data?.unavailable.length && (
        <InventoryText><NativeTranslation id="native.98bb16b804e57357" values={{ value0: (presets.data.unavailable.join(', ')) }} /></InventoryText>
      )}
      <InventoryText><NativeTranslation id="native.dc8844406daaa198" values={{ value0: (values.slicer_filament_name || 'None'), value1: (values.slicer_filament || 'None') }} /></InventoryText>
      {!linked && (
        <>
          <ChoiceField
            label={translateNative('native.08b67f2744f1ad8e')}
            value={colorScope}
            options={['suggested', 'recent', 'common', 'all'].map(value => ({
              value,
              label: value,
            }))}
            onChange={setColorScope}
          />
          <ChoiceField
            label={translateNative('native.1c2002592466ef8e')}
            value=""
            options={colorRows.map(row => ({
              value: text(row, 'id'),
              label: `${text(row, 'manufacturer')} · ${text(
                row,
                'material',
              )} · ${text(row, 'color_name')} ${text(row, 'hex_color')}`,
            }))}
            onChange={value => {
              const row = colors.data?.find(
                entry => text(entry, 'id') === value,
              );
              if (row) {
                setValues(old => ({
                  ...old,
                  color_name: text(row, 'color_name'),
                  rgba: text(row, 'hex_color').replace('#', '').padEnd(8, 'F'),
                  extra_colors: text(row, 'extra_colors'),
                  effect_type: text(row, 'effect_type'),
                }));
                const recent = [
                  value,
                  ...recentColors.filter(color => color !== value),
                ];
                setRecentColors(recent);
                AsyncStorage.setItem(
                  'inventory-recent-colors',
                  JSON.stringify(recent),
                ).catch(() => undefined);
              }
            }}
          />
        </>
      )}
      <Fields
        fields={commonFields.filter(
          ([key]) =>
            !linked ||
            !['brand', 'material', 'subtype', 'color_name', 'rgba'].includes(
              key,
            ),
        )}
        values={values}
        onChange={set}
      />
      {!spoolman && (
        <>
          <Fields fields={internalFields} values={values} onChange={set} />
          <ChoiceField
            label={translateNative('native.2f544b829f6b875a')}
            value={values.effect_type ?? ''}
            options={effectOptions}
            onChange={value => set('effect_type', value)}
          />
          <ChoiceField
            label={translateNative('native.d456a8d9d9f573b8')}
            value={values.core_weight_catalog_id ?? ''}
            options={[
              { value: '', get label() { return translateNative('native.a1123df2ce3979e4'); } },
              ...(catalog.data ?? []).map(row => ({
                value: text(row, 'id'),
                get label() { return translateNative('native.a1a66e2359fb5792', { value0: String(text(row, 'name')), value1: String(text(row, 'weight')) }); },
              })),
            ]}
            onChange={value => {
              set('core_weight_catalog_id', value);
              const row = catalog.data?.find(
                entry => text(entry, 'id') === value,
              );
              if (row) set('core_weight', text(row, 'weight'));
            }}
          />
        </>
      )}
      {spoolman && (
        <ChoiceField
          label={translateNative('native.8e0016b5e2710c50')}
          value=""
          options={(catalog.data ?? []).map(row => ({
            value: text(row, 'id'),
            get label() { return translateNative('native.a1a66e2359fb5792', { value0: String(text(row, 'name')), value1: String(text(row, 'weight')) }); },
          }))}
          onChange={value => {
            const row = catalog.data?.find(
              entry => text(entry, 'id') === value,
            );
            if (row) set('core_weight', text(row, 'weight'));
          }}
        />
      )}
      <ChoiceField
        label={translateNative('native.3f0938415158756a')}
        value={values.location_id ?? ''}
        options={[
          { value: '', get label() { return translateNative('common.none'); } },
          ...(locations.data ?? []).map(row => ({
            value: text(row, 'id'),
            label: text(row, 'name'),
          })),
        ]}
        onChange={value => set('location_id', value)}
      />
      <Fields
        fields={[
          ['tag_uid', translateNative('native.1c834a780c39afc6')],
          ['tray_uuid', translateNative('native.d23c3018764171ee')],
          ...(!id
            ? ([
                [
                  'quantity',
                  `Quantity (1–${
                    spoolman ? 50 : 100
                  }; unique tags omitted for multiple)`,
                ],
              ] as const)
            : []),
        ]}
        values={values}
        onChange={set}
      />
      {spoolman && id > 0 && (
        <Toggle
          label={translateNative('native.f72d89f6294f4d5b')}
          value={unlinkedTags}
          onChange={setUnlinkedTags}
        />
      )}
      <InventoryText>
        {translateNative('native.ae6b9660c2770c7a')}</InventoryText>
      <ChoiceField
        label={translateNative('native.e3df9c214b679fc7')}
        value=""
        options={(suppliers.data ?? [])
          .filter(
            row =>
              !supplierLinks.some(
                link => number(link, 'supplier_id') === number(row, 'id'),
              ),
          )
          .map(row => ({ value: text(row, 'id'), label: text(row, 'name') }))}
        onChange={value =>
          setSupplierLinks(old => [
            ...old,
            {
              supplier_id: Number(value),
              supplier_name: text(
                suppliers.data?.find(row => text(row, 'id') === value),
                'name',
              ),
            },
          ])
        }
      />
      <PrimaryButton
        label={translateNative('native.012590e6822b3883')}
        variant="secondary"
        onPress={() => setDirectory(true)}
      />
      {supplierLinks.map((link, index) => (
        <View key={number(link, 'supplier_id')} style={styles.group}>
          <InventoryText>
            {text(
              link,
              'supplier_name',
              `Supplier #${number(link, 'supplier_id')}`,
            )}
          </InventoryText>
          <Fields
            fields={[
              nativeLabelTuple(['supplier_article_number', 'native.76f63d3b56c9344c']),
              nativeLabelTuple(['quoted_price_per_kg', 'native.f9061c219c90bec5']),
            ]}
            values={{
              supplier_article_number: text(link, 'supplier_article_number'),
              quoted_price_per_kg: text(link, 'quoted_price_per_kg'),
            }}
            onChange={(key, value) =>
              setSupplierLinks(old =>
                old.map((row, i) =>
                  i === index ? { ...row, [key]: value } : row,
                ),
              )
            }
          />
          <Toggle
            label={translateNative('native.3dbf4108564262bb')}
            value={!!link.is_purchase_source}
            onChange={value =>
              setSupplierLinks(old =>
                old.map((row, i) => ({
                  ...row,
                  is_purchase_source: i === index ? value : false,
                })),
              )
            }
          />
          <PrimaryButton
            label={translateNative('native.3a4d60485cf8c77c')}
            variant="secondary"
            onPress={() =>
              setSupplierLinks(old => old.filter((_row, i) => i !== index))
            }
          />
        </View>
      ))}
      <SpoolPrinterAssociations
        spool={values}
        printers={printers.data ?? []}
        presetRows={presetRows}
        presetLinks={presetLinks}
        setPresetLinks={setPresetLinks}
        kLinks={kLinks}
        setKLinks={setKLinks}
      />
      <PrimaryButton
        label={
          savedIds.length && !id
            ? translateNative('native.232a8d1a959bb52a')
            : translateNative('common.save')
        }
        loading={save.isPending}
        disabled={id > 0 && !associations.isSuccess}
        onPress={() => save.mutate()}
      />
      {directory && (
        <InventoryDirectory
          kind="suppliers"
          onClose={() => setDirectory(false)}
        />
      )}
    </InventoryModal>
  );
}

function SpoolPrinterAssociations({
  spool,
  printers,
  presetRows,
  presetLinks,
  setPresetLinks,
  kLinks,
  setKLinks,
}: {
  spool: InventoryRecord;
  printers: InventoryRecord[];
  presetRows: { id: string; name: string; source: string }[];
  presetLinks: InventoryRecord[];
  setPresetLinks: React.Dispatch<React.SetStateAction<InventoryRecord[]>>;
  kLinks: InventoryRecord[];
  setKLinks: React.Dispatch<React.SetStateAction<InventoryRecord[]>>;
}) {
  useNativeLocale();
  const [printerId, setPrinterId] = useState('');
  const [diameter, setDiameter] = useState('0.4');
  const [extruder, setExtruder] = useState('0');
  const [flow, setFlow] = useState('');
  const printer = printers.find(row => text(row, 'id') === printerId);
  const model = text(printer, 'model');
  const modelRegistry = useQuery({
    queryKey: ['inventoryPrinterModels'],
    queryFn: () =>
      inventoryRequest<Record<string, string>>('/slicer/printer-models'),
  });
  const calibrations = useQuery({
    queryKey: ['inventoryCalibrations', printerId, diameter],
    queryFn: () => profilesApi.getKProfiles(Number(printerId), diameter),
    enabled: !!printerId && !!diameter,
  });
  const calibrationRows = records(
    (calibrations.data as unknown as InventoryRecord)?.profiles ??
      (calibrations.data as unknown as InventoryRecord)?.kprofiles ??
      calibrations.data,
  ).filter(row => {
    const profileFlow = text(row, 'nozzle_id').slice(0, 2).toUpperCase();
    return (
      kProfileMatches(row, spool) &&
      text(row, 'nozzle_diameter', diameter) === diameter &&
      number(row, 'extruder_id', Number(extruder)) === Number(extruder) &&
      (!['HH', 'HS'].includes(profileFlow) || !flow || profileFlow === flow)
    );
  });
  const presetLink = presetLinks.find(
    row =>
      text(row, 'printer_model') === model &&
      text(row, 'nozzle_diameter') === diameter,
  );
  const kLink = kLinks.find(
    row =>
      text(row, 'printer_id') === printerId &&
      text(row, 'nozzle_diameter') === diameter &&
      number(row, 'extruder') === Number(extruder) &&
      text(row, 'nozzle_type') === flow,
  );
  const replacePreset = (row?: InventoryRecord) =>
    setPresetLinks(old => [
      ...old.filter(
        entry =>
          text(entry, 'printer_model') !== model ||
          text(entry, 'nozzle_diameter') !== diameter,
      ),
      ...(row ? [row] : []),
    ]);
  const replaceK = (row?: InventoryRecord) =>
    setKLinks(old => [
      ...old.filter(
        entry =>
          !(
            text(entry, 'printer_id') === printerId &&
            text(entry, 'nozzle_diameter') === diameter &&
            number(entry, 'extruder') === Number(extruder) &&
            text(entry, 'nozzle_type') ===
              (row ? text(row, 'nozzle_type') : flow)
          ),
      ),
      ...(row ? [row] : []),
    ]);
  return (
    <>
      <InventoryText>
        {translateNative('native.c8060b4be1c07323')}</InventoryText>
      <ChoiceField
        label={translateNative('screen.printer')}
        value={printerId}
        options={printers.map(row => ({
          value: text(row, 'id'),
          label: `${text(row, 'name')} · ${text(row, 'model')}`,
        }))}
        onChange={setPrinterId}
      />
      {!!printerId && (
        <>
          <ChoiceField
            label={translateNative('native.7f7c65655e142424')}
            value={diameter}
            options={[
              { value: '', get label() { return translateNative('native.14f2f51930b5cba2'); } },
              ...['0.2', '0.4', '0.6', '0.8', '1.0'].map(value => ({
                value,
                label: value,
              })),
            ]}
            onChange={setDiameter}
          />
          {model ? (
            <ChoiceField
              label={translateNative('native.65b780ba957ab843')}
              value={
                presetLink
                  ? `${text(presetLink, 'slicer_filament')}::${text(
                      presetLink,
                      'slicer_filament_name',
                    )}`
                  : ''
              }
              options={[
                {
                  value: '',
                  get label() { return translateNative('native.5a18adccdfc35f97'); },
                },
                ...presetRows.map(row => ({
                  value: `${row.id}::${row.name}`,
                  label: `${row.source} · ${row.name}`,
                })),
              ]}
              onChange={value => {
                const row = presetRows.find(
                  entry => `${entry.id}::${entry.name}` === value,
                );
                replacePreset(
                  row
                    ? {
                        printer_model: model,
                        nozzle_diameter: diameter,
                        slicer_filament: row.id,
                        slicer_filament_name: row.name,
                      }
                    : undefined,
                );
              }}
            />
          ) : (
            <InventoryText>
              {translateNative('native.858de72935e84eb9')}</InventoryText>
          )}
          <PrimaryButton
            label={translateNative('native.e4f743f4e8197ddb')}
            variant="secondary"
            onPress={() => {
              const matches = autoMatchSpoolPresets(
                text(spool, 'slicer_filament_name'),
                [...new Set(printers.map(row => text(row, 'model')))],
                presetRows,
                modelRegistry.data ?? {},
              );
              setPresetLinks(old => [
                ...old.filter(
                  row =>
                    !matches.some(
                      match =>
                        match.printer_model === row.printer_model &&
                        match.nozzle_diameter === row.nozzle_diameter,
                    ),
                ),
                ...matches,
              ]);
            }}
          />
          {!!diameter && (
            <>
              <ChoiceField
                label={translateNative('native.d059b480b1077242')}
                value={extruder}
                options={(number(printer, 'nozzle_count', 1) > 1
                  ? ['1', '0']
                  : ['0']
                ).map(value => ({
                  value,
                  label: value === '1' ? translateNative('native.e9ae2610ebae5858') : translateNative('native.b1c603a0ccc0fa4e'),
                }))}
                onChange={setExtruder}
              />
              <ChoiceField
                label={translateNative('native.ea96303c4354d82b')}
                value={flow}
                options={[
                  { value: '', get label() { return translateNative('native.b0452e8420109804'); } },
                  { value: 'HS', get label() { return translateNative('native.7239d2283cbaffae'); } },
                  { value: 'HH', get label() { return translateNative('native.ab0f152ec460e157'); } },
                ]}
                onChange={setFlow}
              />
              {calibrations.isError && (
                <InventoryText>{calibrations.error.message}</InventoryText>
              )}
              <ChoiceField
                label={translateNative('native.1401ba95923f6837')}
                value={kLink ? text(kLink, 'cali_idx') : ''}
                options={[
                  { value: '', get label() { return translateNative('native.432a9cb519e46302'); } },
                  ...calibrationRows.map(row => ({
                    value: text(row, 'cali_idx', text(row, 'slot_id')),
                    get label() { return translateNative('native.711b4eb8a9753ed6', { value0: String(text(row, 'name')), value1: String(text(
                      row,
                      'k_value',
                      text(row, 'k'),
                    )) }); },
                  })),
                ]}
                onChange={value => {
                  const row = calibrationRows.find(
                    entry =>
                      text(entry, 'cali_idx', text(entry, 'slot_id')) === value,
                  );
                  const rowFlow = text(row, 'nozzle_id')
                    .slice(0, 2)
                    .toUpperCase();
                  const chosenFlow = ['HH', 'HS'].includes(rowFlow)
                    ? rowFlow
                    : flow;
                  replaceK(
                    row
                      ? {
                          printer_id: Number(printerId),
                          extruder: Number(extruder),
                          nozzle_diameter: diameter,
                          nozzle_type: chosenFlow || null,
                          k_value: number(row, 'k_value', number(row, 'k')),
                          name: text(row, 'name'),
                          cali_idx: Number(value),
                          setting_id: row.setting_id ?? null,
                        }
                      : undefined,
                  );
                  if (row && chosenFlow) setFlow(chosenFlow);
                }}
              />
              <InventoryText><NativeTranslation id="native.865a68e1e03e6cb7" values={{ value0: (presetLinks.length), value1: (kLinks.length) }} /></InventoryText>
            </>
          )}
        </>
      )}
    </>
  );
}
