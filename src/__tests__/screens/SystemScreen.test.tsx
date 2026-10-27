import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SystemScreen from '@/screens/SystemScreen';
import { SystemHealthPanel } from '@/components/system/SystemHealthPanel';
import { systemApi } from '@/api/system';

const mockSetOptions = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
jest.mock('@/components/system/ApplicationLogTools', () => ({
  ApplicationLogTools: () => null,
}));
jest.mock('@/components/system/ServerUpdateTools', () => ({
  ServerUpdateTools: () => null,
}));
jest.mock('@/components/system/BugReportTools', () => ({
  BugReportTools: () => null,
}));
jest.mock('@/api/system', () => ({
  systemApi: {
    getSystemInfo: jest.fn(),
    getSystemHealth: jest.fn(),
    getStorageUsage: jest.fn(),
    getDebugLoggingState: jest.fn(),
    setDebugLogging: jest.fn(),
    downloadSupportBundle: jest.fn(),
  },
}));
jest.mock('@/utils/share', () => ({ shareBlob: jest.fn() }));
async function mount(node: React.ReactNode = <SystemScreen />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}
describe('system information, storage and health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(systemApi.getSystemInfo).mockResolvedValue({
      app: { version: '2.0' },
      database: { total_print_time_formatted: '72h', total_filament_kg: null },
      printers: {
        connected: 1,
        connected_list: [
          { id: 2, name: 'Workshop X1', model: 'X1C', state: 'IDLE' },
        ],
      },
      system: {
        platform: 'Linux',
        python_version: '3.12',
        hostname: 'farm-server',
      },
      cpu: { count: null },
      memory: {},
      storage: {},
    } as never);
    jest
      .mocked(systemApi.getSystemHealth)
      .mockResolvedValue({
        log_available: true,
        scanned_entries: 42,
        findings: [],
        summary: { total: 0, bug: 0, environment: 0, layer8: 0 },
      });
    jest.mocked(systemApi.getStorageUsage).mockResolvedValue({
      total_formatted: '20 GB',
      scan_errors: 3,
      roots: ['/data'],
      generated_at: 'today',
      categories: [
        {
          key: 'new-category',
          label: 'New server category',
          formatted: '4 GB',
          percent_of_total: 20,
        },
      ],
      other_breakdown: [
        {
          bucket: 'cache',
          label: 'Cloud cache',
          formatted: '2 GB',
          percent_of_total: 10,
          kind: 'data',
          deletable: true,
        },
      ],
    } as never);
    jest
      .mocked(systemApi.getDebugLoggingState)
      .mockResolvedValue({ enabled: false } as never);
  });
  it('renders all server categories and other details, exposes scan errors and forces refreshed scans', async () => {
    const view = await mount();
    expect(await view.findByText(/New server category: 4 GB/)).toBeTruthy();
    expect(view.getByText(/Cloud cache: 2 GB/)).toBeTruthy();
    expect(view.getByText(/3 scan errors/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Rescan storage'));
    await waitFor(() =>
      expect(systemApi.getStorageUsage).toHaveBeenCalledTimes(2),
    );
    expect(systemApi.getStorageUsage).toHaveBeenLastCalledWith({
      refresh: true,
    });
  });
  it('renders printer identities/runtime/statistics while retaining absent-value semantics', async () => {
    const view = await mount();
    expect(await view.findByText(/Workshop X1/)).toBeTruthy();
    expect(view.getByText(/total print time formatted: 72h/)).toBeTruthy();
    expect(view.getByText(/total filament kg: Unavailable/)).toBeTruthy();
    expect(view.getByText(/python version: 3.12/)).toBeTruthy();
    expect(view.getByText(/CPU · count: Unavailable/)).toBeTruthy();
    expect(view.queryByText(/total filament kg: 0/)).toBeNull();
  });
  it('shows categorized findings, cause, remediation, sanitized sample and focused rescanning', async () => {
    jest.mocked(systemApi.getSystemHealth).mockResolvedValue({
      log_available: true,
      scanned_entries: 42,
      summary: { total: 1, bug: 0, environment: 1, layer8: 0 },
      findings: [
        {
          signature_id: 'database-locked',
          severity: 'error',
          category: 'environment',
          wiki_anchor: 'database-is-locked',
          count: 4,
          first_seen: 'yesterday',
          last_seen: 'today',
          sample: 'database is locked',
        },
      ],
    });
    const view = await mount();
    expect(await view.findByText(/Database write contention/)).toBeTruthy();
    expect(view.getByText(/Concurrent writes are locking/)).toBeTruthy();
    expect(view.getByText(/Consider migrating to PostgreSQL/)).toBeTruthy();
    expect(view.getByText('database is locked')).toBeTruthy();
    expect(view.getByText(/4 occurrences/)).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Rescan log health'));
    await waitFor(() =>
      expect(systemApi.getSystemHealth).toHaveBeenCalledTimes(2),
    );
    expect(systemApi.getSystemInfo).toHaveBeenCalledTimes(1);
  });
  it('distinguishes an unavailable scan from a clean one', async () => {
    const result = {
      log_available: false,
      findings: [],
      scanned_entries: 0,
      summary: { total: 0, bug: 0, environment: 0, layer8: 0 },
    };
    const view = await mount(<SystemHealthPanel result={result} />);
    expect(view.getByText(/health could not be assessed/)).toBeTruthy();
    await view.rerender(
      <SystemHealthPanel
        result={{ ...result, log_available: true, scanned_entries: 25 }}
      />,
    );
    expect(
      view.getByText('No known problems found in 25 scanned records.'),
    ).toBeTruthy();
    expect(view.queryByText(/health could not be assessed/)).toBeNull();
  });
  it('preserves fetch failures rather than silently presenting empty diagnostics', async () => {
    jest
      .mocked(systemApi.getSystemInfo)
      .mockRejectedValue(new Error('System info forbidden'));
    const view = await mount();
    expect(await view.findByText('System info forbidden')).toBeTruthy();
    expect(view.queryByText(/total filament kg: 0/)).toBeNull();
  });
});
