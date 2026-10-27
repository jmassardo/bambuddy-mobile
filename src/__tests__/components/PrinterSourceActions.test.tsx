import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrinterSourceActions } from '@/components/printers/PrinterSourceActions';
import { api } from '@/api/client';
import type { Permission } from '@/types/api';

let mockPermissions: Permission[] = [];
let mockUserId = 3;
let mockServer = 'https://farm.test';
const mockPrint = jest.fn();
const mockOutcome = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: mockUserId },
    hasPermission: (permission: Permission) =>
      mockPermissions.includes(permission),
  }),
}));
jest.mock('@/api/server', () => ({
  useServerStore: (select: (state: { serverUrl: string }) => unknown) =>
    select({ serverUrl: mockServer }),
}));
jest.mock('@/api/client', () => ({
  api: {
    getArchives: jest.fn(),
    updateArchive: jest.fn(),
    clearPlate: jest.fn(),
    printArchive: jest.fn(),
  },
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: { text: '#ffffff' } }),
}));
jest.mock('@/components/printers/PrintModal', () => ({
  PrintModal: (props: Record<string, unknown>) => {
    mockPrint(props);
    const { Text, Pressable } = require('react-native');
    return (
      <Pressable onPress={props.onClose}>
        <Text>Native print cleanup finished</Text>
      </Pressable>
    );
  },
}));
jest.mock('@/components/archives/ArchiveWorkflowUI', () => ({
  ConfirmOutcomeDialog: (props: Record<string, unknown>) => {
    mockOutcome(props);
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable
        onPress={() => {
          (props.onClose as () => void)();
          (props.onReprint as (mockArchiveId: number) => void)(
            props.archiveId as number,
          );
        }}
      >
        <Text>Dialog dismissed: reprint</Text>
      </Pressable>
    );
  },
}));

const latest = {
  id: 21,
  filename: 'part.gcode.3mf',
  print_name: 'Part',
  status: 'completed',
  confirm_requested: true,
  user_verdict: null,
  created_by_id: 3,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = ['archives:read_all', 'archives:update_own'];
  mockUserId = 3;
  mockServer = 'https://farm.test';
  jest.mocked(api.getArchives).mockResolvedValue([latest] as never);
  jest.mocked(api.updateArchive).mockResolvedValue({});
});

async function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const screen = await render(
    <QueryClientProvider client={client}>
      <PrinterSourceActions printerId={5} />
    </QueryClientProvider>,
  );
  return { screen, client, invalidate };
}

it('offers the latest outcome without a live printer or plate-clear state, and Good changes only the verdict', async () => {
  const { screen, invalidate } = await setup();
  await screen.findByText('Confirm outcome: Part');
  expect(api.getArchives).toHaveBeenCalledWith({
    printerId: 5,
    limit: 1,
    offset: 0,
  });
  await fireEvent.press(screen.getByText('Good'));
  await waitFor(() =>
    expect(api.updateArchive).toHaveBeenCalledWith(21, {
      user_verdict: 'good',
      user_verdict_source: 'printer_card',
      failure_reason: null,
    }),
  );
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['printerStatus', 5] }),
  );
  for (const key of [
    ['archives'],
    ['archive', 21],
    ['failureAnalysis'],
    ['stats'],
    ['projects'],
  ]) {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  }
  expect(api.clearPlate).not.toHaveBeenCalled();
});

it.each([
  ['not completed', { status: 'failed' }],
  ['not requested', { confirm_requested: false }],
  ['already answered', { user_verdict: 'good' }],
  ['not owned', { created_by_id: 99 }],
])(
  'does not offer an outcome when %s, even if an older archive is pending',
  async (_, change) => {
    jest
      .mocked(api.getArchives)
      .mockResolvedValue([{ ...latest, ...change }, latest] as never);
    const { screen, client } = await setup();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await waitFor(() => expect(screen.queryByText('Good')).toBeNull());
  },
);

it('allows update_all for another owner but never reads archives without a read permission', async () => {
  mockUserId = 99;
  mockPermissions = ['archives:read_own', 'archives:update_all'];
  const first = await setup();
  await first.screen.findByText('Good');
  await first.screen.unmount();
  jest.clearAllMocks();
  mockPermissions = ['archives:update_all'];
  const { screen } = await setup();
  expect(api.getArchives).not.toHaveBeenCalled();
  expect(screen.queryByText('Good')).toBeNull();
});

it('does not offer a verdict with read-only permissions', async () => {
  mockPermissions = ['archives:read_all'];
  const { screen } = await setup();
  expect(api.getArchives).not.toHaveBeenCalled();
  expect(screen.queryByText('Good')).toBeNull();
});

it('opens rejection with dialog provenance, then configurable archive printing only via the public callback', async () => {
  const { screen, client } = await setup();
  await screen.findByText('Reject');
  await fireEvent.press(screen.getByText('Reject'));
  expect(mockOutcome).toHaveBeenLastCalledWith(
    expect.objectContaining({ archiveId: 21 }),
  );
  expect(mockOutcome.mock.calls.at(-1)?.[0]).not.toHaveProperty('source');
  expect(mockPrint).not.toHaveBeenCalled();
  await act(() =>
    client.setQueriesData({ queryKey: ['archives'] }, [
      { ...latest, user_verdict: 'reject' },
    ]),
  );
  await waitFor(() => expect(screen.queryByText('Good')).toBeNull());
  expect(screen.getByText('Dialog dismissed: reprint')).toBeTruthy();
  await fireEvent.press(screen.getByText('Dialog dismissed: reprint'));
  expect(mockPrint).toHaveBeenLastCalledWith(
    expect.objectContaining({
      visible: true,
      initialArchiveId: 21,
      initialPrinterId: 5,
      initialMode: 'asap',
    }),
  );
  expect(api.printArchive).not.toHaveBeenCalled();
  expect(api.clearPlate).not.toHaveBeenCalled();
});

it.each<Permission[]>([['queue:create'], ['library:upload'], []])(
  'requires both upload and queue permissions (%j)',
  async (...permissions) => {
    mockPermissions = permissions;
    const { screen } = await setup();
    expect(screen.queryByText('Upload & Print')).toBeNull();
  },
);

it('opens native upload printing without a synthetic source and closes only through its cleanup callback', async () => {
  mockPermissions = ['queue:create', 'library:upload'];
  const { screen } = await setup();
  await fireEvent.press(screen.getByText('Upload & Print'));
  const props = mockPrint.mock.calls.at(-1)?.[0];
  expect(props).toEqual(
    expect.objectContaining({
      visible: true,
      initialPrinterId: 5,
      initialMode: 'asap',
      uploadForPrinter: true,
    }),
  );
  expect(props).not.toHaveProperty('initialArchiveId');
  expect(props).not.toHaveProperty('initialFileId');
  expect(screen.getByText('Native print cleanup finished')).toBeTruthy();
  await fireEvent.press(screen.getByText('Native print cleanup finished'));
  expect(screen.queryByText('Native print cleanup finished')).toBeNull();
});

it('partitions the latest archive cache by server and user', async () => {
  const { screen, client } = await setup();
  await screen.findByText('Good');
  mockServer = 'https://other-farm.test';
  mockUserId = 9;
  await screen.rerender(
    <QueryClientProvider client={client}>
      <PrinterSourceActions printerId={5} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(api.getArchives).toHaveBeenCalledTimes(2));
  const keys = client
    .getQueryCache()
    .getAll()
    .map(query => query.queryKey);
  expect(keys).toEqual(
    expect.arrayContaining([
      expect.arrayContaining(['https://farm.test', 3]),
      expect.arrayContaining(['https://other-farm.test', 9]),
    ]),
  );
});
