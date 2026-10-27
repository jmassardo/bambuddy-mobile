import type { InventoryRecord } from '@/types/api';
import { number, remaining, text } from './inventory';

export const skuKey = (row: InventoryRecord) =>
  JSON.stringify(
    ['material', 'subtype', 'brand', 'color_name'].map(key => row[key] || null),
  );
export function skuIdentity(row: InventoryRecord): InventoryRecord {
  return Object.fromEntries(
    ['material', 'subtype', 'brand', 'color_name'].map(key => [
      key,
      row[key] || null,
    ]),
  );
}
export function buildSkuForecasts(
  spools: InventoryRecord[],
  usage: InventoryRecord[],
  settings: InventoryRecord[],
  globalLead: number,
  now = Date.now(),
) {
  const grouped = new Map<string, InventoryRecord[]>();
  spools.forEach(row =>
    grouped.set(skuKey(row), [...(grouped.get(skuKey(row)) ?? []), row]),
  );
  return [...grouped.entries()].map(([key, rows]) => {
    const config = settings.find(row => skuKey(row) === key);
    const ids = new Set(rows.map(row => number(row, 'id')));
    const byDay = new Map<string, number>();
    usage
      .filter(
        row =>
          ids.has(number(row, 'spool_id')) && number(row, 'weight_used') > 0,
      )
      .forEach(row => {
        const day = text(row, 'created_at').slice(0, 10);
        if (Number.isFinite(Date.parse(day)))
          byDay.set(day, (byDay.get(day) ?? 0) + number(row, 'weight_used'));
      });
    const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    const observations = days.slice(1).map(([day, grams], index) => ({
      rate:
        grams /
        Math.max(1, (Date.parse(day) - Date.parse(days[index][0])) / 86400000),
      weight: Math.exp(
        (-Math.LN2 / 30) * Math.max(0, (now - Date.parse(day)) / 86400000),
      ),
    }));
    const totalWeight = observations.reduce(
      (sum, item) => sum + item.weight,
      0,
    );
    let dailyRate = totalWeight
      ? observations.reduce((sum, item) => sum + item.rate * item.weight, 0) /
        totalWeight
      : null;
    const variance =
      dailyRate === null
        ? null
        : observations.reduce(
            (sum, item) => sum + item.weight * (item.rate - dailyRate!) ** 2,
            0,
          ) / totalWeight;
    if (dailyRate === null) {
      const consumed = rows.reduce(
        (sum, row) =>
          sum +
          Math.max(
            0,
            number(row, 'weight_used') - number(row, 'weight_used_baseline'),
          ),
        0,
      );
      const age = Math.max(
        ...rows.map(row =>
          Number.isFinite(Date.parse(text(row, 'created_at')))
            ? (now - Date.parse(text(row, 'created_at'))) / 86400000
            : 0,
        ),
      );
      if (age >= 1 && consumed > 0) dailyRate = consumed / age;
    }
    const stock = rows.reduce((sum, row) => sum + remaining(row), 0);
    const lead = number(config, 'lead_time_days') || globalLead;
    const margin = number(config, 'safety_margin_value', 14);
    const marginGrams =
      config?.safety_margin_unit === 'g'
        ? margin
        : dailyRate === null
        ? margin * 5
        : dailyRate * margin;
    const deviation =
      variance === null ? (dailyRate ?? 0) * 0.2 : Math.sqrt(variance);
    const safety = marginGrams + 1.65 * deviation * Math.sqrt(lead);
    const reorderPoint = dailyRate === null ? 0 : dailyRate * lead + safety;
    const daysLeft =
      dailyRate && dailyRate > 0 ? Math.floor(stock / dailyRate) : null;
    const daysToReorder =
      dailyRate && dailyRate > 0
        ? Math.floor((stock - reorderPoint) / dailyRate)
        : null;
    return {
      key,
      rows,
      identity: skuIdentity(rows[0]),
      config,
      dailyRate,
      stock,
      lead,
      safety,
      reorderPoint,
      daysLeft,
      daysToReorder,
      averageSpool:
        rows.reduce((sum, row) => sum + number(row, 'label_weight', 1000), 0) /
        rows.length,
      stockBreak: daysLeft !== null && lead > 0 && daysLeft <= lead,
      reorder: daysToReorder !== null && daysToReorder <= 0,
    };
  });
}
export type SkuForecast = ReturnType<typeof buildSkuForecasts>[number];
