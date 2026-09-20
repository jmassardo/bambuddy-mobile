import { renderHook } from '@testing-library/react-native';
import { useStreamHealth } from '@/hooks/useStreamHealth';

describe('useStreamHealth', () => {
  it('should start in healthy state', async () => {
    const { result } = await renderHook(() => useStreamHealth());

    expect(result.current.status).toBe('healthy');
  });
});
