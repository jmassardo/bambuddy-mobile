import { renderHook, act } from '@testing-library/react-native';
import { useStreamRetry } from '@/hooks/useStreamRetry';

jest.useFakeTimers();

describe('useStreamRetry', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('should start in idle state', async () => {
    const { result } = await renderHook(() => useStreamRetry());

    expect(result.current.currentState).toBe('idle');
    expect(result.current.retryCount).toBe(0);
    expect(result.current.maxRetries).toBe(3);
  });

  it('should trigger retry with exponential backoff', async () => {
    const { result } = await renderHook(() =>
      useStreamRetry({
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      }),
    );

    act(() => {
      result.current.retry();
    });

    expect(result.current.currentState).toBe('retrying');
    expect(result.current.nextRetryDelayMs).toBe(100);

    act(() => {
      jest.advanceTimersByTime(99);
    });
    expect(result.current.currentState).toBe('retrying');

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current.retryCount).toBe(1);
    expect(result.current.currentState).toBe('retrying');
    expect(result.current.nextRetryDelayMs).toBe(200);
  });

  it('should reach max retries and fail', async () => {
    const { result } = await renderHook(() =>
      useStreamRetry({
        maxRetries: 2,
        initialDelayMs: 50,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      }),
    );

    // First retry
    act(() => {
      result.current.retry();
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current.retryCount).toBe(1);

    // Second retry (max reached)
    act(() => {
      result.current.retry();
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.currentState).toBe('failed');
  });

  it('should recover on success', async () => {
    const { result } = await renderHook(() =>
      useStreamRetry({ maxRetries: 3, initialDelayMs: 50 }),
    );

    act(() => {
      result.current.retry();
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current.retryCount).toBe(1);

    act(() => {
      result.current.recover();
    });

    expect(result.current.currentState).toBe('recovered');
    expect(result.current.retryCount).toBe(0);
  });

  it('should reset to idle state', async () => {
    const { result } = await renderHook(() =>
      useStreamRetry({ maxRetries: 3, initialDelayMs: 50 }),
    );

    act(() => {
      result.current.retry();
    });
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current.retryCount).toBe(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.currentState).toBe('idle');
    expect(result.current.retryCount).toBe(0);
  });

  it('should apply max delay cap', async () => {
    const { result } = await renderHook(() =>
      useStreamRetry({
        maxRetries: 10,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      }),
    );

    // After several retries, delay should be capped at 5000
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.retry();
      }
    });
    act(() => {
      jest.advanceTimersByTime(16000); // 1000 * 2^4 = 16000, should be capped at 5000
    });

    // Next delay should be capped at 5000
    expect(result.current.nextRetryDelayMs).toBe(5000);
  });

  it('should not retry when disabled', async () => {
    const { result } = await renderHook(() =>
      useStreamRetry({ enabled: false, maxRetries: 3, initialDelayMs: 50 }),
    );

    act(() => {
      result.current.retry();
    });

    expect(result.current.currentState).toBe('idle');
    expect(result.current.retryCount).toBe(0);
  });

  it('should use custom maxRetries', async () => {
    const { result } = await renderHook(() =>
      useStreamRetry({ maxRetries: 5, initialDelayMs: 50 }),
    );

    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.retry();
      });
      act(() => {
        jest.advanceTimersByTime(50);
      });
    }

    expect(result.current.currentState).toBe('failed');
    expect(result.current.retryCount).toBe(5);
  });
});
