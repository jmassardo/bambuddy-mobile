import { countFleetStates, getPrinterFleetState, isBulkApplicable } from '@/utils/printerFleet';
import type { PrinterStatus } from '@/types/api';

const status = (state: string, extra: Partial<PrinterStatus> = {}) =>
  ({ connected: true, state, hms_errors: [], ...extra } as PrinterStatus);

it('skips disconnected/inapplicable bulk targets and never clears an active plate', () => {
  expect(isBulkApplicable('pause', status('PAUSE'))).toBe(false);
  expect(isBulkApplicable('pause', status('RUNNING'))).toBe(true);
  expect(isBulkApplicable('resume', status('PAUSE'))).toBe(true);
  expect(isBulkApplicable('stop', status('IDLE'))).toBe(false);
  expect(
    isBulkApplicable('stop', status('RUNNING', { connected: false })),
  ).toBe(false);
  expect(
    isBulkApplicable(
      'clear-plate',
      status('RUNNING', { awaiting_plate_clear: true }),
    ),
  ).toBe(false);
  expect(
    isBulkApplicable(
      'clear-plate',
      status('FINISH', { awaiting_plate_clear: true }),
    ),
  ).toBe(true);
  expect(isBulkApplicable('clear-hms', status('IDLE'))).toBe(false);
  expect(
    isBulkApplicable(
      'clear-hms',
      status('IDLE', {
        hms_errors: [
          {
            code: '0x123',
            attr: 0,
            module: 0,
            severity: 2,
            actions: ['CHECK_FILAMENT'],
          },
        ],
      }),
    ),
  ).toBe(true);
  expect(isBulkApplicable('light-on', undefined)).toBe(false);
});

it('counts plate readiness rather than retained firmware finish states and distinguishes loading from offline', () => {
  const counts = countFleetStates([
    undefined,
    status('IDLE', { connected: false }),
    status('RUNNING'),
    status('PAUSE'),
    status('FINISH', { awaiting_plate_clear: true }),
    status('FINISH', { awaiting_plate_clear: false }),
    status('FAILED'),
    status('IDLE'),
  ].map(value => ({ status: value })));
  expect(counts).toEqual({
    loading: 1,
    offline: 1,
    printing: 1,
    paused: 1,
    finished: 1,
    queued: 0,
    idle: 2,
    issues: 1,
  });
});

it('gives active HMS precedence over printing in the counts, matching the filters', () => {
  const counts = countFleetStates([
    status('RUNNING', {
      hms_errors: [
        {
          code: '0x123',
          attr: 0,
          module: 0,
          severity: 2,
          actions: ['CHECK_FILAMENT'],
        },
      ],
    }),
  ].map(value => ({ status: value })));
  expect(counts.printing).toBe(0);
  expect(counts.issues).toBe(1);
  expect(counts.idle).toBe(0);
});

it.each([
  ['FINISH', true, 0, 'finished'],
  ['FINISH', true, 2, 'finished'],
  ['FINISH', false, 0, 'idle'],
  ['FINISH', false, 2, 'queued'],
  ['FINISH', undefined, 0, 'finished'],
  ['IDLE', true, 0, 'finished'],
  ['IDLE', false, 0, 'idle'],
  ['IDLE', false, 1, 'queued'],
  ['RUNNING', true, 1, 'printing'],
  ['PAUSE', true, 1, 'paused'],
  ['FAILED', true, 1, 'issues'],
  ['FAILED', false, 0, 'issues'],
] as const)('classifies %s with plate-clear pending=%s and %s jobs as %s', (state, awaiting, queueCount, expected) => {
  const printer = {
    status: status(state, { awaiting_plate_clear: awaiting }),
    queueCount,
  };
  expect(getPrinterFleetState(printer)).toBe(expected);
  expect(countFleetStates([printer])[expected]).toBe(1);
});

it('does not classify unavailable, disconnected, or maintenance-blocked printers as ready', () => {
  const cleared = status('FINISH', { awaiting_plate_clear: false });
  expect(getPrinterFleetState({ status: cleared, printer: { is_active: false } })).toBe('issues');
  expect(getPrinterFleetState({ status: cleared, maintenance: { dueCount: 1 }, queueCount: 1 })).toBe('issues');
  expect(getPrinterFleetState({ status: { ...cleared, connected: false }, queueCount: 1 })).toBe('offline');
});
