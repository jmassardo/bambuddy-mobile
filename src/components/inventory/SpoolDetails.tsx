import React, { useMemo, useState } from 'react';
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
import { useTranslation } from '@/i18n';
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
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('inventory:update');
  const canDelete = hasPermission('inventory:delete');
  const client = useQueryClient();
  const id = number(spool, 'id');
  const backend = useMemo(() => inventoryBackend(spoolman), [spoolman]);
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
            ams_id: parseNumber(target.ams_id, 'AMS ID', 0, 255),
            tray_id: parseNumber(target.tray_id, 'Tray ID', 0, 3),
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
      showToast('Spool updated.', 'success');
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
    <InventoryModal title={`Spool #${id}`} onClose={onClose}>
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
      <InventoryText>
        {Math.round(remaining(row))} g net remaining ·{' '}
        {Math.round(trackedGross)} g tracked gross ·{' '}
        {Math.round(
          Math.max(
            0,
            number(row, 'weight_used') - number(row, 'weight_used_baseline'),
          ),
        )}{' '}
        g consumed since reset
      </InventoryText>
      <LocationEnvironmentReadings locationId={number(row, 'location_id')} />
      {scale != null && (
        <SectionCard title="Scale reconciliation">
          <InventoryText>
            Measured gross {number(row, 'last_scale_weight')} g · measured net{' '}
            {Math.max(
              0,
              number(row, 'last_scale_weight') - number(row, 'core_weight'),
            )}{' '}
            g · tracked gross {Math.round(trackedGross)} g · discrepancy{' '}
            {Math.round(discrepancy)} g
          </InventoryText>
          <InventoryText>
            {matches
              ? 'Within 50 g tolerance (or below tare)'
              : '⚠ Measured and tracked weights disagree'}
          </InventoryText>
          {canWrite && (
            <PrimaryButton
              label="Trust measured scale weight and reconcile tracking"
              onPress={() => setConfirm('scale')}
            />
          )}
        </SectionCard>
      )}
      {assignment && (
        <InventoryText>
          Assigned: {text(assignment, 'printer_name')} · AMS{' '}
          {number(assignment, 'ams_id')} / tray {number(assignment, 'tray_id')}
        </InventoryText>
      )}
      {canWrite && (
        <>
          <PrimaryButton label="Edit spool" onPress={() => onEdit(row)} />
          <PrimaryButton
            label="Copy as new spool (no unique identity)"
            variant="secondary"
            onPress={() => onCopy(row)}
          />
          <PrimaryButton
            label="Assign printer slot"
            variant="secondary"
            onPress={() => setAssign(true)}
          />
          {!!assignment && (
            <PrimaryButton
              label="Unassign printer slot"
              variant="secondary"
              onPress={() => setConfirm('unassign')}
            />
          )}
          <PrimaryButton
            label="Reset this consumed counter"
            variant="secondary"
            onPress={() => setConfirm('reset-consumed-counter')}
          />
          <PrimaryButton
            label="Mark empty"
            variant="secondary"
            onPress={() => setConfirm('empty')}
          />
          <PrimaryButton
            label={row.archived_at ? 'Restore' : 'Archive'}
            variant="secondary"
            onPress={() => setConfirm(row.archived_at ? 'restore' : 'archive')}
          />
        </>
      )}
      <PrimaryButton
        label="Compose label"
        variant="secondary"
        onPress={() => onLabels([id])}
      />
      {canDelete && (
        <PrimaryButton
          label="Delete spool"
          variant="danger"
          onPress={() => setConfirm('delete')}
        />
      )}
      {!spoolman && (
        <SectionCard title="Usage history">
          {usage.isError && (
            <InventoryText>{usage.error.message}</InventoryText>
          )}
          {(usage.data ?? []).map(record => (
            <View key={number(record, 'id')}>
              <InventoryText>
                {text(record, 'print_name', 'Print')} ·{' '}
                {number(record, 'weight_used')} g ·{' '}
                {number(record, 'percent_used')}% consumed
              </InventoryText>
              <InventoryText>
                {formatDateTime(record.created_at)} · {text(record, 'status')} ·
                cost {record.cost == null ? '—' : formatCurrency(record.cost)}
              </InventoryText>
            </View>
          ))}
          {!usage.data?.length && (
            <InventoryText>No recorded usage.</InventoryText>
          )}
          {canWrite && (
            <PrimaryButton
              label="Clear this usage history"
              variant="danger"
              loading={mutation.isPending}
              onPress={() => setConfirm('usage')}
            />
          )}
        </SectionCard>
      )}
      {assign && (
        <InventoryModal
          title="Assign spool to printer slot"
          onClose={() => setAssign(false)}
        >
          <ChoiceField
            label="Printer"
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
              ['ams_id', 'AMS ID (255: external spool)'],
              ['tray_id', 'Tray ID (0–3)'],
            ]}
            values={target}
            onChange={(key, value) =>
              setTarget(old => ({ ...old, [key]: value }))
            }
          />
          <PrimaryButton
            label="Assign"
            loading={mutation.isPending}
            onPress={() => mutation.mutate('assign')}
          />
        </InventoryModal>
      )}
      <ConfirmModal
        visible={confirm !== null}
        title={
          confirm === 'usage'
            ? 'Clear usage history?'
            : confirm === 'reset-consumed-counter'
            ? 'Reset consumed counter?'
            : 'Confirm spool action'
        }
        message={
          confirm === 'usage'
            ? 'Usage records will be permanently deleted. Remaining stock is unchanged.'
            : confirm === 'reset-consumed-counter'
            ? 'Only the consumption baseline changes. Remaining filament and history stay unchanged.'
            : `${
                confirm ?? ''
              } will update this spool. Delete permanently removes it.`
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
