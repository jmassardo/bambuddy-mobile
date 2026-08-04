import React from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import { api } from '@/api/client';
import VirtualPrintersScreen from '@/screens/VirtualPrintersScreen';
import {
  clearTestQueryClients,
  createTestQueryClient,
} from '@/testUtils/queryClient';
import type { ApiEntity, VirtualPrinterConfig } from '@/types/api';

const mockShowToast = jest.fn();
let mockIsAdmin = true;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
  }),
}));

jest.mock('@/api/client', () => ({
  api: {
    getVirtualPrinterList: jest.fn(),
    createVirtualPrinter: jest.fn(),
    updateVirtualPrinter: jest.fn(),
    deleteVirtualPrinter: jest.fn(),
    startVirtualPrinter: jest.fn(),
    stopVirtualPrinter: jest.fn(),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdmin: mockIsAdmin,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
  }),
}));

jest.mock('@/components/settings/shared', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  const actual = jest.requireActual('@/components/settings/shared');
  return {
    ...actual,
    SimpleModal: ({
      visible,
      title,
      children,
    }: {
      visible: boolean;
      title: string;
      children: React.ReactNode;
    }) =>
      visible
        ? ReactModule.createElement(
            View,
            null,
            ReactModule.createElement(Text, null, title),
            children,
          )
        : null,
  };
});

jest.mock('@/components/common/ConfirmModal', () => {
  const ReactModule = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    ConfirmModal: ({
      visible,
      message,
      confirmLabel,
      onConfirm,
    }: {
      visible: boolean;
      message: string;
      confirmLabel: string;
      onConfirm: () => void;
    }) =>
      visible
        ? ReactModule.createElement(
            View,
            null,
            ReactModule.createElement(Text, null, message),
            ReactModule.createElement(
              Pressable,
              { onPress: onConfirm },
              ReactModule.createElement(Text, null, confirmLabel),
            ),
          )
        : null,
  };
});

jest.mock('@/components/common/StateScreens', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  return {
    LoadingScreen: ({ message }: { message: string }) =>
      ReactModule.createElement(Text, null, message),
    ErrorState: ({ message }: { message: string }) =>
      ReactModule.createElement(Text, null, message),
    EmptyState: ({
      title,
      message,
    }: {
      title: string;
      message: string;
    }) =>
      ReactModule.createElement(
        View,
        null,
        ReactModule.createElement(Text, null, title),
        ReactModule.createElement(Text, null, message),
      ),
  };
});

const stoppedPrinter: ApiEntity<VirtualPrinterConfig> = {
  id: 7,
  name: 'Alpha simulator',
  enabled: false,
  mode: 'queue',
  model: 'BL-P001',
  model_name: 'X1 Carbon',
  access_code_set: true,
  serial: 'VIRTUAL01',
  target_printer_id: null,
  auto_dispatch: false,
  queue_force_color_match: false,
  gcode_injection: false,
  tailscale_disabled: false,
  bind_ip: null,
  remote_interface_ip: null,
  position: 0,
  status: {
    running: false,
    pending_files: 2,
  },
};

function mockList(printers: VirtualPrinterConfig[] = [stoppedPrinter]) {
  jest.mocked(api.getVirtualPrinterList).mockResolvedValue({
    printers,
    models: {
      'BL-P001': 'X1 Carbon',
      'BL-A001': 'A1',
    },
  });
}

async function renderScreen(): Promise<{
  result: Awaited<ReturnType<typeof render>>;
  client: QueryClient;
  invalidateQueries: jest.SpyInstance;
}> {
  const client = createTestQueryClient();
  const invalidateQueries = jest.spyOn(client, 'invalidateQueries');
  const result = await render(
    <QueryClientProvider client={client}>
      <VirtualPrintersScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(api.getVirtualPrinterList).toHaveBeenCalled());
  return { result, client, invalidateQueries };
}

describe('VirtualPrintersScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockIsAdmin = true;
    mockList();
    jest.mocked(api.createVirtualPrinter).mockResolvedValue(stoppedPrinter);
    jest.mocked(api.updateVirtualPrinter).mockResolvedValue(stoppedPrinter);
    jest.mocked(api.deleteVirtualPrinter).mockResolvedValue(undefined);
    jest.mocked(api.startVirtualPrinter).mockResolvedValue(stoppedPrinter);
    jest.mocked(api.stopVirtualPrinter).mockResolvedValue(stoppedPrinter);
  });

  afterEach(async () => {
    await cleanup();
    clearTestQueryClients();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders configured virtual printers and their status', async () => {
    const { result } = await renderScreen();

    expect(await result.findByText('Alpha simulator')).toBeTruthy();
    expect(result.getByText('X1 Carbon • Pending 2')).toBeTruthy();
    expect(result.getByText('stopped')).toBeTruthy();
  });

  it('renders the loading state', async () => {
    let resolveRequest!: (value: {
      printers: Record<string, unknown>[];
      models: Record<string, unknown>;
    }) => void;
    jest.mocked(api.getVirtualPrinterList).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRequest = resolve;
        }),
    );
    const loadingClient = createTestQueryClient();
    const loading = await render(
      <QueryClientProvider client={loadingClient}>
        <VirtualPrintersScreen />
      </QueryClientProvider>,
    );
    expect(loading.getByText('Loading virtual printers...')).toBeTruthy();
    resolveRequest({ printers: [], models: {} });
    expect(await loading.findByText('No virtual printers')).toBeTruthy();
    await loading.unmount();
  });

  it('renders the error state', async () => {
    jest
      .mocked(api.getVirtualPrinterList)
      .mockRejectedValueOnce(new Error('offline'));
    const errorClient = createTestQueryClient();
    const error = await render(
      <QueryClientProvider client={errorClient}>
        <VirtualPrintersScreen />
      </QueryClientProvider>,
    );
    expect(
      await error.findByText('Unable to load virtual printers.'),
    ).toBeTruthy();
  });

  it('renders the empty state', async () => {
    mockList([]);
    const emptyClient = createTestQueryClient();
    const empty = await render(
      <QueryClientProvider client={emptyClient}>
        <VirtualPrintersScreen />
      </QueryClientProvider>,
    );
    expect(await empty.findByText('No virtual printers')).toBeTruthy();
  });

  it('creates a virtual printer and invalidates the list query', async () => {
    mockList([]);
    const { result, client, invalidateQueries } = await renderScreen();

    await fireEvent.press(
      await result.findByRole('button', { name: 'Create virtual printer' }),
    );
    await fireEvent.changeText(
      await result.findByDisplayValue('Bambuddy'),
      'Lab simulator',
    );
    await fireEvent.press(result.getByText('Create printer'));

    await waitFor(() =>
      expect(api.createVirtualPrinter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Lab simulator',
          model: 'BL-P001',
          enabled: false,
        }),
      ),
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['virtualPrinters'],
      }),
    );
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it('edits a virtual printer and invalidates the list query', async () => {
    const { result, client, invalidateQueries } = await renderScreen();

    await fireEvent.press(await result.findByRole('button', { name: 'Edit' }));
    await fireEvent.changeText(
      await result.findByDisplayValue('Alpha simulator'),
      'Updated simulator',
    );
    await fireEvent.press(result.getByText('Save printer'));

    await waitFor(() =>
      expect(api.updateVirtualPrinter).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          name: 'Updated simulator',
          model: 'BL-P001',
        }),
      ),
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['virtualPrinters'],
      }),
    );
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it('confirms before deleting and invalidates the list query', async () => {
    const { result, client, invalidateQueries } = await renderScreen();

    await fireEvent.press(
      await result.findByRole('button', { name: 'Delete' }),
    );

    expect(api.deleteVirtualPrinter).not.toHaveBeenCalled();
    expect(result.getByText('Delete Alpha simulator?')).toBeTruthy();

    const deleteLabels = result.getAllByText('Delete');
    await fireEvent.press(deleteLabels[deleteLabels.length - 1]);

    await waitFor(() =>
      expect(api.deleteVirtualPrinter).toHaveBeenCalledWith(7),
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['virtualPrinters'],
      }),
    );
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it('invalidates the list query after lifecycle mutations', async () => {
    const { result, client, invalidateQueries } = await renderScreen();

    await fireEvent.press(
      await result.findByRole('button', { name: 'Start' }),
    );

    await waitFor(() =>
      expect(api.startVirtualPrinter).toHaveBeenCalledWith(7),
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['virtualPrinters'],
      }),
    );
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it('keeps create input open and intact when saving fails', async () => {
    mockList([]);
    jest
      .mocked(api.createVirtualPrinter)
      .mockRejectedValueOnce(new Error('Create failed'));
    const { result, client } = await renderScreen();

    await fireEvent.press(
      await result.findByRole('button', { name: 'Create virtual printer' }),
    );
    await fireEvent.changeText(
      await result.findByDisplayValue('Bambuddy'),
      'Keep this',
    );
    await fireEvent.press(result.getByText('Create printer'));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Create failed', 'error'),
    );
    expect(result.getAllByText('Create virtual printer')).toHaveLength(2);
    expect(result.getByDisplayValue('Keep this')).toBeTruthy();
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it('keeps edit input open and intact when saving fails', async () => {
    jest
      .mocked(api.updateVirtualPrinter)
      .mockRejectedValueOnce(new Error('Update failed'));
    const { result, client } = await renderScreen();

    await fireEvent.press(await result.findByRole('button', { name: 'Edit' }));
    await fireEvent.changeText(
      await result.findByDisplayValue('Alpha simulator'),
      'Unsaved update',
    );
    await fireEvent.press(result.getByText('Save printer'));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('Update failed', 'error'),
    );
    expect(result.getByText('Edit virtual printer')).toBeTruthy();
    expect(result.getByDisplayValue('Unsaved update')).toBeTruthy();
    await waitFor(() => expect(client.isMutating()).toBe(0));
  });

  it('hides management controls from non-admin users', async () => {
    mockIsAdmin = false;
    const { result } = await renderScreen();

    expect(await result.findByText('Alpha simulator')).toBeTruthy();
    expect(result.queryByText('Create virtual printer')).toBeNull();
    expect(result.queryByText('Edit')).toBeNull();
    expect(result.queryByText('Delete')).toBeNull();
    expect(result.getByText('Start')).toBeTruthy();
  });
});
