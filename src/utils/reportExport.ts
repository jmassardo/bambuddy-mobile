import { translateNative } from '@/i18n';
/* eslint-disable no-bitwise -- ZIP headers, CRC32 and base64 encode binary bytes. */
import type { ApiRecord } from '@/utils/data';
import type { ReportScope } from '@/utils/reports';

const columns = [
  'print_name',
  'printer_id',
  'status',
  'created_at',
  'actual_time_seconds',
  'print_time_seconds',
  'filament_used_grams',
  'filament_type',
  'filament_color',
  'cost',
  'energy_kwh',
  'energy_cost',
];
const xml = (value: string) =>
  Array.from(value)
    .filter(char => char.charCodeAt(0) >= 32 || '\t\n\r'.includes(char))
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
export function reportExportRows(
  items: ApiRecord[],
  scope: ReportScope,
): string[][] {
  return [
    [
      'date_from',
      scope.dateFrom ?? 'all',
      'date_to',
      scope.dateTo ?? 'all',
      'printer_id',
      String(scope.printerId ?? 'all'),
      'user_id',
      String(scope.createdById ?? 'all'),
    ],
    columns,
    ...items.map(item =>
      columns.map(column => (item[column] == null ? '' : String(item[column]))),
    ),
  ];
}

export function reportCsv(items: ApiRecord[], scope: ReportScope) {
  return reportExportRows(items, scope)
    .map(row =>
      row
        .map(value => {
          const safe = /^[=+@\t\r-]/.test(value) ? `'${value}` : value;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}

function crc32(bytes: number[]) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Store-only ZIP avoids native binary Blob support and external workbook
// dependencies. Inline-string cells also prevent formula interpretation.
export function reportXlsxBase64(items: ApiRecord[], scope: ReportScope) {
  const sheet = reportExportRows(items, scope)
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row
          .map(
            value =>
              `<c t="inlineStr"><is><t xml:space="preserve">${xml(
                value,
              )}</t></is></c>`,
          )
          .join('')}</row>`,
    )
    .join('');
  const files: Record<string, string> = {
    get '[Content_Types].xml'() { return translateNative('native.7364a084b874ace7'); },
    get '_rels/.rels'() { return translateNative('native.8d65d0c9e5203c28'); },
    get 'xl/workbook.xml'() { return translateNative('native.b8188886a7c9dc41'); },
    get 'xl/_rels/workbook.xml.rels'() { return translateNative('native.ba674aad318cebfd'); },
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`,
  };
  const output: number[] = [],
    directory: number[] = [];
  const bytes = (value: string) => {
    const encoded = unescape(encodeURIComponent(value));
    return Array.from(encoded, char => char.charCodeAt(0));
  };
  const int = (value: number, size: number) =>
    Array.from({ length: size }, (_, i) => (value >>> (i * 8)) & 255);
  const push = (target: number[], values: number[]) => {
    for (const value of values) target.push(value);
  };
  for (const [filename, value] of Object.entries(files)) {
    const name = bytes(filename),
      data = bytes(value),
      crc = crc32(data),
      offset = output.length;
    const common = [
      ...int(0, 2),
      ...int(0, 2),
      ...int(0, 2),
      ...int(33, 2),
      ...int(crc, 4),
      ...int(data.length, 4),
      ...int(data.length, 4),
      ...int(name.length, 2),
      ...int(0, 2),
    ];
    push(output, [...int(0x04034b50, 4), ...int(20, 2), ...common, ...name]);
    push(output, data);
    push(directory, [
      ...int(0x02014b50, 4),
      ...int(20, 2),
      ...int(20, 2),
      ...common,
      ...int(0, 2),
      ...int(0, 2),
      ...int(0, 2),
      ...int(0, 4),
      ...int(offset, 4),
      ...name,
    ]);
  }
  const directoryOffset = output.length;
  push(output, directory);
  push(output, [
    ...int(0x06054b50, 4),
    ...int(0, 2),
    ...int(0, 2),
    ...int(5, 2),
    ...int(5, 2),
    ...int(directory.length, 4),
    ...int(directoryOffset, 4),
    ...int(0, 2),
  ]);
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let i = 0; i < output.length; i += 3) {
    const a = output[i],
      b = output[i + 1],
      c = output[i + 2];
    encoded +=
      alphabet[a >> 2] +
      alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)] +
      (b === undefined ? '=' : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)]) +
      (c === undefined ? '=' : alphabet[c & 63]);
  }
  return encoded;
}
