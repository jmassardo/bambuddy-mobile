import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PrintLogScreen from '@/screens/PrintLogScreen';
import { archivesApi } from '@/api/archives';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { api } from '@/api/client';
import type { PrintLogEntry } from '@/types/api';

let mockArchiveId: number | undefined;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useRoute: () => ({ params: { archiveId: mockArchiveId } }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, hasPermission: () => true }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: {},
  isErrorWithCode: () => false,
  errorCodes: {},
}));
jest.mock('@/api/archives', () => ({
  archivesApi: { getPrintLogs: jest.fn(), getArchivePrintLog: jest.fn() },
}));
jest.mock('@/api/archiveWorkflows', () => ({
  archiveWorkflows: {
    updateRun: jest.fn(),
    deleteRun: jest.fn(),
    clearRuns: jest.fn(),
  },
}));
jest.mock('@/api/client', () => ({
  api: {
    getPrinters: jest.fn(),
    getUsers: jest.fn(),
    updateArchive: jest.fn(),
  },
}));
const entry = {
  id: 44,
  archive_id: 7,
  print_name: 'Actual run',
  status: 'completed',
  created_by_id: 1,
  created_at: '2026-10-27T10:00:00',
  energy_kwh: 1.25,
  energy_cost: 0.5,
} as PrintLogEntry;
const wrap = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
            mutations: { retry: false, gcTime: Infinity },
          },
        })
      }
    >
      <PrintLogScreen />
    </QueryClientProvider>,
  );
beforeEach(() => {
  jest.clearAllMocks();
  mockArchiveId = undefined;
  jest
    .mocked(archivesApi.getPrintLogs)
    .mockResolvedValue({ items: [entry], total: 1001 } as Awaited<
      ReturnType<typeof archivesApi.getPrintLogs>
    >);
  jest
    .mocked(archivesApi.getArchivePrintLog)
    .mockResolvedValue([entry as unknown as Record<string, unknown>]);
  jest.mocked(api.getPrinters).mockResolvedValue([]);
  jest.mocked(api.getUsers).mockResolvedValue([]);
});

it('reaches records after 500 through server pagination and exposes energy data', async () => {
  const result = await wrap();
  await waitFor(() => expect(result.getByText('1.25 kWh')).toBeTruthy());
  await fireEvent.press(result.getByText('Last'));
  await waitFor(() =>
    expect(archivesApi.getPrintLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50, offset: 1000 }),
    ),
  );
});

it('uses only archive-scoped runs when launched from archive detail', async () => {
  mockArchiveId = 7;
  const result = await wrap();
  await waitFor(() =>
    expect(result.getAllByText('Actual run').length).toBeGreaterThan(0),
  );
  expect(archivesApi.getArchivePrintLog).toHaveBeenCalledWith(7);
  expect(archivesApi.getPrintLogs).not.toHaveBeenCalled();
  expect(result.queryByText('Clear entire print log')).toBeNull();
});

it('combines exact username and inclusive date bounds in requests', async () => {
  const result = await wrap();
  await fireEvent.changeText(
    result.getByLabelText('Exact user name (blank = all)'),
    'alice',
  );
  await fireEvent.changeText(
    result.getByLabelText('From date (YYYY-MM-DD, inclusive)'),
    '2026-10-01',
  );
  await fireEvent.changeText(
    result.getByLabelText('To date (YYYY-MM-DD, inclusive)'),
    '2026-10-27',
  );
  await waitFor(() =>
    expect(archivesApi.getPrintLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({
        createdByUsername: 'alice',
        dateFrom: '2026-10-01T00:00:00',
        dateTo: '2026-10-27T23:59:59.999',
      }),
    ),
  );
});

it('corrects the selected run rather than mutating its linked archive', async () => {
  const result = await wrap();
  await waitFor(() =>
    expect(result.getByText('Correct this run')).toBeTruthy(),
  );
  await fireEvent.press(result.getByText('Correct this run'));
  const failed = result.getAllByText('failed');
  await fireEvent.press(failed[failed.length - 1]);
  await fireEvent.press(result.getByText('warping'));
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() =>
    expect(archiveWorkflows.updateRun).toHaveBeenCalledWith(44, {
      status: 'failed',
      failure_reason: 'warping',
    }),
  );
  expect(api.updateArchive).not.toHaveBeenCalled();
});
