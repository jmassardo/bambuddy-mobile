import { NativeTranslation, nativeLabelTuple, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Pattern,
  Rect,
  Stop,
} from 'react-native-svg';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventoryBackend,
  inventoryManagementApi as management,
  inventoryRequest,
} from '@/api/inventoryManagement';
import { useAuth } from '@/contexts/AuthContext';

import type { InventoryRecord } from '@/types/api';
import { number, parseNumber, remaining, text } from '@/utils/inventory';
import { formatCurrency, formatDateTime } from '@/utils/data';
import {
  InventoryButton as PrimaryButton,
  InventoryConfirm as ConfirmModal,
  InventorySection as SectionCard,
  useInventoryToast as useToast,
  ChoiceField,
  Fields,
  InventoryModal,
  InventoryText,
} from './InventoryControls';
import { LocationEnvironmentReadings } from './InventoryEnvironment';

function cssColor(raw: string) {
  const clean = raw.replace('#', '');
  return /^[a-f\d]{6}([a-f\d]{2})?$/i.test(clean) ? `#${clean}` : '#808080';
}
export function SpoolSwatch({ spool }: { spool: InventoryRecord }) {
  useNativeLocale();
  const { t } = useTranslation();
  const colors = [
    text(spool, 'rgba', '808080FF'),
    ...text(spool, 'extra_colors').split(',').filter(Boolean),
  ];
  const effect = text(spool, 'effect_type');
  const id = `spool${number(spool, 'id')}`;
  return (
    <View
      style={styles.swatch}
      accessibilityLabel={t('inventory.colorDescription', {
        defaultValue: 'Color {{name}} {{effect}} {{colors}}',
        name: text(spool, 'color_name'),
        effect,
        colors: colors.join(', '),
      })}
    >
      <Svg width={120} height={30}>
        <Defs>
          <Pattern
            id={`${id}check`}
            width={10}
            height={10}
            patternUnits="userSpaceOnUse"
          >
            <Rect width={10} height={10} fill="#ffffff" />
            <Rect width={5} height={5} fill="#aaaaaa" />
            <Rect x={5} y={5} width={5} height={5} fill="#aaaaaa" />
          </Pattern>
          <LinearGradient id={`${id}gradient`} x1="0" x2="1" y1="0" y2="0">
            {colors.map((color, index) => (
              <Stop
                key={`${color}${index}`}
                offset={colors.length > 1 ? index / (colors.length - 1) : 0}
                stopColor={cssColor(color)}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width={120} height={30} fill={`url(#${id}check)`} />
        {effect === 'dual-color' || effect === 'tri-color' ? (
          colors.map((color, index) => (
            <Rect
              key={`${color}${index}`}
              x={(index * 120) / colors.length}
              width={120 / colors.length}
              height={30}
              fill={cssColor(color)}
            />
          ))
        ) : (
          <Rect width={120} height={30} fill={`url(#${id}gradient)`} />
        )}
        {['sparkle', 'galaxy', 'marble', 'wood', 'glow'].includes(effect) &&
          Array.from({ length: 10 }, (_value, index) => (
            <Circle
              key={index}
              cx={index * 12 + 5}
              cy={(index % 3) * 9 + 5}
              r={effect === 'marble' ? 3 : 1}
              fill={effect === 'wood' ? '#4a251366' : '#ffffff99'}
            />
          ))}
      </Svg>
      {!!effect && <InventoryText>{effect}</InventoryText>}
    </View>
  );
}
export function SpoolDetails({
  spool,
  spoolman,
  assignments,
  onClose,
  onEdit,
  onCopy,
  onLabels,
  onChanged,
}: {
  spool: InventoryRecord;
  spoolman: boolean;
  assignments: InventoryRecord[];
  onClose: () => void;
  onEdit: (spool: InventoryRecord) => void;
  onCopy: (spool: InventoryRecord) => void;
  onLabels: (ids: number[]) => void;
  onChanged: () => Promise<void>;
}) {
  useNativeLocale();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('inventory:update');
  const canDelete = hasPermission('inventory:delete');
  const client = useQueryClient();
  const id = number(spool, 'id');
  const backend = useLocalizedMemo(() => inventoryBackend(spoolman), [spoolman]);
  const detail = useQuery({
    queryKey: ['inventorySpool', spoolman, id],
    queryFn: () => backend.spool(id),
  });
  const usage = useQuery({
    queryKey: ['inventorySpoolUsage', id],
    enabled: !spoolman,
    queryFn: async () => {
      let limit = 100;
      for (;;) {
        const rows = await inventoryRequest<InventoryRecord[]>(
          `/inventory/spools/${id}/usage?limit=${limit}`,
        );
        if (rows.length < limit) return rows;
        limit *= 2;
      }
    },
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: () => inventoryRequest<InventoryRecord[]>('/printers/'),
  });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [assign, setAssign] = useState(false);
  const [target, setTarget] = useState<Record<string, string>>({
    printer_id: '',
    ams_id: '0',
    tray_id: '0',
  });
  const row = detail.data ?? spool;
  const assignment = assignments.find(
    entry => number(entry, spoolman ? 'spoolman_spool_id' : 'spool_id') === id,
  );
  const mutation = useMutation({
    mutationFn: async (operation: string) => {
      if (operation === 'scale')
        return backend.reconcile(id, number(row, 'last_scale_weight'));
      if (operation === 'usage') return management.clearUsage(id);
      if (operation === 'empty')
        return backend.update(id, { weight_used: number(row, 'label_weight') });
      if (operation === 'unassign' && assignment) {
        return inventoryRequest(
          spoolman
            ? `/spoolman/inventory/slot-assignments/${id}`
            : `/inventory/assignments/${number(
                assignment,
                'printer_id',
              )}/${number(assignment, 'ams_id')}/${number(
                assignment,
                'tray_id',
              )}`,
          'DELETE',
        );
      }
      if (operation === 'assign')
        return inventoryRequest(
          spoolman
            ? '/spoolman/inventory/slot-assignments'
            : '/inventory/assignments',
          'POST',
          {
            [spoolman ? 'spoolman_spool_id' : 'spool_id']: id,
            printer_id: parseNumber(target.printer_id, 'Printer', 1),
            ams_id: parseNumber(target.ams_id, translateNative('native.a66abd595876fb98'), 0, 255),
            tray_id: parseNumber(target.tray_id, translateNative('native.c416d6e6d5881867'), 0, 3),
          },
        );
      return inventoryRequest(
        `${backend.root}/spools/${id}${
          operation === 'delete' ? '' : `/${operation}`
        }`,
        operation === 'delete' ? 'DELETE' : 'POST',
      );
    },
    onSuccess: async (_result, operation) => {
      await onChanged();
      await client.invalidateQueries({ queryKey: ['inventorySpoolUsage', id] });
      setConfirm(null);
      setAssign(false);
      if (operation === 'delete') onClose();
      showToast(translateNative('native.59ecb8f28d814a80'), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const scale = row.last_scale_weight;
  const trackedGross = remaining(row) + number(row, 'core_weight');
  const discrepancy = number(row, 'last_scale_weight') - trackedGross;
  const matches =
    number(row, 'last_scale_weight') < number(row, 'core_weight') ||
    Math.abs(discrepancy) <= 50;
  return (
    <InventoryModal title={translateNative('native.695cc238a31cecd5', { value0: String(id) })} onClose={onClose}>
      {detail.isError && <InventoryText>{detail.error.message}</InventoryText>}
      <SpoolSwatch spool={row} />
      {[
        'brand',
        'material',
        'subtype',
        'color_name',
        'rgba',
        'extra_colors',
        'effect_type',
        'category',
        'material_number',
        'core_weight_catalog_id',
        'label_weight',
        'core_weight',
        'cost_per_kg',
        'storage_location',
        'low_stock_threshold_pct',
        'slicer_filament',
        'slicer_filament_name',
        'note',
        'created_at',
        'updated_at',
        'data_origin',
        'tag_type',
        'tag_uid',
        'tray_uuid',
        'added_full',
        'encode_time',
        'last_used',
        'last_weighed_at',
      ].map(key => (
        <InventoryText key={key}>
          {key.replace(/_/g, ' ')}:{' '}
          {row[key] == null
            ? '—'
            : key === 'cost_per_kg'
            ? formatCurrency(row[key])
            : [
                'created_at',
                'updated_at',
                'encode_time',
                'last_used',
                'last_weighed_at',
              ].includes(key)
            ? formatDateTime(row[key])
            : text(row, key, '—')}
        </InventoryText>
      ))}
      <InventoryText><NativeTranslation id="native.72bb4bcfc0a25f7a" values={{ value0: (Math.round(remaining(row))), value1: (Math.round(trackedGross)), value2: (Math.round(
          Math.max(
            0,
            number(row, 'weight_used') - number(row, 'weight_used_baseline'),
          ),
        )) }} /></InventoryText>
      <LocationEnvironmentReadings locationId={number(row, 'location_id')} />
      {scale != null && (
        <SectionCard title={translateNative('native.c2c53f83fdd62cb1')}>
          <InventoryText><NativeTranslation id="native.40cd37641d1ec766" values={{ value0: (number(row, 'last_scale_weight')), value1: (Math.max(
              0,
              number(row, 'last_scale_weight') - number(row, 'core_weight'),
            )), value2: (Math.round(trackedGross)), value3: (Math.round(discrepancy)) }} /></InventoryText>
          <InventoryText>
            {matches
              ? translateNative('native.90544d691c37aa8d')
              : translateNative('native.2b812694885775a6')}
          </InventoryText>
          {canWrite && (
            <PrimaryButton
              label={translateNative('native.9dd4a7e9fcca3648')}
              onPress={() => setConfirm('scale')}
            />
          )}
        </SectionCard>
      )}
      {assignment && (
        <InventoryText><NativeTranslation id="native.0142f6a9b1b2a8f1" values={{ value0: (text(assignment, 'printer_name')), value1: (number(assignment, 'ams_id')), value2: (number(assignment, 'tray_id')) }} /></InventoryText>
      )}
      {canWrite && (
        <>
          <PrimaryButton label={translateNative('native.060e4f38051c717e')} onPress={() => onEdit(row)} />
          <PrimaryButton
            label={translateNative('native.eae86bd2cb264031')}
            variant="secondary"
            onPress={() => onCopy(row)}
          />
          <PrimaryButton
            label={translateNative('native.b61d3e270ecb92b1')}
            variant="secondary"
            onPress={() => setAssign(true)}
          />
          {!!assignment && (
            <PrimaryButton
              label={translateNative('native.6407f3c05d1f3252')}
              variant="secondary"
              onPress={() => setConfirm('unassign')}
            />
          )}
          <PrimaryButton
            label={translateNative('native.ff0eb6a21af62944')}
            variant="secondary"
            onPress={() => setConfirm('reset-consumed-counter')}
          />
          <PrimaryButton
            label={translateNative('native.9fe9538bfc156f23')}
            variant="secondary"
            onPress={() => setConfirm('empty')}
          />
          <PrimaryButton
            label={row.archived_at ? translateNative('native.3d4ea31b4516a8ec') : translateNative('screen.archive')}
            variant="secondary"
            onPress={() => setConfirm(row.archived_at ? 'restore' : 'archive')}
          />
        </>
      )}
      <PrimaryButton
        label={translateNative('native.09deced065cf52b9')}
        variant="secondary"
        onPress={() => onLabels([id])}
      />
      {canDelete && (
        <PrimaryButton
          label={translateNative('native.a5daeca144d82220')}
          variant="danger"
          onPress={() => setConfirm('delete')}
        />
      )}
      {!spoolman && (
        <SectionCard title={translateNative('native.860d649d3dfa11c5')}>
          {usage.isError && (
            <InventoryText>{usage.error.message}</InventoryText>
          )}
          {(usage.data ?? []).map(record => (
            <View key={number(record, 'id')}>
              <InventoryText><NativeTranslation id="native.1b75353b9b5882f3" values={{ value0: (text(record, 'print_name', 'Print')), value1: (number(record, 'weight_used')), value2: (number(record, 'percent_used')) }} /></InventoryText>
              <InventoryText><NativeTranslation id="native.f7c6271ceccf0982" values={{ value0: (formatDateTime(record.created_at)), value1: (text(record, 'status')), value2: (record.cost == null ? '—' : formatCurrency(record.cost)) }} /></InventoryText>
            </View>
          ))}
          {!usage.data?.length && (
            <InventoryText>{translateNative('native.ab85bf3d311c93d3')}</InventoryText>
          )}
          {canWrite && (
            <PrimaryButton
              label={translateNative('native.16a02b32cb201bc8')}
              variant="danger"
              loading={mutation.isPending}
              onPress={() => setConfirm('usage')}
            />
          )}
        </SectionCard>
      )}
      {assign && (
        <InventoryModal
          title={translateNative('native.ebf12b4f8723203f')}
          onClose={() => setAssign(false)}
        >
          <ChoiceField
            label={translateNative('screen.printer')}
            value={target.printer_id}
            options={(printers.data ?? []).map(printer => ({
              value: text(printer, 'id'),
              label: text(printer, 'name'),
            }))}
            onChange={value =>
              setTarget(old => ({ ...old, printer_id: value }))
            }
          />
          <Fields
            fields={[
              nativeLabelTuple(['ams_id', 'native.1cfc76b81cca160d']),
              nativeLabelTuple(['tray_id', 'native.96625a96060c1243']),
            ]}
            values={target}
            onChange={(key, value) =>
              setTarget(old => ({ ...old, [key]: value }))
            }
          />
          <PrimaryButton
            label={translateNative('native.aff9b055e1df6025')}
            loading={mutation.isPending}
            onPress={() => mutation.mutate('assign')}
          />
        </InventoryModal>
      )}
      <ConfirmModal
        visible={confirm !== null}
        title={
          confirm === 'usage'
            ? translateNative('native.5cfafdb69590c436')
            : confirm === 'reset-consumed-counter'
            ? translateNative('native.9bda7dc518525f3a')
            : translateNative('native.02a1fd4354c5a018')
        }
        message={
          confirm === 'usage'
            ? translateNative('native.d4bd74f4ded82479')
            : confirm === 'reset-consumed-counter'
            ? translateNative('native.29537e46517d8c29')
            : translateNative('native.a255d5681d39c736', { value0: String(confirm ?? '') })
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) mutation.mutate(confirm);
        }}
        loading={mutation.isPending}
      />
    </InventoryModal>
  );
}
const styles = StyleSheet.create({ swatch: { gap: 4, paddingVertical: 6 } });
