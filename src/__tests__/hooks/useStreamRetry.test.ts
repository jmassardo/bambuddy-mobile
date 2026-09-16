import { renderHook } from '@testing-library/react-native';
import { useStreamRetry } from '@/hooks/useStreamRetry';

describe('useStreamRetry', () => {
  it('should export retry function', async () => {
    const { result } = await renderHook(() => useStreamRetry());

    expect(typeof result.current.retry).toBe('function');
    expect(typeof result.current.recover).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });
});
