import { countFleetStates, isBulkApplicable } from '@/utils/printerFleet';
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

it('counts live running/paused/finished states independently of HMS and distinguishes loading from offline', () => {
  const counts = countFleetStates([
    undefined,
    status('IDLE', { connected: false }),
    status('RUNNING'),
    status('PAUSE'),
    status('FINISH'),
    status('FAILED'),
    status('IDLE'),
  ]);
  expect(counts).toEqual({
    loading: 1,
    offline: 1,
    printing: 1,
    paused: 1,
    finished: 2,
    idle: 1,
    issues: 0,
  });
});

it('counts active HMS independently without turning a running printer into an idle/problem-only printer', () => {
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
  ]);
  expect(counts.printing).toBe(1);
  expect(counts.issues).toBe(1);
  expect(counts.idle).toBe(0);
});
