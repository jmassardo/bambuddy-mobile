import { NativeTranslation, nativeLabelTuple, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';


import React, { useRef, useState } from 'react';
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
  useNativeLocale();
  const { hasAnyPermission } = useAuth();
  const canWrite = hasAnyPermission(
    'inventory:forecast_write',
    'inventory:update',
  );
  const { showToast } = useToast();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: useServerSettingsKey(),
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
  const forecasts = useLocalizedMemo(
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
            translateNative('native.aff204143a1a80ab'),
            0,
          ),
          safety_margin_value: parseNumber(
            form.margin ?? '',
            translateNative('native.c19bde406ce64557'),
            0,
          ),
          safety_margin_unit: form.unit,
          alerts_snoozed: !!editSku.config?.alerts_snoozed,
        });
      if (!cartSku) throw new Error(translateNative('native.ad6e7e64b419e2a7'));
      const requested = parseNumber(
        form.quantity ?? '',
        supplyDays ? translateNative('native.fa410ac6e4daddcb') : 'Quantity',
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
          translateNative('native.3a1208d2848b9f9d'),
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
      showToast(nativeMessage('native.3185deb507128db2'), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <SectionCard
      title={translateNative('native.f55d6964e95083e2')}
      subtitle={translateNative('native.e275ae81f0e1c3cc')}
    >
      {spoolman && (
        <InventoryText>
          {translateNative('native.be5770dc1440c122')}</InventoryText>
      )}
      {[config, usage, shopping]
        .filter(query => query.isError)
        .map((query, index) => (
          <InventoryText key={index}>{query.error?.message}</InventoryText>
        ))}
      <ChoiceField
        label={translateNative('native.53723816466bb4b3')}
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
      <Toggle label={translateNative('native.302bf67d25000cd5')} value={descending} onChange={setDescending} />
      <ChoiceField
        label={translateNative('native.965c4e23105ba825')}
        value={timeframe}
        options={['7', '30', '60', '90', '180'].map(value => ({
          value,
          label: value,
        }))}
        onChange={setTimeframe}
      />
      <PrimaryButton
        label={translateNative('native.2bdb1de6063aff0c', { value0: String(shopping.data?.length ?? 0) })}
        variant="secondary"
        onPress={() => setShowShopping(true)}
      />
      {sorted.map(sku => (
        <View key={sku.key} style={styles.sku}>
          <InventoryText><NativeTranslation id="native.eea3b8b9fb0dd591" values={{ value0: (label(sku.identity)), value1: (sku.rows.length), value2: (Math.round(sku.stock)) }} /></InventoryText>
          <InventoryText>
            {sku.dailyRate === null
              ? translateNative('native.cb62170bc4ff8b7d')
              : translateNative('native.0452f42b92558955', { value0: String(sku.dailyRate.toFixed(1)), value1: String(sku.daysLeft), value2: String(sku.daysToReorder) })}
          </InventoryText>
          <InventoryText><NativeTranslation id="native.257acd29ee38fff8" values={{ value0: (sku.lead), value1: (Math.round(sku.safety)), value2: (Math.round(sku.reorderPoint)) }} /></InventoryText>
          <InventoryText>
            {sku.config?.alerts_snoozed
              ? translateNative('native.53ef20334e9ef167')
              : sku.stockBreak
              ? translateNative('native.06589876aa2b9299')
              : sku.reorder
              ? translateNative('native.b073f77cbbdaac8d')
              : translateNative('native.cab421c068d19441')}
          </InventoryText>
          <PrimaryButton
            label={
              expanded.includes(sku.key)
                ? translateNative('native.7bb7b95dbd0345d8')
                : translateNative('native.e304a1555179303d')
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
                <InventoryText key={number(row, 'id')}><NativeTranslation id="native.5b834bdcd165773f" values={{ value0: (number(row, 'id')), value1: (Math.round(remaining(row))), value2: (text(row, 'storage_location', translateNative('native.768998b76a4dd100'))) }} /></InventoryText>
              ))}
              {canWrite && (
                <>
                  <PrimaryButton
                    label={translateNative('native.67637d74d1af61ca')}
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
                        ? translateNative('native.76560e8c80402de6')
                        : translateNative('native.027a34d9a2326a9d')
                    }
                    variant="secondary"
                    onPress={() =>
                      save.mutate({ sku, snoozed: !sku.config?.alerts_snoozed })
                    }
                  />
                  <PrimaryButton
                    label={translateNative('native.c2a6370e6c231893')}
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
          title={translateNative('native.8fd3ea3bafdf8bdd', { value0: String(label(editSku.identity)) })}
          onClose={() => setEditSku(null)}
        >
          <Fields
            fields={[
              nativeLabelTuple(['lead', 'native.cc0130c7c00d7727']),
              nativeLabelTuple(['margin', 'native.c19bde406ce64557']),
            ]}
            values={form}
            onChange={(key, value) =>
              setForm(old => ({ ...old, [key]: value }))
            }
          />
          <ChoiceField
            label={translateNative('native.cf34381d4de222bf')}
            value={form.unit}
            options={['days', 'g'].map(value => ({ value, label: value }))}
            onChange={value => setForm(old => ({ ...old, unit: value }))}
          />
          <PrimaryButton
            label={translateNative('native.c432ceafcfbf6da6')}
            loading={save.isPending}
            onPress={() => save.mutate('config')}
          />
        </InventoryModal>
      )}
      {cartSku && (
        <InventoryModal
          title={translateNative('native.bd77fa42fb71f20a', { value0: String(label(cartSku.identity)) })}
          onClose={() => setCartSku(null)}
        >
          <Toggle
            label={translateNative('native.2e11a5f67a63915f')}
            value={supplyDays}
            onChange={setSupplyDays}
          />
          <TextField
            label={supplyDays ? translateNative('native.fa410ac6e4daddcb') : translateNative('native.1a87ff9a2c2f1afc')}
            value={form.quantity}
            onChangeText={value =>
              setForm(old => ({ ...old, quantity: value }))
            }
            keyboardType="numeric"
          />
          <TextField
            label={translateNative('native.6b1548b2db629214')}
            value={form.note}
            onChangeText={value => setForm(old => ({ ...old, note: value }))}
          />
          <PrimaryButton
            label={translateNative('native.6a138b3b6a03592c')}
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
  useNativeLocale();
  if (sku.dailyRate === null)
    return (
      <InventoryText>{translateNative('native.01379c601e9bdfe5')}</InventoryText>
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
      accessibilityLabel={translateNative('native.6e7899b28d056595', { value0: String(days), value1: String(sku.lead), value2: String(Math.round(incoming)) })}
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
      <InventoryText><NativeTranslation id="native.d19c1307bf62b5d4" values={{ value0: (days) }} /></InventoryText>
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
  useNativeLocale();
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
      if (!item) throw new Error(translateNative('native.2484fe77040f5aaa'));
      const id = number(item, 'id');
      if (action === 'remove') return management.remove('shopping-list', id);
      if (action === 'edit') {
        const qty = parseNumber(quantity, 'Quantity', 1);
        if (!Number.isInteger(qty))
          throw new Error(translateNative('native.1e9f20a7b292c74e'));
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
        throw new Error(translateNative('native.f18065dc24089043'));
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
      showToast(nativeMessage('native.c26b44650ae70076'), 'success');
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
            translateNative('native.a33c3fcda68cb2b2'),
            ...lines,
          ].join('\n'),
        ],
        { type: 'text/csv', lastModified: Date.now() },
      ),
      'filament-shopping-list.csv',
    );
  };
  return (
    <InventoryModal title={translateNative('native.9d03081558ad05f2')} onClose={onClose}>
      <Toggle
        label={translateNative('native.3ce4956fb6f64ba8')}
        value={logistics}
        onChange={setLogistics}
      />
      <PrimaryButton
        label={translateNative('native.0b34e87efafc8013')}
        variant="secondary"
        onPress={() => {
          exportCsv().catch((error: Error) =>
            showToast(error.message, 'error'),
          );
        }}
      />
      {canWrite && (
        <PrimaryButton
          label={translateNative('native.e8bd9dd39bb01492')}
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
                      {translateNative('native.68c6521626075560')}{sku.lead} {translateNative('native.255066a3568fc188')}{' '}
                      {sku.stockBreak
                        ? translateNative('native.789f56a007bdcb45')
                        : translateNative('native.6b61659b954ead25')}{' '}
                      ·{' '}
                      {Math.round(
                        number(item, 'quantity_spools') * sku.averageSpool,
                      )}{' '}
                      {translateNative('native.7d74c4235e963f56')}</InventoryText>
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
                    {translateNative('native.65617b41eb7f31b5')}</InventoryText>
                ))}
              {canWrite && (
                <>
                  {item.status !== 'received' && (
                    <>
                      <PrimaryButton
                        label={translateNative('native.46d31745ca0cb56a')}
                        variant="secondary"
                        onPress={() => {
                          setEditing(item);
                          setQuantity(text(item, 'quantity_spools'));
                        }}
                      />
                      <ChoiceField
                        label={translateNative('common.status')}
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
                        label={translateNative('native.da4515dcfbeded16')}
                        onPress={() => setConfirm({ action: 'receive', item })}
                      />
                    </>
                  )}
                  <PrimaryButton
                    label={translateNative('native.463aaa6ee43e24f0')}
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
          title={translateNative('native.e10f6e195402f410')}
          onClose={() => setEditing(null)}
        >
          <TextField
            label={translateNative('native.1a87ff9a2c2f1afc')}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />
          <PrimaryButton
            label={translateNative('native.c6b0b4affd8b86ae')}
            loading={mutation.isPending}
            onPress={() => mutation.mutate({ action: 'edit', item: editing })}
          />
        </InventoryModal>
      )}
      <ConfirmModal
        visible={confirm !== null}
        title={
          confirm?.action === 'receive'
            ? translateNative('native.a8a96ffa459f860b')
            : translateNative('native.e6aaf8afd6f75686')
        }
        message={
          confirm?.action === 'receive'
            ? translateNative('native.7007724c392a8dcf')
            : translateNative('native.a44f72f5bc288fb2')
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
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
