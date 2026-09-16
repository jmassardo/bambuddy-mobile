import React from 'react';
import { AppState } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useWebSocket } from '@/hooks/useWebSocket';

const mockInvalidateQueries = jest.fn();
const mockSetQueryData = jest.fn();
const mockShowToast = jest.fn();
const mockGetWebSocketToken = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('@/api/client', () => ({
  api: {
    getWebSocketToken: (...args: unknown[]) => mockGetWebSocketToken(...args),
  },
  getAuthToken: () => null,
}));

jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { serverUrl: string }) => unknown) =>
    selector({ serverUrl: 'https://bambuddy.test' }),
  wsUrl: (serverUrl: string, token?: string) => {
    const base = serverUrl.replace(/^http/, 'ws');
    return `${base}/api/v1/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    if (this.readyState === 3) return; // already closed
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  emitClose(code = 1006, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  triggerError() {
    this.onerror?.();
  }
}

describe('useWebSocket', () => {
  let hookRef = { current: null as ReturnType<typeof useWebSocket> | null };

  function HookHarness() {
    hookRef.current = useWebSocket();
    return null;
  }

  function getLatest(): ReturnType<typeof useWebSocket> | null {
    return hookRef.current;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    MockWebSocket.instances = [];
    hookRef.current = null;
    mockGetWebSocketToken.mockResolvedValue({ token: 'ws-token' });
    (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as any);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function renderHookHarness() {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(HookHarness));
      await Promise.resolve();
    });
    return renderer;
  }

  it('connects to the correct websocket URL', async () => {
    const renderer = await renderHookHarness();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe('wss://bambuddy.test/api/v1/ws?token=ws-token');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('reconnects after an unexpected disconnect', async () => {
    const renderer = await renderHookHarness();

    act(() => {
      MockWebSocket.instances[0]?.emitClose(1006);
      jest.advanceTimersByTime(3000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(MockWebSocket.instances).toHaveLength(2);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('handles incoming printer status messages', async () => {
    const renderer = await renderHookHarness();

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.emitMessage({
        type: 'printer_status',
        printer_id: 7,
        data: { progress: 55 },
      });
      jest.advanceTimersByTime(100);
    });

    expect(getLatest()?.isConnected).toBe(true);
    expect(mockSetQueryData).toHaveBeenCalledWith(['printerStatus', 7], expect.any(Function));

    const updater = mockSetQueryData.mock.calls[0][1] as (old: Record<string, unknown> | undefined) => Record<string, unknown>;
    expect(updater({ state: 'IDLE' })).toEqual({ state: 'IDLE', progress: 55 });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('uses exponential backoff for reconnection', async () => {
    const renderer = await renderHookHarness();

    // First disconnect — should reconnect after ~1s (base delay)
    act(() => {
      MockWebSocket.instances[0]?.emitClose(1006);
    });

    // Should NOT have reconnected after 500ms
    act(() => { jest.advanceTimersByTime(500); });
    await act(async () => { await Promise.resolve(); });
    expect(MockWebSocket.instances).toHaveLength(1);

    // Should reconnect after ~1.3s (1000 base + up to 300ms jitter)
    act(() => { jest.advanceTimersByTime(1000); });
    await act(async () => { await Promise.resolve(); });
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second disconnect — backoff increases to ~2s base
    act(() => {
      MockWebSocket.instances[1]?.emitClose(1006);
    });

    act(() => { jest.advanceTimersByTime(1500); });
    await act(async () => { await Promise.resolve(); });
    const countAfter1_5s = MockWebSocket.instances.length;

    act(() => { jest.advanceTimersByTime(2000); });
    await act(async () => { await Promise.resolve(); });
    expect(MockWebSocket.instances.length).toBeGreaterThan(countAfter1_5s);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('resets backoff counter on successful connection', async () => {
    const renderer = await renderHookHarness();

    act(() => { MockWebSocket.instances[0]?.emitClose(1006); });
    act(() => { jest.advanceTimersByTime(5000); });
    await act(async () => { await Promise.resolve(); });

    act(() => { MockWebSocket.instances[1]?.emitClose(1006); });
    act(() => { jest.advanceTimersByTime(5000); });
    await act(async () => { await Promise.resolve(); });

    act(() => { MockWebSocket.instances[2]?.open(); });

    act(() => { MockWebSocket.instances[2]?.emitClose(1006); });

    const countBefore = MockWebSocket.instances.length;
    act(() => { jest.advanceTimersByTime(1500); });
    await act(async () => { await Promise.resolve(); });

    expect(MockWebSocket.instances.length).toBeGreaterThan(countBefore);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('handles archive_created and inventory_changed messages', async () => {
    const renderer = await renderHookHarness();

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.emitMessage({ type: 'archive_created' });
      MockWebSocket.instances[0]?.emitMessage({ type: 'inventory_changed' });
      jest.advanceTimersByTime(3000);
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['archives'] }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['archiveStats'] }),
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['inventory-spools'] }),
    );

    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows toast for missing spool assignment', async () => {
    const renderer = await renderHookHarness();

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.emitMessage({
        type: 'missing_spool_assignment',
        printer_name: 'X1 Carbon',
        missing_slots: [{ slot: 'AMS 1 Slot 2' }, { slot: 'AMS 1 Slot 4' }],
      });
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      'X1 Carbon: Missing spool assignment for AMS 1 Slot 2, AMS 1 Slot 4',
      'warning',
    );

    await act(async () => {
      renderer.unmount();
    });
  });

  it('does not reconnect on unauthorized close (4401)', async () => {
    const renderer = await renderHookHarness();

    act(() => {
      MockWebSocket.instances[0]?.emitClose(4401);
      jest.advanceTimersByTime(10000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    await act(async () => {
      renderer.unmount();
    });
  });

  describe('error logging and recovery', () => {
    it('captures errors from onerror handler', async () => {
      const renderer = await renderHookHarness();

      act(() => {
        MockWebSocket.instances[0]?.open();
        MockWebSocket.instances[0]?.triggerError();
      });

      expect(getLatest()?.errors).toHaveLength(1);
      expect(getLatest()?.errors[0]?.message).toContain('error on attempt 1');
      expect(getLatest()?.errors[0]?.attempt).toBe(0);

      await act(async () => {
        renderer.unmount();
      });
    });

    it('captures close events with non-standard codes', async () => {
      const renderer = await renderHookHarness();

      act(() => {
        MockWebSocket.instances[0]?.emitClose(1006, 'connection timeout');
      });

      const closeErrors = (getLatest()?.errors ?? []).filter(
        (e) => e.code === 1006,
      );
      expect(closeErrors).toHaveLength(1);
      expect(closeErrors[0]?.message).toContain('code 1006');

      await act(async () => {
        renderer.unmount();
      });
    });

    it('captures unauthorized close as error', async () => {
      const renderer = await renderHookHarness();

      act(() => {
        MockWebSocket.instances[0]?.emitClose(4401);
      });

      const authErrors = (getLatest()?.errors ?? []).filter(
        (e) => e.message.includes('unauthorized'),
      );
      expect(authErrors).toHaveLength(1);
      expect(authErrors[0]?.code).toBe(4401);

      await act(async () => {
        renderer.unmount();
      });
    });

    it('caps error queue at 50 entries', async () => {
      const renderer = await renderHookHarness();

      act(() => {
        MockWebSocket.instances[0]?.emitClose(1006);
        // Already capped at 50 by the hook, create more via close events
        for (let i = 0; i < 60; i++) {
          MockWebSocket.instances[0]?.emitClose(1000);
        }
      });

      expect(getLatest()?.errors.length).toBeLessThanOrEqual(50);

      await act(async () => {
        renderer.unmount();
      });
    });

    it('triggers onError callback on error', async () => {
      const onError = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- test helper, not read in test
      let _hook: ReturnType<typeof useWebSocket> | null = null;

      function HookWithCallback() {
        _hook = useWebSocket({ onError });
        return null;
      }

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(React.createElement(HookWithCallback));
        await Promise.resolve();
      });

      act(() => {
        MockWebSocket.instances[0]?.open();
        MockWebSocket.instances[0]?.triggerError();
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]?.message).toContain('error on attempt 1');
      expect(onError.mock.calls[0][0]?.attempt).toBe(0);
      expect(onError.mock.calls[0][0]?.timestamp).toBeDefined();

      await act(async () => {
        renderer.unmount();
      });
    });

    it('resets error queue when clearErrors is called', async () => {
      const renderer = await renderHookHarness();

      act(() => {
        MockWebSocket.instances[0]?.open();
        MockWebSocket.instances[0]?.triggerError();
      });

      expect(getLatest()?.errors).toHaveLength(1);

      await act(async () => {
        getLatest()?.clearErrors();
        await Promise.resolve();
      });

      expect(getLatest()?.errors).toHaveLength(0);

      await act(async () => {
        renderer.unmount();
      });
    });
  });

  describe('reconnection callbacks', () => {
    it('triggers onReconnect callback with attempt number', async () => {
      const onReconnect = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- test helper, not read in test
      let _hook: ReturnType<typeof useWebSocket> | null = null;

      function HookWithCallback() {
        _hook = useWebSocket({ onReconnect });
        return null;
      }

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(React.createElement(HookWithCallback));
        await Promise.resolve();
      });

      act(() => {
        MockWebSocket.instances[0]?.emitClose(1006);
        jest.advanceTimersByTime(1500);
      });

      // Flush async connect() microtasks
      await act(async () => { await Promise.resolve(); });

      expect(onReconnect).toHaveBeenCalledWith(0);

      // Second reconnect attempt
      act(() => {
        MockWebSocket.instances[1]?.emitClose(1006);
        jest.advanceTimersByTime(3000);
      });

      await act(async () => { await Promise.resolve(); });

      expect(onReconnect).toHaveBeenCalledWith(1);

      await act(async () => {
        renderer.unmount();
      });
    });

    it('stops reconnecting after max attempts', async () => {
      const onReconnect = jest.fn();
      const localHookRef = { current: null as ReturnType<typeof useWebSocket> | null };

      function HookWithMax() {
        localHookRef.current = useWebSocket({ onReconnect });
        return null;
      }

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(React.createElement(HookWithMax));
        await Promise.resolve();
      });

      // Manually exhaust reconnect attempts
      for (let i = 0; i < 16; i++) {
        act(() => {
          MockWebSocket.instances.at(-1)?.emitClose(1006);
          jest.advanceTimersByTime(30000);
        });
        await act(async () => { await Promise.resolve(); });
      }

      const initialCount = MockWebSocket.instances.length;

      act(() => {
        jest.advanceTimersByTime(30000);
      });
      await act(async () => { await Promise.resolve(); });

      // Should not create new connections after max attempts
      expect(MockWebSocket.instances.length).toBe(initialCount);
      expect(hookRef.current && hookRef.current.isReconnecting).toBe(false);

      await act(async () => {
        renderer.unmount();
      });
    });

    it('isReconnecting becomes false when connection succeeds', async () => {
      const renderer = await renderHookHarness();

      // Trigger a disconnect to set isReconnecting
      act(() => {
        MockWebSocket.instances[0]?.emitClose(1006);
        jest.advanceTimersByTime(3000);
      });

      // Flush async connect() microtasks
      await act(async () => { await Promise.resolve(); });

      expect(getLatest()?.isReconnecting).toBe(true);

      // Open the next connection
      if (MockWebSocket.instances.length > 1) {
        act(() => {
          MockWebSocket.instances[1]?.open();
        });
      }

      expect(getLatest()?.isReconnecting).toBe(false);
      expect(getLatest()?.isConnected).toBe(true);

      await act(async () => {
        renderer.unmount();
      });
    });
  });
});
