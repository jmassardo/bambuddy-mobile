import { act, renderHook } from '@testing-library/react-native';
import { useSpoolBuddyTare } from '@/hooks/useSpoolBuddyTare';
import { spoolbuddyApi } from '@/api/spoolbuddy';
import type { SpoolBuddyDevice } from '@/types/api';

jest.mock('@/api/spoolbuddy', () => ({ spoolbuddyApi: { tare: jest.fn() } }));
const device = {
  device_id: 'a',
  online: true,
  last_calibrated_at: null,
} as SpoolBuddyDevice;
const refreshDevice = jest.fn().mockResolvedValue(undefined);
beforeEach(() => {
  jest.useFakeTimers();
  refreshDevice.mockClear();
  jest.mocked(spoolbuddyApi.tare).mockResolvedValue({ status: 'ok' });
});
afterEach(() => {
  jest.useRealTimers();
});

it('does not complete on queue dispatch, only on the chosen device calibration timestamp change', async () => {
  const hook = await renderHook(
    ({ current }: { current: SpoolBuddyDevice }) =>
      useSpoolBuddyTare(current, refreshDevice),
    { initialProps: { current: device } },
  );
  await act(async () => {
    await hook.result.current.tare(123, true);
  });
  expect(hook.result.current.waiting).toBe(true);
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(refreshDevice).toHaveBeenCalledTimes(2);
  await hook.rerender({ current: { ...device, tare_offset: 123 } });
  expect(hook.result.current.waiting).toBe(true);
  await hook.rerender({ current: { ...device, last_calibrated_at: 'now' } });
  expect(hook.result.current.waiting).toBe(false);
  expect(hook.result.current.step).toBe('weight');
  expect(hook.result.current.zero).toBe(123);
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  expect(hook.result.current.message).toBe('Tare confirmed by remote device.');
  expect(refreshDevice).toHaveBeenCalledTimes(2);
});

it('times out at fifteen seconds with an actionable daemon error and ignores late acknowledgement', async () => {
  const hook = await renderHook(
    ({ current }: { current: SpoolBuddyDevice }) =>
      useSpoolBuddyTare(current, refreshDevice),
    { initialProps: { current: device } },
  );
  await act(async () => {
    await hook.result.current.tare(null, false);
  });
  await act(async () => {
    jest.advanceTimersByTime(14999);
  });
  expect(hook.result.current.waiting).toBe(true);
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(hook.result.current.waiting).toBe(false);
  expect(hook.result.current.message).toMatch(/15 seconds.*daemon is running/);
  const polls = refreshDevice.mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(refreshDevice).toHaveBeenCalledTimes(polls);
  await hook.rerender({ current: { ...device, last_calibrated_at: 'late' } });
  expect(hook.result.current.message).toMatch(/timed out/);
});

it('cleans the timeout on cancellation, device change and unmount', async () => {
  const hook = await renderHook(
    ({ current }: { current: SpoolBuddyDevice }) =>
      useSpoolBuddyTare(current, refreshDevice),
    { initialProps: { current: device } },
  );
  await act(async () => {
    await hook.result.current.tare(123, true);
  });
  await act(async () => {
    hook.result.current.cancel();
  });
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  expect(hook.result.current.message).toMatch(/cancelled locally/);
  await act(async () => {
    await hook.result.current.tare(123, true);
  });
  await hook.rerender({ current: { ...device, device_id: 'b' } });
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  expect(hook.result.current.waiting).toBe(false);
  expect(hook.result.current.message).toBe('');
  const timers = jest.spyOn(globalThis, 'setTimeout');
  const clearTimer = jest.spyOn(globalThis, 'clearTimeout');
  await act(async () => {
    await hook.result.current.tare(123, true);
  });
  const timerIndex = timers.mock.calls.findIndex(call => call[1] === 15000);
  expect(timerIndex).toBeGreaterThanOrEqual(0);
  await hook.unmount();
  expect(clearTimer).toHaveBeenCalledWith(
    timers.mock.results[timerIndex].value,
  );
  timers.mockRestore();
  clearTimer.mockRestore();
});
