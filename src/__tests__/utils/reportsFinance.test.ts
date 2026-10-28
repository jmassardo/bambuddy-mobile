import {
  budgetPayload,
  centerCapabilities,
  financeAmount,
  financePermissions,
  partialCharge,
} from '@/utils/finance';
import {
  hourBuckets,
  reportRange,
  reportRecords,
  splitReport,
  summarizeReportEvents,
  validCustomRange,
} from '@/utils/reports';
import { reportCsv, reportXlsxBase64 } from '@/utils/reportExport';
import type { FinanceCenter } from '@/types/api';
import {
  getFormattingPreferences,
  setFormattingPreferences,
} from '@/utils/preferences';

describe('report date scope and measurements', () => {
  const now = new Date('2026-03-01T22:30:00Z');
  it('aligns calendar periods to UTC, including Sunday and year boundaries', () => {
    expect(reportRange('this-week', now)).toEqual({
      dateFrom: '2026-02-23',
      dateTo: '2026-03-01',
    });
    expect(reportRange('this-month', now).dateFrom).toBe('2026-03-01');
    expect(reportRange('this-year', now).dateFrom).toBe('2026-01-01');
    expect(reportRange('7d', now).dateFrom).toBe('2026-02-23');
    expect(reportRange('all', now)).toEqual({});
    expect(validCustomRange('2024-02-29', '2024-03-01')).toBe(true);
    expect(validCustomRange('2026-02-29', '2026-03-01')).toBe(false);
    expect(validCustomRange('2026-03-02', '2026-03-01')).toBe(false);
  });
  it('uses completed-only elapsed duration and measured energy for records', () => {
    const records = reportRecords([
      {
        print_name: 'Failed giant',
        status: 'failed',
        actual_time_seconds: 90000,
        cost: 5,
        created_at: '2026-03-01T10:00:00Z',
      },
      {
        print_name: 'Success',
        status: 'completed',
        actual_time_seconds: 2000,
        filament_used_grams: 100,
        cost: 4,
        energy_cost: 3,
        created_at: '2026-03-01T11:00:00Z',
      },
      {
        print_name: 'Success 2',
        status: 'completed',
        actual_time_seconds: 1800,
        created_at: '2026-03-01T12:00:00Z',
      },
    ]);
    expect(records.longest.item?.print_name).toBe('Success');
    expect(records.heaviest.value).toBe(100);
    expect(records.costliest.item?.print_name).toBe('Success');
    expect(records.costliest.value).toBe(7);
    expect(records.streak).toBe(2);
    expect(records.busiest).toEqual({ day: '2026-03-01', count: 3 });
  });
  it('does not drop odd-hour-only activity or replace explicit zero measurements', () => {
    const date = new Date(2026, 2, 1, 3);
    const items = [
      {
        created_at: date.toISOString(),
        actual_time_seconds: 0,
        print_time_seconds: 500,
      },
    ];
    expect(hourBuckets(items, 'prints')).toHaveLength(24);
    expect(hourBuckets(items, 'prints')[3].value).toBe(1);
    expect(hourBuckets(items, 'time')[3].value).toBe(0);
  });
  it('uses saved hour labels and treats zone-less server timestamps as UTC', () => {
    const previous = getFormattingPreferences();
    setFormattingPreferences({ locale: 'en-US', timeFormat: '24h' });
    try {
      const items = [{ created_at: '2026-03-01T03:00:00' }];
      const hour = new Date('2026-03-01T03:00:00Z').getHours();
      expect(hourBuckets(items, 'prints')[hour].value).toBe(1);
      expect(hourBuckets(items, 'prints')[3].label).toBe('03:00');
      setFormattingPreferences({ timeFormat: '12h' });
      expect(hourBuckets(items, 'prints')[3].label).toBe('03:00 AM');
    } finally {
      setFormattingPreferences(previous);
    }
  });
  it('splits multicolor/material weight and time but counts each participating material', () => {
    const items = [
      {
        filament_type: 'PLA, PETG',
        filament_color: '#ff0000, #0000ff',
        filament_used_grams: 100,
        actual_time_seconds: 200,
      },
    ];
    expect(splitReport(items, 'filament_type', 'weight')).toEqual([
      { label: 'PLA', value: 50 },
      { label: 'PETG', value: 50 },
    ]);
    expect(splitReport(items, 'filament_type', 'prints')).toEqual([
      { label: 'PLA', value: 1 },
      { label: 'PETG', value: 1 },
    ]);
    expect(splitReport(items, 'filament_color', 'time')).toEqual([
      { label: '#ff0000', value: 100 },
      { label: '#0000ff', value: 100 },
    ]);
  });
  it('excludes absent estimates and accuracy outliers exactly as the server does', () => {
    const result = summarizeReportEvents([
      {
        status: 'completed',
        printer_id: 1,
        actual_time_seconds: 100,
        print_time_seconds: 110,
      },
      {
        status: 'completed',
        printer_id: 1,
        actual_time_seconds: 100,
        print_time_seconds: null,
      },
      {
        status: 'completed',
        printer_id: 1,
        actual_time_seconds: 100,
        print_time_seconds: 900,
      },
      {
        status: 'failed',
        printer_id: 1,
        actual_time_seconds: 100,
        print_time_seconds: 100,
      },
    ]);
    expect(result.average_time_accuracy).toBe(110);
    expect(result.time_accuracy_by_printer).toEqual({ '1': 110 });
    expect(result.total_print_time_seconds).toBe(400);
    expect(
      summarizeReportEvents([{ status: 'completed', actual_time_seconds: 10 }])
        .average_time_accuracy,
    ).toBeNull();
  });
  it('exports the exact scope, all rows, unicode and formula-safe cells', () => {
    const items = [
      { print_name: '=MALICIOUS(1)', status: 'completed' },
      { print_name: '蓝色 & <spool>' },
    ];
    const scope = {
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      createdById: -1,
      printerId: 7,
    };
    const csv = reportCsv(items, scope);
    expect(csv).toContain('"2026-01-01"');
    expect(csv).toContain('"2026-02-01"');
    expect(csv).toContain('"\'=MALICIOUS(1)"');
    const encoded = reportXlsxBase64(items, scope).replace(/[=]/g, '');
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let zip = '',
      value = 0,
      bits = 0;
    for (const char of encoded) {
      value = value * 64 + alphabet.indexOf(char);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        zip += String.fromCharCode(Math.floor(value / 2 ** bits));
        value %= 2 ** bits;
      }
    }
    const bytes = new DataView(
      Uint8Array.from(zip, char => char.charCodeAt(0)).buffer,
    );
    const files: Record<string, string> = {};
    let offset = 0;
    while (bytes.getUint32(offset, true) === 0x04034b50) {
      const size = bytes.getUint32(offset + 18, true);
      const nameLength = bytes.getUint16(offset + 26, true);
      const extraLength = bytes.getUint16(offset + 28, true);
      const start = offset + 30 + nameLength + extraLength;
      files[zip.slice(offset + 30, offset + 30 + nameLength)] =
        decodeURIComponent(escape(zip.slice(start, start + size)));
      offset = start + size;
    }
    expect(bytes.getUint32(offset, true)).toBe(0x02014b50);
    expect(files['xl/worksheets/sheet1.xml']).toContain(
      '蓝色 &amp; &lt;spool&gt;',
    );
    expect(files['xl/worksheets/sheet1.xml']).toContain('2026-01-01');
    expect(files['xl/worksheets/sheet1.xml']).toContain('t="inlineStr"');
    expect(files['xl/_rels/workbook.xml.rels']).toContain(
      'worksheets/sheet1.xml',
    );
  });
});

describe('finance permission and budget boundaries', () => {
  it('denies anonymous finance and does not infer modification from create/read', () => {
    expect(financePermissions(() => true, false).access).toBe(false);
    const createOnly = financePermissions(
      permission => permission === 'cost_centers:create',
      true,
    );
    expect(createOnly.admin).toBe(true);
    expect(createOnly.modify).toBe(false);
    expect(createOnly.all).toBe(false);
    expect(financePermissions(() => false, true).access).toBe(false);
  });
  it('distinguishes unlimited from an explicit zero and resets the other budget', () => {
    expect(budgetPayload('monthly', '0')).toEqual({
      monthly_budget: 0,
      total_budget: null,
    });
    expect(budgetPayload('total', '12.50')).toEqual({
      total_budget: 12.5,
      monthly_budget: null,
    });
    expect(budgetPayload('none', '')).toEqual({
      total_budget: null,
      monthly_budget: null,
    });
    for (const value of ['', ' ', '-1', '12x', 'Infinity', 'NaN']) {
      expect(() => budgetPayload('monthly', value)).toThrow();
    }
  });
  it('permits budget-only edits on private centers and validates charge amounts', () => {
    const privateCenter = { is_private: true } as FinanceCenter;
    expect(centerCapabilities(privateCenter, true)).toEqual({
      budget: true,
      rename: false,
      delete: false,
      members: false,
    });
    expect(centerCapabilities(privateCenter, false).budget).toBe(false);
    for (const value of ['', '0', '-1', '1x', 'Infinity'])
      expect(() => financeAmount(value)).toThrow();
    expect(financeAmount('-2.5', true)).toBe(-2.5);
    expect(financeAmount('0', true)).toBe(0);
    expect(partialCharge('part [failed: 5m]')).toBe('failed');
  });
});
