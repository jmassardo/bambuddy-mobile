import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import SpoolBuddyScreen from '@/screens/SpoolBuddyScreen';
import {
  clearTestQueryClients,
  createTestQueryClient,
} from '@/testUtils/queryClient';

const mockSetOptions = jest.fn();
const mockShowToast = jest.fn();
const mockGetDevices = jest.fn();
const mockCreateDevice = jest.fn();
const mockUpdateDevice = jest.fn();
const mockDeleteDevice = jest.fn();
const mockCalibrateDevice = jest.fn();

const device = {
  id: 7,
  device_id: 'spoolbuddy-7',
  hostname: 'Workshop Buddy',
  ip_address: '192.168.1.77',
  backend_url: 'https://bambuddy.test',
  firmware_version: '1.2.3',
  has_nfc: true,
  has_scale: true,
  tare_offset: 0,
  calibration_factor: 1,
  nfc_reader_type: null,
  nfc_connection: null,
  display_brightness: 75,
  display_blank_timeout: 120,
  has_backlight: true,
  last_calibrated_at: null,
  last_seen: '2026-08-04T18:00:00.000Z',
  pending_command: null,
  nfc_ok: true,
  scale_ok: true,
  uptime_s: 3661,
  update_status: null,
  update_message: null,
  system_stats: null,
  online: true,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock('@/api/client', () => ({
  api: {
    getSpoolBuddyDevices: (...args: unknown[]) => mockGetDevices(...args),
    createSpoolBuddyDevice: (...args: unknown[]) => mockCreateDevice(...args),
    updateSpoolBuddyDevice: (...args: unknown[]) => mockUpdateDevice(...args),
    deleteSpoolBuddyDevice: (...args: unknown[]) => mockDeleteDevice(...args),
    calibrateSpoolBuddy: (...args: unknown[]) =>
      mockCalibrateDevice(...args),
  },
}));

jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    PrimaryButton: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) =>
      React.createElement(
        Pressable,
        { accessibilityLabel: label, disabled, onPress },
        React.createElement(Text, null, label),
      ),
    SectionCard: ({
      title,
      subtitle,
      children,
    }: {
      title: string;
      subtitle?: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        subtitle ? React.createElement(Text, null, subtitle) : null,
        children,
      ),
    StatusBadge: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
    TextField: ({
      label,
      ...props
    }: {
      label: string;
      value: string;
      onChangeText: (value: string) => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, label),
        React.createElement(TextInput, { placeholder: label, ...props }),
      ),
  };
});

jest.mock('@/components/common/ConfirmModal', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    ConfirmModal: ({
      visible,
      title,
      message,
      confirmLabel,
      onClose,
      onConfirm,
    }: {
      visible: boolean;
      title: string;
      message: string;
      confirmLabel: string;
      onClose: () => void;
      onConfirm: () => void;
    }) =>
      visible
        ? React.createElement(
            View,
            null,
            React.createElement(Text, null, title),
            React.createElement(Text, null, message),
            React.createElement(
              Pressable,
              { accessibilityLabel: 'cancel-remove', onPress: onClose },
              React.createElement(Text, null, 'Cancel'),
            ),
            React.createElement(
              Pressable,
              { accessibilityLabel: 'confirm-remove', onPress: onConfirm },
              React.createElement(Text, null, confirmLabel),
            ),
          )
        : null,
  };
});

jest.mock('@/components/common/StateScreens', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    EmptyState: ({
      title,
      message,
    }: {
      title: string;
      message?: string;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        message ? React.createElement(Text, null, message) : null,
      ),
    ErrorState: ({ message }: { message: string }) =>
      React.createElement(Text, null, message),
    LoadingScreen: ({ message }: { message: string }) =>
      React.createElement(Text, null, message),
  };
});

jest.mock('@/components/settings/shared', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
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
        ? React.createElement(
            View,
            null,
            React.createElement(Text, null, title),
            children,
          )
        : null,
  };
});

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
  }),
}));

async function renderScreen() {
  const queryClient = createTestQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    mutations: {
      ...queryClient.getDefaultOptions().mutations,
      gcTime: 0,
    },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  return {
    ...(await render(
      <QueryClientProvider client={queryClient}>
        <SpoolBuddyScreen />
      </QueryClientProvider>,
    )),
    invalidateQueries,
  };
}

describe('SpoolBuddyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDevices.mockResolvedValue([device]);
    mockCreateDevice.mockResolvedValue(device);
    mockUpdateDevice.mockResolvedValue(device);
    mockDeleteDevice.mockResolvedValue(undefined);
    mockCalibrateDevice.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanup();
    clearTestQueryClients();
  });

  it('renders paired devices with connection status and last-seen time', async () => {
    const screen = await renderScreen();

    expect(await screen.findByText('Workshop Buddy')).toBeTruthy();
    expect(screen.getByText('online')).toBeTruthy();
    expect(screen.getByText(/Last seen:/)).toBeTruthy();
    expect(screen.getByText(/Uptime: 1h 1m/)).toBeTruthy();
  });

  it('renders never when last_seen is null', async () => {
    mockGetDevices.mockResolvedValue([{ ...device, last_seen: null }]);
    const screen = await renderScreen();

    expect(await screen.findByText(/Last seen: never/)).toBeTruthy();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });

  it('renders the loading state', async () => {
    let resolveDevices!: (devices: typeof device[]) => void;
    mockGetDevices.mockReturnValue(
      new Promise(resolve => {
        resolveDevices = resolve;
      }),
    );
    const screen = await renderScreen();

    expect(screen.getByText('Loading SpoolBuddy devices…')).toBeTruthy();
    resolveDevices([]);
    await screen.findByText('No SpoolBuddy devices found');
  });

  it('renders the error state', async () => {
    mockGetDevices.mockRejectedValue(new Error('offline'));
    const screen = await renderScreen();

    expect(
      await screen.findByText('Unable to load SpoolBuddy devices.'),
    ).toBeTruthy();
  });

  it('renders the empty state', async () => {
    mockGetDevices.mockResolvedValue([]);
    const screen = await renderScreen();

    expect(
      await screen.findByText('No SpoolBuddy devices found'),
    ).toBeTruthy();
  });

  it('registers a device and invalidates the device list', async () => {
    mockGetDevices.mockResolvedValue([]);
    const screen = await renderScreen();
    await screen.findByText('No SpoolBuddy devices found');

    await fireEvent.press(screen.getByLabelText('Add device'));
    await screen.findByText('Add SpoolBuddy device');
    await fireEvent.changeText(
      screen.getByPlaceholderText('Device ID'),
      ' new-device ',
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('Hostname'),
      ' New Buddy ',
    );
    await fireEvent.press(screen.getAllByLabelText('Add device')[1]);

    await waitFor(() => {
      expect(mockCreateDevice).toHaveBeenCalledWith({
        device_id: 'new-device',
        hostname: 'New Buddy',
        ip_address: null,
        backend_url: null,
        api_key: null,
      });
      expect(screen.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['spoolbuddyDevices'],
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        'SpoolBuddy device added.',
        'success',
      );
      expect(screen.queryByText('Add SpoolBuddy device')).toBeNull();
    });
  });

  it('updates a device and invalidates the device list', async () => {
    const screen = await renderScreen();
    await screen.findByText('Workshop Buddy');

    await fireEvent.press(screen.getByLabelText('Configure'));
    await screen.findByText('Configure SpoolBuddy');
    await fireEvent.changeText(
      screen.getByPlaceholderText('Hostname'),
      'Renamed Buddy',
    );
    await fireEvent.press(screen.getByLabelText('Save'));

    await waitFor(() => {
      expect(mockUpdateDevice).toHaveBeenCalledWith(
        'spoolbuddy-7',
        expect.objectContaining({ hostname: 'Renamed Buddy' }),
      );
      expect(screen.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['spoolbuddyDevices'],
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        'SpoolBuddy settings updated.',
        'success',
      );
      expect(screen.queryByText('Configure SpoolBuddy')).toBeNull();
    });
  });

  it('requires confirmation before deleting and invalidates after confirm', async () => {
    const screen = await renderScreen();
    await screen.findByText('Workshop Buddy');

    await fireEvent.press(screen.getByLabelText('Remove'));
    expect(mockDeleteDevice).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Remove SpoolBuddy device'),
    ).toBeTruthy();
    expect(screen.getByText('Remove Workshop Buddy?')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('confirm-remove'));

    await waitFor(() => {
      expect(mockDeleteDevice).toHaveBeenCalledWith('spoolbuddy-7');
      expect(screen.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['spoolbuddyDevices'],
      });
      expect(mockShowToast).toHaveBeenCalledWith(
        'SpoolBuddy device removed.',
        'success',
      );
      expect(screen.queryByText('Remove SpoolBuddy device')).toBeNull();
    });
  });

  it('reports a failed mutation and preserves the modal input', async () => {
    mockGetDevices.mockResolvedValue([]);
    mockCreateDevice.mockRejectedValue(new Error('Registration failed'));
    const screen = await renderScreen();
    await screen.findByText('No SpoolBuddy devices found');

    await fireEvent.press(screen.getByLabelText('Add device'));
    await screen.findByText('Add SpoolBuddy device');
    await fireEvent.changeText(
      screen.getByPlaceholderText('Device ID'),
      'spoolbuddy-new',
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('Hostname'),
      'Garage Buddy',
    );
    await fireEvent.press(screen.getAllByLabelText('Add device')[1]);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Registration failed',
        'error',
      );
      expect(screen.queryByText('Adding…')).toBeNull();
    });
    expect(screen.getByText('Add SpoolBuddy device')).toBeTruthy();
    expect(screen.getByPlaceholderText('Device ID').props.value).toBe(
      'spoolbuddy-new',
    );
    expect(screen.getByPlaceholderText('Hostname').props.value).toBe(
      'Garage Buddy',
    );
  });
});
