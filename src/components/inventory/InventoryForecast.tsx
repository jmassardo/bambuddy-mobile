import React, { useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventoryBackend,
  inventoryManagementApi as management,
  inventoryRequest,
} from '@/api/inventoryManagement';
import { settingsApi } from '@/api/settings';
import { useServerStore } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';
import type { InventoryRecord } from '@/types/api';
import { number, parseNumber, remaining, text } from '@/utils/inventory';
import {
  buildSkuForecasts,
  skuIdentity,
  skuKey,
  type SkuForecast,
} from '@/utils/inventoryForecast';
import { shareBlob } from '@/utils/share';
import {
  InventoryButton as PrimaryButton,
  InventoryConfirm as ConfirmModal,
  InventorySection as SectionCard,
  InventoryField as TextField,
  useInventoryToast as useToast,
  ChoiceField,
  Fields,
  InventoryModal,
  InventoryText,
  Toggle,
} from './InventoryControls';

export async function allInventoryUsage() {
  let limit = 1000;
  for (;;) {
    const rows = await inventoryRequest<InventoryRecord[]>(
      `/inventory/usage?limit=${limit}`,
    );
    if (rows.length < limit) return rows;
    limit *= 2;
  }
}
function label(row: InventoryRecord) {
  return ['brand', 'material', 'subtype', 'color_name']
    .map(key => text(row, key))
    .filter(Boolean)
    .join(' ');
}
export function InventoryForecast({
  spools,
  spoolman,
}: {
  spools: InventoryRecord[];
  spoolman: boolean;
}) {
  const { hasAnyPermission } = useAuth();
  const canWrite = hasAnyPermission(
    'inventory:forecast_write',
    'inventory:update',
  );
  const { showToast } = useToast();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getSettings(),
  });
  const config = useQuery({
    queryKey: ['inventorySkuSettings'],
    queryFn: () => management.skuSettings(),
  });
  const usage = useQuery({
    queryKey: ['inventoryUsageHistory'],
    queryFn: allInventoryUsage,
    enabled: !spoolman,
  });
  const shopping = useQuery({
    queryKey: ['inventoryShopping'],
    queryFn: () => management.shopping(),
  });
  const [sort, setSort] = useState('daysLeft');
  const [descending, setDescending] = useState(false);
  const [timeframe, setTimeframe] = useState('30');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editSku, setEditSku] = useState<SkuForecast | null>(null);
  const [cartSku, setCartSku] = useState<SkuForecast | null>(null);
  const [showShopping, setShowShopping] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [supplyDays, setSupplyDays] = useState(false);
  const forecasts = useMemo(
    () =>
      buildSkuForecasts(
        spools,
        usage.data ?? [],
        config.data ?? [],
        number(settings.data, 'forecast_global_lead_time_days'),
      ),
    [spools, usage.data, config.data, settings.data],
  );
  const sorted = [...forecasts].sort((a, b) => {
    const av =
      sort === 'name'
        ? label(a.identity)
        : a[sort as 'stock' | 'dailyRate' | 'daysLeft' | 'daysToReorder'];
    const bv =
      sort === 'name'
        ? label(b.identity)
        : b[sort as 'stock' | 'dailyRate' | 'daysLeft' | 'daysToReorder'];
    const comparison =
      av == null
        ? 1
        : bv == null
        ? -1
        : typeof av === 'string'
        ? av.localeCompare(String(bv))
        : Number(av) - Number(bv);
    return descending ? -comparison : comparison;
  });
  const refresh = async () => {
    await Promise.all(
      ['inventorySkuSettings', 'inventoryShopping', 'inventorySpools'].map(
        key => client.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
  const save = useMutation({
    mutationFn: async (
      operation: 'config' | 'cart' | { sku: SkuForecast; snoozed: boolean },
    ) => {
      if (typeof operation === 'object')
        return management.saveSku({
          ...operation.sku.identity,
          ...operation.sku.config,
          alerts_snoozed: operation.snoozed,
        });
      if (operation === 'config' && editSku)
        return management.saveSku({
          ...editSku.identity,
          lead_time_days: parseNumber(
            form.lead ?? '',
            'Lead time (0 inherits global)',
            0,
          ),
          safety_margin_value: parseNumber(
            form.margin ?? '',
            'Safety margin',
            0,
          ),
          safety_margin_unit: form.unit,
          alerts_snoozed: !!editSku.config?.alerts_snoozed,
        });
      if (!cartSku) throw new Error('Choose a SKU first.');
      const requested = parseNumber(
        form.quantity ?? '',
        supplyDays ? 'Days of supply' : 'Quantity',
        1,
      );
      const quantity = supplyDays
        ? Math.ceil(
            Math.max(
              0,
              (cartSku.dailyRate ?? 0) * (requested as number) - cartSku.stock,
            ) / cartSku.averageSpool,
          )
        : requested;
      if (!Number.isInteger(quantity) || !quantity || quantity < 1)
        throw new Error(
          'Choose a positive whole spool quantity. Days-of-supply needs consumption data and demand exceeding stock.',
        );
      return management.addShopping({
        ...cartSku.identity,
        quantity_spools: quantity,
        note: form.note || null,
      });
    },
    onSuccess: async () => {
      await refresh();
      setEditSku(null);
      setCartSku(null);
      showToast('Forecast updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <SectionCard
      title="SKU forecasts and replenishment"
      subtitle="Filtered spools are aggregated by material, subtype, brand and color."
    >
      {spoolman && (
        <InventoryText>
          Spoolman does not provide internal usage history; consumption deltas
          are used when available.
        </InventoryText>
      )}
      {[config, usage, shopping]
        .filter(query => query.isError)
        .map((query, index) => (
          <InventoryText key={index}>{query.error?.message}</InventoryText>
        ))}
      <ChoiceField
        label="Sort SKUs"
        value={sort}
        options={[
          'name',
          'stock',
          'dailyRate',
          'daysLeft',
          'daysToReorder',
        ].map(value => ({ value, label: value }))}
        onChange={setSort}
      />
      <Toggle label="Descending" value={descending} onChange={setDescending} />
      <ChoiceField
        label="Chart timeframe (days)"
        value={timeframe}
        options={['7', '30', '60', '90', '180'].map(value => ({
          value,
          label: value,
        }))}
        onChange={setTimeframe}
      />
      <PrimaryButton
        label={`Shopping list (${shopping.data?.length ?? 0})`}
        variant="secondary"
        onPress={() => setShowShopping(true)}
      />
      {sorted.map(sku => (
        <View key={sku.key} style={styles.sku}>
          <InventoryText>
            {label(sku.identity)} · {sku.rows.length} spools ·{' '}
            {Math.round(sku.stock)} g
          </InventoryText>
          <InventoryText>
            {sku.dailyRate === null
              ? 'Insufficient consumption data'
              : `${sku.dailyRate.toFixed(1)} g/day · depletion in ${
                  sku.daysLeft
                } days · reorder in ${sku.daysToReorder} days`}
          </InventoryText>
          <InventoryText>
            Lead {sku.lead} d · safety {Math.round(sku.safety)} g · reorder
            point {Math.round(sku.reorderPoint)} g
          </InventoryText>
          <InventoryText>
            {sku.config?.alerts_snoozed
              ? 'Alerts snoozed'
              : sku.stockBreak
              ? '⚠ Stock break before delivery'
              : sku.reorder
              ? '⚠ Reorder point reached'
              : 'Stock healthy'}
          </InventoryText>
          <PrimaryButton
            label={
              expanded.includes(sku.key)
                ? 'Collapse SKU'
                : 'Expand SKU / spools'
            }
            variant="secondary"
            onPress={() =>
              setExpanded(old =>
                old.includes(sku.key)
                  ? old.filter(key => key !== sku.key)
                  : [...old, sku.key],
              )
            }
          />
          {expanded.includes(sku.key) && (
            <>
              <ForecastChart sku={sku} days={Number(timeframe)} />
              {sku.rows.map(row => (
                <InventoryText key={number(row, 'id')}>
                  #{number(row, 'id')} · {Math.round(remaining(row))} g ·{' '}
                  {text(row, 'storage_location', 'No location')}
                </InventoryText>
              ))}
              {canWrite && (
                <>
                  <PrimaryButton
                    label="Edit lead time and safety margin"
                    variant="secondary"
                    onPress={() => {
                      setEditSku(sku);
                      setForm({
                        lead: text(sku.config, 'lead_time_days', '0'),
                        margin: text(sku.config, 'safety_margin_value', '14'),
                        unit: text(sku.config, 'safety_margin_unit', 'days'),
                      });
                    }}
                  />
                  <PrimaryButton
                    label={
                      sku.config?.alerts_snoozed
                        ? 'Restore alerts'
                        : 'Snooze SKU alerts'
                    }
                    variant="secondary"
                    onPress={() =>
                      save.mutate({ sku, snoozed: !sku.config?.alerts_snoozed })
                    }
                  />
                  <PrimaryButton
                    label="Add to shopping list"
                    onPress={() => {
                      setCartSku(sku);
                      setSupplyDays(false);
                      setForm({ quantity: '1', note: '' });
                    }}
                  />
                </>
              )}
            </>
          )}
        </View>
      ))}
      {editSku && (
        <InventoryModal
          title={`Replenishment: ${label(editSku.identity)}`}
          onClose={() => setEditSku(null)}
        >
          <Fields
            fields={[
              ['lead', 'Lead time days (0 inherits global)'],
              ['margin', 'Safety margin'],
            ]}
            values={form}
            onChange={(key, value) =>
              setForm(old => ({ ...old, [key]: value }))
            }
          />
          <ChoiceField
            label="Safety margin unit"
            value={form.unit}
            options={['days', 'g'].map(value => ({ value, label: value }))}
            onChange={value => setForm(old => ({ ...old, unit: value }))}
          />
          <PrimaryButton
            label="Save SKU assumptions"
            loading={save.isPending}
            onPress={() => save.mutate('config')}
          />
        </InventoryModal>
      )}
      {cartSku && (
        <InventoryModal
          title={`Add ${label(cartSku.identity)}`}
          onClose={() => setCartSku(null)}
        >
          <Toggle
            label="Calculate from desired days of supply"
            value={supplyDays}
            onChange={setSupplyDays}
          />
          <TextField
            label={supplyDays ? 'Days of supply' : 'Quantity of spools'}
            value={form.quantity}
            onChangeText={value =>
              setForm(old => ({ ...old, quantity: value }))
            }
            keyboardType="numeric"
          />
          <TextField
            label="Purchasing note"
            value={form.note}
            onChangeText={value => setForm(old => ({ ...old, note: value }))}
          />
          <PrimaryButton
            label="Add to persistent list"
            loading={save.isPending}
            onPress={() => save.mutate('cart')}
          />
        </InventoryModal>
      )}
      {showShopping && (
        <ShoppingList
          items={shopping.data ?? []}
          forecasts={forecasts}
          spoolman={spoolman}
          canWrite={canWrite}
          onClose={() => setShowShopping(false)}
          onSaved={refresh}
        />
      )}
    </SectionCard>
  );
}
function ForecastChart({
  sku,
  days,
  incoming = 0,
}: {
  sku: SkuForecast;
  days: number;
  incoming?: number;
}) {
  if (sku.dailyRate === null)
    return (
      <InventoryText>No projection without a consumption rate.</InventoryText>
    );
  const max = Math.max(1, sku.stock + incoming, sku.reorderPoint);
  const points = Array.from(
    { length: days + 1 },
    (_unused, day) =>
      `${(day / days) * 300},${
        130 -
        (Math.max(
          0,
          sku.stock - sku.dailyRate! * day + (day >= sku.lead ? incoming : 0),
        ) /
          max) *
          120
      }`,
  ).join(' ');
  return (
    <View
      accessibilityLabel={`Stock projection over ${days} days; delivery in ${
        sku.lead
      } days; incoming ${Math.round(incoming)} grams`}
    >
      <Svg viewBox="0 0 300 145" height={145} width="100%">
        <Line
          x1="0"
          x2="300"
          y1={130 - (sku.reorderPoint / max) * 120}
          y2={130 - (sku.reorderPoint / max) * 120}
          stroke="#f59e0b"
          strokeDasharray="4 4"
        />
        <Polyline
          points={points}
          fill="none"
          stroke="#1db954"
          strokeWidth="2"
        />
      </Svg>
      <InventoryText>
        Green: projected stock · amber: reorder point · {days} days
      </InventoryText>
    </View>
  );
}
function ShoppingList({
  items,
  forecasts,
  spoolman,
  canWrite,
  onClose,
  onSaved,
}: {
  items: InventoryRecord[];
  forecasts: SkuForecast[];
  spoolman: boolean;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [logistics, setLogistics] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: 'clear' | 'remove' | 'receive';
    item?: InventoryRecord;
  } | null>(null);
  const [editing, setEditing] = useState<InventoryRecord | null>(null);
  const [quantity, setQuantity] = useState('');
  const serverUrl = useServerStore(state => state.serverUrl);
  const receivedQuantities = useRef(new Map<string, number>());
  const mutation = useMutation({
    mutationFn: async ({
      action,
      item,
    }: {
      action: string;
      item?: InventoryRecord;
    }) => {
      if (action === 'clear') return management.clearShopping();
      if (!item) throw new Error('Missing shopping-list item.');
      const id = number(item, 'id');
      if (action === 'remove') return management.remove('shopping-list', id);
      if (action === 'edit') {
        const qty = parseNumber(quantity, 'Quantity', 1);
        if (!Number.isInteger(qty))
          throw new Error('Quantity must be a whole number.');
        // The current server exposes status-only PATCH, so replace an edited line.
        const replacement = await management.addShopping({
          ...skuIdentity(item),
          quantity_spools: qty,
          note: item.note,
        });
        if (item.status !== 'pending')
          await management.shoppingStatus(
            number(replacement, 'id'),
            text(item, 'status', 'pending'),
          );
        await management.remove('shopping-list', id);
        return replacement;
      }
      if (action !== 'receive') return management.shoppingStatus(id, action);
      if (item.status === 'received')
        throw new Error('This line has already been received.');
      const sku = forecasts.find(row => row.key === skuKey(item));
      const receiptKey = `inventory-receipt:${serverUrl}:${spoolman}:${id}`;
      const storedQuantity =
        receivedQuantities.current.get(receiptKey) ??
        Number((await AsyncStorage.getItem(receiptKey)) || 0);
      let completedQuantity = Number.isFinite(storedQuantity)
        ? storedQuantity
        : 0;
      if (completedQuantity < number(item, 'quantity_spools', 1)) {
        let remainingQty =
          number(item, 'quantity_spools', 1) - completedQuantity;
        const backend = inventoryBackend(spoolman);
        while (remainingQty > 0) {
          const batch = Math.min(remainingQty, spoolman ? 50 : 100);
          await backend.create(
            {
              ...skuIdentity(item),
              label_weight: Math.round(sku?.averageSpool ?? 1000),
              core_weight: 0,
              weight_used: 0,
              note: item.note ?? null,
              ...(!spoolman ? { category: 'Stock' } : {}),
            },
            batch,
          );
          remainingQty -= batch;
          completedQuantity += batch;
          receivedQuantities.current.set(receiptKey, completedQuantity);
          await AsyncStorage.setItem(receiptKey, String(completedQuantity));
        }
      }
      return management.shoppingStatus(id, 'received');
    },
    onSuccess: async () => {
      await onSaved();
      setConfirm(null);
      setEditing(null);
      showToast('Shopping list updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const exportCsv = async () => {
    const cell = (value: unknown) =>
      `"${String(value ?? '')
        .replace(/^[=+@\\-]/, "'$&")
        .replace(/"/g, '""')}"`;
    const lines = items.map(item => {
      const sku = forecasts.find(row => row.key === skuKey(item));
      return [
        label(item),
        item.quantity_spools,
        item.status,
        item.note,
        sku?.lead,
        sku?.daysLeft,
        sku?.reorderPoint,
      ]
        .map(cell)
        .join(',');
    });
    await shareBlob(
      new Blob(
        [
          [
            'SKU,Quantity,Status,Note,Lead days,Depletion days,Reorder grams',
            ...lines,
          ].join('\n'),
        ],
        { type: 'text/csv', lastModified: Date.now() },
      ),
      'filament-shopping-list.csv',
    );
  };
  return (
    <InventoryModal title="Shopping list" onClose={onClose}>
      <Toggle
        label="Logistics view"
        value={logistics}
        onChange={setLogistics}
      />
      <PrimaryButton
        label="Export CSV"
        variant="secondary"
        onPress={() => {
          exportCsv().catch((error: Error) =>
            showToast(error.message, 'error'),
          );
        }}
      />
      {canWrite && (
        <PrimaryButton
          label="Clear shopping list"
          variant="danger"
          disabled={!items.length}
          onPress={() => setConfirm({ action: 'clear' })}
        />
      )}
      {items
        .filter(item => !logistics || item.status !== 'received')
        .map(item => {
          const sku = forecasts.find(row => row.key === skuKey(item));
          return (
            <View key={number(item, 'id')} style={styles.sku}>
              <InventoryText>
                {number(item, 'quantity_spools')}× {label(item)} ·{' '}
                {text(item, 'status')}
              </InventoryText>
              <InventoryText>{text(item, 'note')}</InventoryText>
              {logistics &&
                (sku ? (
                  <>
                    <InventoryText>
                      Delivery in {sku.lead} days ·{' '}
                      {sku.stockBreak
                        ? 'Stock break risk before delivery'
                        : 'Delivery before depletion'}{' '}
                      ·{' '}
                      {Math.round(
                        number(item, 'quantity_spools') * sku.averageSpool,
                      )}{' '}
                      g incoming
                    </InventoryText>
                    <ForecastChart
                      sku={sku}
                      days={Math.max(30, sku.lead * 2)}
                      incoming={
                        number(item, 'quantity_spools') * sku.averageSpool
                      }
                    />
                  </>
                ) : (
                  <InventoryText>
                    No matching filtered inventory SKU; delivery projection
                    unavailable.
                  </InventoryText>
                ))}
              {canWrite && (
                <>
                  {item.status !== 'received' && (
                    <>
                      <PrimaryButton
                        label="Edit quantity"
                        variant="secondary"
                        onPress={() => {
                          setEditing(item);
                          setQuantity(text(item, 'quantity_spools'));
                        }}
                      />
                      <ChoiceField
                        label="Status"
                        value={text(item, 'status', 'pending')}
                        options={['pending', 'purchased'].map(value => ({
                          value,
                          label: value,
                        }))}
                        onChange={value =>
                          mutation.mutate({ action: value, item })
                        }
                      />
                      <PrimaryButton
                        label="Receive into stock"
                        onPress={() => setConfirm({ action: 'receive', item })}
                      />
                    </>
                  )}
                  <PrimaryButton
                    label="Remove line"
                    variant="danger"
                    onPress={() => setConfirm({ action: 'remove', item })}
                  />
                </>
              )}
            </View>
          );
        })}
      {editing && (
        <InventoryModal
          title="Edit shopping quantity"
          onClose={() => setEditing(null)}
        >
          <TextField
            label="Quantity of spools"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />
          <PrimaryButton
            label="Save quantity"
            loading={mutation.isPending}
            onPress={() => mutation.mutate({ action: 'edit', item: editing })}
          />
        </InventoryModal>
      )}
      <ConfirmModal
        visible={confirm !== null}
        title={
          confirm?.action === 'receive'
            ? 'Receive into inventory?'
            : 'Remove shopping entries?'
        }
        message={
          confirm?.action === 'receive'
            ? 'Creates the ordered quantity as new stock spools, then marks this line received. Do not receive the same physical shipment twice.'
            : 'The selected shopping entries will be removed; inventory spools are not deleted.'
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
const styles = StyleSheet.create({
  sku: {
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
