import { renderHook, act } from '@testing-library/react-native';
import { useStreamHealth } from '@/hooks/useStreamHealth';

jest.useFakeTimers();

describe('useStreamHealth', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('should start in healthy state', async () => {
    const { result } = await renderHook(() => useStreamHealth());

    expect(result.current.status).toBe('healthy');
    expect(result.current.metrics.framesReceived).toBe(0);
  });

  it('should detect degraded stream', async () => {
    const { result } = await renderHook(() =>
      useStreamHealth({
        staleThresholdMs: 10000,
        degradedThresholdMs: 5000,
      }),
    );

    // Wait for first check (immediate)
    expect(result.current.status).toBe('healthy');

    // Fast forward past degraded threshold
    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(result.current.status).toBe('degraded');
  });

  it('should detect stale stream', async () => {
    const { result } = await renderHook(() =>
      useStreamHealth({
        staleThresholdMs: 5000,
        degradedThresholdMs: 2000,
      }),
    );

    // Fast forward past stale threshold
    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(result.current.status).toBe('stale');
  });

  it('should record frames', async () => {
    const { result } = await renderHook(() => useStreamHealth());

    act(() => {
      result.current.recordFrame();
    });
    expect(result.current.metrics.framesReceived).toBe(1);

    act(() => {
      result.current.recordFrame();
    });
    expect(result.current.metrics.framesReceived).toBe(2);
  });

  it('should clear frame count', async () => {
    const { result } = await renderHook(() => useStreamHealth());

    act(() => {
      result.current.recordFrame();
      result.current.recordFrame();
    });
    expect(result.current.metrics.framesReceived).toBe(2);

    act(() => {
      result.current.clear();
    });
    expect(result.current.metrics.framesReceived).toBe(0);
  });

  it('should track time since last activity', async () => {
    const { result } = await renderHook(() => useStreamHealth());

    const initialTime = result.current.timeSinceLastActivityMs;

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.timeSinceLastActivityMs).toBeGreaterThan(initialTime);
  });

  it('should refresh status on demand', async () => {
    const { result } = await renderHook(() =>
      useStreamHealth({
        staleThresholdMs: 3000,
        degradedThresholdMs: 1000,
      }),
    );

    expect(result.current.status).toBe('healthy');

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(result.current.status).toBe('degraded');

    act(() => {
      result.current.refresh();
    });

    expect(result.current.status).toBe('degraded');
  });

  it('should respect autoRefreshEnabled flag', async () => {
    const { result } = await renderHook(() =>
      useStreamHealth({
        staleThresholdMs: 1000,
        degradedThresholdMs: 500,
        autoRefreshEnabled: false,
      }),
    );

    // Without auto-refresh, the initial status should be set but not updated
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Status should still be 'healthy' because no auto-refresh happens
    expect(result.current.status).toBe('healthy');
  });
});
