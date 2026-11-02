import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  BugReportCollectionGuard,
  BugReportTools,
} from '@/components/system/BugReportTools';
import {
  parseReportCollection,
  reportSessionKey,
  editReportCollection,
  loadReportCollection,
  stopReportCollection,
  type ReportCollection,
} from '@/components/system/bugReportCollection';
import { systemApi } from '@/api/system';
import { printersApi } from '@/api/printers';
import { useServerStore } from '@/api/server';

jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    loading: false,
    serverConnected: true,
    authEnabled: false,
    user: null,
  }),
}));
jest.mock('@/api/system', () => ({
  systemApi: {
    getReportPrinterDiagnostic: jest.fn(),
    getSystemHealth: jest.fn(),
    startBugReportLogging: jest.fn(),
    stopBugReportLogging: jest.fn(),
    submitBugReport: jest.fn(),
  },
}));
jest.mock('@/api/printers', () => ({
  printersApi: { getPrinters: jest.fn() },
}));
jest.mock('@/api/http', () => ({ request: jest.fn() }));
const server = 'https://server.test';
const session: ReportCollection = {
  description: 'Intermittent print connection error',
  email: 'user@example.test',
  includeSupportInfo: true,
  startedAt: Date.now(),
  wasDebug: true,
  phase: 'logging',
};
const stored = new Map<string, string>();
async function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <BugReportCollectionGuard />
      <BugReportTools />
    </QueryClientProvider>,
  );
}
describe('guided diagnostic report workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stored.clear();
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async key => stored.get(key) ?? null);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
      stored.set(key, value);
    });
    jest.mocked(AsyncStorage.removeItem).mockImplementation(async key => {
      stored.delete(key);
    });
    useServerStore.setState({ serverUrl: server });
    jest.mocked(printersApi.getPrinters).mockResolvedValue([]);
    jest.mocked(systemApi.getSystemHealth).mockResolvedValue({
      log_available: false,
      findings: [],
      scanned_entries: 0,
      summary: { total: 0, layer8: 0, environment: 0, bug: 0 },
    });
    jest
      .mocked(systemApi.startBugReportLogging)
      .mockResolvedValue({ started: true, was_debug: false });
    jest
      .mocked(systemApi.stopBugReportLogging)
      .mockResolvedValue({ logs: 'sanitized reproduction trace' });
    jest.mocked(systemApi.submitBugReport).mockResolvedValue({
      success: true,
      message: 'Issue created',
      issue_url: 'https://github.com/example/issues/1',
    });
  });
  it('starts collection without submitting, survives leaving/reopening, and stops without sending', async () => {
    let view = await mount();
    await fireEvent.changeText(
      view.getByLabelText('Describe the problem and reproduction steps'),
      session.description,
    );
    await fireEvent.press(view.getByLabelText('Start diagnostic logging'));
    await view.findByLabelText('Stop and submit report');
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
    expect(systemApi.stopBugReportLogging).not.toHaveBeenCalled();
    expect(
      parseReportCollection(stored.get(reportSessionKey(server)) ?? null)
        ?.wasDebug,
    ).toBe(false);
    await view.unmount();
    view = await mount();
    await view.findByLabelText('Stop and submit report');
    expect(
      view.getByLabelText('Describe the problem and reproduction steps').props
        .value,
    ).toBe(session.description);
    await fireEvent.press(
      view.getByLabelText('Stop collection without submitting'),
    );
    await waitFor(() =>
      expect(systemApi.stopBugReportLogging).toHaveBeenCalledWith(false),
    );
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
    expect(await view.findByLabelText('Submit / retry report')).toBeTruthy();
  });
  it('resumes edited reproduction steps, email and diagnostic opt-out and submits the retained consent', async () => {
    let view = await mount();
    await fireEvent.changeText(
      view.getByLabelText('Describe the problem and reproduction steps'),
      session.description,
    );
    await fireEvent.press(view.getByLabelText('Start diagnostic logging'));
    await view.findByLabelText('Stop and submit report');
    const original = parseReportCollection(
      stored.get(reportSessionKey(server)) ?? null,
    )!;
    const edited =
      'Reproduction: open the queue, start a print, then observe the connection error.';
    await fireEvent.changeText(
      view.getByLabelText('Describe the problem and reproduction steps'),
      edited,
    );
    await fireEvent.changeText(
      view.getByLabelText('Email (optional)'),
      'updated@example.test',
    );
    await fireEvent(
      view.getByLabelText(
        'Include diagnostic support information and sanitized debug logs',
      ),
      'valueChange',
      false,
    );
    await view.unmount();
    view = await mount();
    await view.findByLabelText('Stop and submit report');
    expect(
      view.getByLabelText('Describe the problem and reproduction steps').props
        .value,
    ).toBe(edited);
    expect(view.getByLabelText('Email (optional)').props.value).toBe(
      'updated@example.test',
    );
    expect(
      view.getByLabelText(
        'Include diagnostic support information and sanitized debug logs',
      ).props.value,
    ).toBe(false);
    expect(
      parseReportCollection(stored.get(reportSessionKey(server)) ?? null),
    ).toEqual(
      expect.objectContaining({
        startedAt: original.startedAt,
        wasDebug: original.wasDebug,
        phase: 'logging',
        includeSupportInfo: false,
      }),
    );
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Stop and submit report'));
    await waitFor(() =>
      expect(systemApi.submitBugReport).toHaveBeenCalledWith(
        expect.objectContaining({
          description: edited,
          email: 'updated@example.test',
          include_support_info: false,
        }),
      ),
    );
  });
  it('preserves edits made while automatic stop is collecting logs', async () => {
    const original = { ...session, startedAt: Date.now() - 301000 };
    stored.set(reportSessionKey(server), JSON.stringify(original));
    let finishStop!: (result: { logs: string }) => void;
    jest.mocked(systemApi.stopBugReportLogging).mockReturnValueOnce(
      new Promise(resolve => {
        finishStop = resolve;
      }),
    );
    let view = await mount();
    await waitFor(() =>
      expect(systemApi.stopBugReportLogging).toHaveBeenCalledTimes(1),
    );
    const edited =
      'Updated reproduction steps while the automatic collection stop is in flight.';
    try {
      await fireEvent.changeText(
        view.getByLabelText('Describe the problem and reproduction steps'),
        edited,
      );
      await fireEvent(
        view.getByLabelText(
          'Include diagnostic support information and sanitized debug logs',
        ),
        'valueChange',
        false,
      );
      await waitFor(() =>
        expect(
          parseReportCollection(stored.get(reportSessionKey(server)) ?? null)
            ?.description,
        ).toBe(edited),
      );
    } finally {
      await act(async () => finishStop({ logs: 'captured before expiry' }));
    }
    await view.findByLabelText('Submit / retry report');
    await view.unmount();
    view = await mount();
    await view.findByLabelText('Submit / retry report');
    expect(
      view.getByLabelText('Describe the problem and reproduction steps').props
        .value,
    ).toBe(edited);
    expect(
      view.getByLabelText(
        'Include diagnostic support information and sanitized debug logs',
      ).props.value,
    ).toBe(false);
    expect(
      parseReportCollection(stored.get(reportSessionKey(server)) ?? null),
    ).toEqual(
      expect.objectContaining({
        startedAt: original.startedAt,
        wasDebug: original.wasDebug,
        phase: 'stopped',
        logs: 'captured before expiry',
        description: edited,
        includeSupportInfo: false,
      }),
    );
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
  });
  it('serializes edits after an in-flight stop write and hydration waits for the latest draft', async () => {
    const original = { ...session, startedAt: Date.now() };
    stored.set(reportSessionKey(server), JSON.stringify(original));
    let finishWrite: (() => void) | undefined;
    jest
      .mocked(AsyncStorage.setItem)
      .mockImplementationOnce(async (key, value) => {
        await new Promise<void>(resolve => {
          finishWrite = resolve;
        });
        stored.set(key, value);
      });
    const stopping = stopReportCollection(server, original);
    let edited: ReturnType<typeof editReportCollection> | undefined;
    let resumed: ReturnType<typeof loadReportCollection> | undefined;
    try {
      await waitFor(() => expect(finishWrite).toEqual(expect.any(Function)));
      edited = editReportCollection(server, original.startedAt, {
        description: 'Latest steps queued behind automatic stop',
        includeSupportInfo: false,
      });
      resumed = loadReportCollection(server);
      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    } finally {
      finishWrite?.();
      await stopping;
    }
    await edited;
    expect(await resumed).toEqual(
      expect.objectContaining({
        startedAt: original.startedAt,
        wasDebug: original.wasDebug,
        phase: 'stopped',
        logs: 'sanitized reproduction trace',
        description: 'Latest steps queued behind automatic stop',
        email: original.email,
        includeSupportInfo: false,
      }),
    );
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
  });
  it('surfaces edit persistence errors without resetting consent and permits a saved retry', async () => {
    const original = { ...session, startedAt: Date.now() };
    stored.set(reportSessionKey(server), JSON.stringify(original));
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('Device disk full'));
    const view = await mount();
    await view.findByLabelText('Stop and submit report');
    const consent = view.getByLabelText(
      'Include diagnostic support information and sanitized debug logs',
    );
    await fireEvent(consent, 'valueChange', false);
    expect(
      await view.findByText(/Unable to save report edits: Device disk full/),
    ).toBeTruthy();
    expect(
      view.getByLabelText(
        'Include diagnostic support information and sanitized debug logs',
      ).props.value,
    ).toBe(false);
    await fireEvent.changeText(
      view.getByLabelText('Describe the problem and reproduction steps'),
      'Retried draft save after freeing device storage',
    );
    await waitFor(() =>
      expect(
        parseReportCollection(stored.get(reportSessionKey(server)) ?? null)
          ?.includeSupportInfo,
      ).toBe(false),
    );
    expect(
      parseReportCollection(stored.get(reportSessionKey(server)) ?? null),
    ).toEqual(
      expect.objectContaining({
        startedAt: original.startedAt,
        wasDebug: original.wasDebug,
        phase: 'logging',
      }),
    );
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
  });
  it('attaches/removes a screenshot and submits only after explicit user action; failed submission is retryable', async () => {
    stored.set(
      reportSessionKey(server),
      JSON.stringify({ ...session, startedAt: Date.now() }),
    );
    jest.mocked(launchImageLibrary).mockResolvedValue({
      assets: [{ base64: 'c2NyZWVu', type: 'image/jpeg' }],
    });
    jest
      .mocked(systemApi.submitBugReport)
      .mockRejectedValueOnce(new Error('Report endpoint unavailable'));
    const view = await mount();
    await view.findByLabelText('Stop and submit report');
    await fireEvent.press(view.getByLabelText('Attach screenshot'));
    expect(
      await view.findByLabelText('Attached screenshot preview'),
    ).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Remove screenshot'));
    expect(view.queryByLabelText('Attached screenshot preview')).toBeNull();
    await fireEvent.press(view.getByLabelText('Attach screenshot'));
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Stop and submit report'));
    expect(await view.findByText('Report endpoint unavailable')).toBeTruthy();
    expect(systemApi.stopBugReportLogging).toHaveBeenCalledWith(true);
    expect(systemApi.submitBugReport).toHaveBeenCalledWith(
      expect.objectContaining({
        debug_logs: 'sanitized reproduction trace',
        screenshot_base64: 'data:image/jpeg;base64,c2NyZWVu',
        description: session.description,
        email: session.email,
      }),
    );
    await fireEvent.press(view.getByLabelText('Submit / retry report'));
    expect(await view.findByText('Issue created')).toBeTruthy();
    expect(systemApi.stopBugReportLogging).toHaveBeenCalledTimes(1);
    expect(stored.has(reportSessionKey(server))).toBe(false);
  });
  it('expires resumed sessions, restores the prior debug setting and never auto-submits', async () => {
    stored.set(
      reportSessionKey(server),
      JSON.stringify({ ...session, startedAt: Date.now() - 301000 }),
    );
    const view = await mount();
    await waitFor(() =>
      expect(systemApi.stopBugReportLogging).toHaveBeenCalledWith(true),
    );
    expect(await view.findByLabelText('Submit / retry report')).toBeTruthy();
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
    expect(
      parseReportCollection(stored.get(reportSessionKey(server)) ?? null)
        ?.phase,
    ).toBe('stopped');
  });
  it('retains the resumable session after stop failure, and never submits if restoration fails', async () => {
    stored.set(
      reportSessionKey(server),
      JSON.stringify({ ...session, startedAt: Date.now() }),
    );
    jest
      .mocked(systemApi.stopBugReportLogging)
      .mockRejectedValueOnce(new Error('Server offline'));
    const view = await mount();
    await view.findByLabelText('Stop and submit report');
    await fireEvent.press(view.getByLabelText('Stop and submit report'));
    expect(await view.findByText('Server offline')).toBeTruthy();
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
    expect(
      parseReportCollection(stored.get(reportSessionKey(server)) ?? null)
        ?.phase,
    ).toBe('logging');
    await fireEvent.press(
      view.getByLabelText('Stop collection without submitting'),
    );
    await view.findByLabelText('Submit / retry report');
    expect(systemApi.stopBugReportLogging).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid persisted sessions and scopes them to the configured server', async () => {
    expect(parseReportCollection('{invalid')).toBeNull();
    expect(
      parseReportCollection(JSON.stringify({ startedAt: 'yesterday' })),
    ).toBeNull();
    stored.set(
      reportSessionKey('https://different-server.test'),
      JSON.stringify(session),
    );
    const view = await mount();
    await view.findByLabelText('Start diagnostic logging');
    expect(view.queryByLabelText('Stop and submit report')).toBeNull();
    expect(systemApi.stopBugReportLogging).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent timer/user stops so logging restoration cannot race', async () => {
    await Promise.all([
      stopReportCollection(server, session),
      stopReportCollection(server, session),
    ]);
    expect(systemApi.stopBugReportLogging).toHaveBeenCalledTimes(1);
  });
  it('shows real diagnostic failures and actionable remediation before collection', async () => {
    jest
      .mocked(printersApi.getPrinters)
      .mockResolvedValue([{ id: 1, name: 'Workshop printer' }] as never);
    jest.mocked(systemApi.getReportPrinterDiagnostic).mockResolvedValue({
      printer_id: 1,
      ip_address: '192.168.1.10',
      overall: 'problems',
      checks: [
        {
          id: 'mqtt_auth',
          status: 'fail',
          params: { reason: 'auth_rejected' },
        },
      ],
    });
    const view = await mount();
    expect(await view.findByText(/Workshop printer · problems/)).toBeTruthy();
    expect(view.getByText(/Re-copy the current LAN access code/)).toBeTruthy();
    expect(systemApi.startBugReportLogging).not.toHaveBeenCalled();
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
  });
  it('restores logging if persisting a newly-started collection fails', async () => {
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('Device storage unavailable'));
    const view = await mount();
    await fireEvent.changeText(
      view.getByLabelText('Describe the problem and reproduction steps'),
      session.description,
    );
    await fireEvent.press(view.getByLabelText('Start diagnostic logging'));
    expect(await view.findByText('Device storage unavailable')).toBeTruthy();
    expect(systemApi.stopBugReportLogging).toHaveBeenCalledWith(false);
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
  });
  it('surfaces automatic expiry restoration errors and retains a deliberate stop retry', async () => {
    stored.set(
      reportSessionKey(server),
      JSON.stringify({ ...session, startedAt: Date.now() - 301000 }),
    );
    jest
      .mocked(systemApi.stopBugReportLogging)
      .mockRejectedValueOnce(new Error('Server unreachable'));
    const view = await mount();
    expect(
      await view.findByText(
        /logging could not be restored: Server unreachable/,
      ),
    ).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText('Stop collection without submitting'),
    );
    await view.findByLabelText('Submit / retry report');
    expect(systemApi.stopBugReportLogging).toHaveBeenCalledTimes(2);
    expect(systemApi.submitBugReport).not.toHaveBeenCalled();
  });
});
