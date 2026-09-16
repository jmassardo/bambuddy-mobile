import React from 'react';
import { AppState } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useOffline } from '@/hooks/useOffline';

describe('useOffline', () => {
  let latestHook: ReturnType<typeof useOffline> | null = null;
  let addEventListenerMock: jest.Mock;
  let removeEventListenerMock: jest.Mock;
  let appStateAddListenerSpy: jest.SpyInstance;

  function HookHarness() {
    latestHook = useOffline();
    return null;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    latestHook = null;

    // Setup window mock
    addEventListenerMock = jest.fn();
    removeEventListenerMock = jest.fn();
    // @ts-expect-error
    global.window = {
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    };

    // Setup navigator.onLine mock
    // @ts-expect-error
    global.navigator.onLine = true;

    appStateAddListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({
      remove: jest.fn(),
    }) as any);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    // @ts-expect-error
    delete global.window;
  });

  async function renderHookHarness() {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(HookHarness));
      await Promise.resolve();
    });
    return renderer;
  }

  it('returns isOffline based on navigator.onLine', async () => {
    // @ts-expect-error
    global.navigator.onLine = false;

    const renderer = await renderHookHarness();

    expect(latestHook?.isOffline).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('returns isOffline: false when online', async () => {
    const renderer = await renderHookHarness();

    expect(latestHook?.isOffline).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('updates isOffline when window "offline" event fires', async () => {
    const renderer = await renderHookHarness();

    expect(latestHook?.isOffline).toBe(false);

    act(() => {
      // The hook calls window.addEventListener('offline', handler) which stores the mock call
      // We can retrieve the handler from the mock and invoke it
      addEventListenerMock.mock.calls.forEach((call) => {
        if (call[0] === 'offline' && typeof call[1] === 'function') {
          (call[1] as () => void)();
        }
      });
    });

    expect(latestHook?.isOffline).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('updates isOffline when window "online" event fires', async () => {
    // @ts-expect-error
    global.navigator.onLine = false;

    const renderer = await renderHookHarness();

    expect(latestHook?.isOffline).toBe(true);

    act(() => {
      addEventListenerMock.mock.calls.forEach((call) => {
        if (call[0] === 'online' && typeof call[1] === 'function') {
          (call[1] as () => void)();
        }
      });
    });

    expect(latestHook?.isOffline).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('resets isOffline when app becomes active', async () => {
    // @ts-expect-error
    global.navigator.onLine = false;

    const renderer = await renderHookHarness();

    expect(latestHook?.isOffline).toBe(true);

    // Simulate network coming back and app becoming active
    // @ts-expect-error
    global.navigator.onLine = true;

    act(() => {
      const appStateCall = appStateAddListenerSpy.mock.calls.find(
        (call) => call[0] === 'change',
      );
      if (appStateCall && typeof appStateCall[1] === 'function') {
        (appStateCall[1] as (state: string) => void)('active');
      }
    });

    expect(latestHook?.isOffline).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('does not update on non-active app state changes', async () => {
    const renderer = await renderHookHarness();

    expect(latestHook?.isOffline).toBe(false);

    act(() => {
      const appStateCall = appStateAddListenerSpy.mock.calls.find(
        (call) => call[0] === 'change',
      );
      if (appStateCall && typeof appStateCall[1] === 'function') {
        (appStateCall[1] as (state: string) => void)('background');
      }
    });

    expect(latestHook?.isOffline).toBe(false);

    await act(async () => {
      renderer.unmount();
    });
  });
});
