import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import Clipboard from '@react-native-clipboard/clipboard';
import { RemoteSpoolBuddyPanel } from '@/components/spoolbuddy/RemoteSpoolBuddyPanel';
import { spoolbuddyApi } from '@/api/spoolbuddy';
import { ApiError } from '@/api/http';
import {
  publishSpoolBuddyEvent,
  resetSpoolBuddyEvents,
} from '@/hooks/spoolbuddyEvents';
import {
  createTestQueryClient,
  clearTestQueryClients,
} from '@/testUtils/queryClient';
import type { InventorySpool, SpoolBuddyDevice } from '@/types/api';

const mockPermission = jest.fn(() => true);
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: mockPermission }),
}));
jest.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ isConnected: true }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/api/spoolbuddy', () => ({
  spoolbuddyApi: {
    devices: jest.fn(),
    inventoryMode: jest.fn(),
    spools: jest.fn(),
    checkUpdate: jest.fn(),
    sshKey: jest.fn(),
    tare: jest.fn(),
    calibrate: jest.fn(),
    write: jest.fn(),
    cancelWrite: jest.fn(),
    command: jest.fn(),
    diagnose: jest.fn(),
    diagnosticResult: jest.fn(),
    update: jest.fn(),
    createSpool: jest.fn(),
    link: jest.fn(),
    weighSpoolman: jest.fn(),
    untag: jest.fn(),
  },
}));
jest.mock('@/components/common/AppUI', () => {
  const R = require('react');
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
      R.createElement(
        Pressable,
        { accessibilityLabel: label, disabled, onPress },
        R.createElement(Text, null, label),
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
      R.createElement(
        View,
        null,
        R.createElement(Text, null, title),
        R.createElement(Text, null, subtitle),
        children,
      ),
    TextField: ({ label, ...props }: { label: string }) =>
      R.createElement(TextInput, { accessibilityLabel: label, ...props }),
  };
});
jest.mock('@/components/settings/shared', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    SimpleModal: ({
      visible,
      children,
    }: {
      visible: boolean;
      children: React.ReactNode;
    }) => (visible ? R.createElement(View, null, children) : null),
  };
});
jest.mock('@/components/common/ConfirmModal', () => {
  const R = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    ConfirmModal: ({
      visible,
      title,
      message,
      onConfirm,
      onClose,
    }: {
      visible: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
      onClose: () => void;
    }) =>
      visible
        ? R.createElement(
            View,
            null,
            R.createElement(Text, null, title),
            R.createElement(Text, null, message),
            R.createElement(Pressable, {
              accessibilityLabel: 'Confirm remote action',
              onPress: onConfirm,
            }),
            R.createElement(Pressable, {
              accessibilityLabel: 'Cancel remote action',
              onPress: onClose,
            }),
          )
        : null,
  };
});

const mocks = jest.mocked(spoolbuddyApi);
const device: SpoolBuddyDevice = {
  id: 1,
  device_id: 'reader-a',
  hostname: 'Workshop reader',
  ip_address: '192.168.1.12',
  firmware_version: '1.0',
  has_nfc: true,
  has_scale: true,
  tare_offset: 15,
  calibration_factor: 0.1,
  nfc_reader_type: 'PN532',
  nfc_connection: 'SPI',
  display_brightness: 100,
  display_blank_timeout: 0,
  has_backlight: false,
  last_calibrated_at: null,
  last_seen: '2026-10-27T18:00:00Z',
  pending_command: null,
  nfc_ok: true,
  scale_ok: true,
  uptime_s: 25,
  update_status: null,
  update_message: null,
  system_stats: {
    cpu_temp_c: 45,
    memory: { percent: 24 },
    os: { kernel: 'test-kernel' },
  },
  online: true,
};
const untagged = {
  id: 10,
  material: 'PLA',
  label_weight: 1000,
  core_weight: 250,
  weight_used: 40,
  tag_uid: null,
  tray_uuid: null,
} as InventorySpool;
const tagged = { ...untagged, id: 11, material: 'PETG', tag_uid: 'AABBCCDD' };

async function setup() {
  const client = createTestQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    mutations: { retry: false, gcTime: 0 },
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <RemoteSpoolBuddyPanel deviceId="reader-a" />
    </QueryClientProvider>,
  );
  await screen.findByText('Workshop reader');
  await waitFor(() => expect(mocks.spools).toHaveBeenCalled());
  return { ...screen, client };
}
async function event(type: string, data: Record<string, unknown> = {}) {
  await act(async () => {
    publishSpoolBuddyEvent({
      type,
      ...{ data: { device_id: 'reader-a', ...data } },
    });
  });
}
async function confirm(screen: Awaited<ReturnType<typeof setup>>) {
  await fireEvent.press(screen.getByLabelText('Confirm remote action'));
  await waitFor(() =>
    expect(screen.queryByLabelText('Confirm remote action')).toBeNull(),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSpoolBuddyEvents();
  mockPermission.mockReturnValue(true);
  mocks.devices.mockResolvedValue([device]);
  mocks.inventoryMode.mockResolvedValue({ enabled: false });
  mocks.spools.mockResolvedValue([untagged, tagged]);
  mocks.checkUpdate.mockResolvedValue({
    current_version: '1.0',
    latest_version: '1.1',
    update_available: true,
  });
  mocks.sshKey.mockResolvedValue({
    public_key: 'ssh-ed25519 PUBLIC-TEST-KEY server',
  });
  mocks.write.mockResolvedValue({ status: 'queued' });
  mocks.tare.mockResolvedValue({ status: 'ok' });
  mocks.calibrate.mockResolvedValue({
    tare_offset: 15,
    calibration_factor: 0.2,
  });
  mocks.command.mockResolvedValue({
    status: 'queued',
    command: 'restart_daemon',
  });
  mocks.cancelWrite.mockResolvedValue({ status: 'ok' });
  mocks.diagnose.mockResolvedValue({ status: 'queued' });
  mocks.update.mockResolvedValue({
    status: 'ok',
    message: 'SSH update started',
  });
  mocks.createSpool.mockResolvedValue({ ...untagged, id: 12 });
  mocks.link.mockResolvedValue({ ...untagged, tag_uid: '04010203040506' });
  mocks.weighSpoolman.mockResolvedValue({ status: 'ok', weight_used: 438 });
  mocks.untag.mockResolvedValue(untagged);
});
afterEach(async () => {
  await cleanup();
  clearTestQueryClients();
  resetSpoolBuddyEvents();
  jest.useRealTimers();
});

it('surfaces matched, unknown and removed events only for the selected physical reader and links without phone NFC', async () => {
  const screen = await setup();
  await event('spoolbuddy_tag_matched', {
    device_id: 'reader-b',
    spool: tagged,
  });
  expect(screen.queryByText(/Matched #11/)).toBeNull();
  await event('spoolbuddy_tag_matched', {
    spool: tagged,
    tag_uid: tagged.tag_uid,
  });
  expect(screen.getByText(/Matched #11 PETG/)).toBeTruthy();
  await event('spoolbuddy_unknown_tag', { tag_uid: '04010203040506', sak: 0 });
  await fireEvent.press(screen.getByLabelText('Link unknown tag'));
  await fireEvent.press(screen.getByLabelText('#10 PLA'));
  await fireEvent.press(
    screen.getByLabelText('Confirm link to selected spool'),
  );
  expect(mocks.link).not.toHaveBeenCalled();
  await confirm(screen);
  expect(mocks.link).toHaveBeenCalledWith(false, 10, {
    tag_uid: '04010203040506',
    tray_uuid: undefined,
    data_origin: 'spoolbuddy',
  });
  expect(mocks.write).not.toHaveBeenCalled();
  await event('spoolbuddy_tag_removed');
  expect(screen.getByText('Tag removed from reader.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Dismiss scan result'));
  expect(screen.getByText('Waiting for a remote scan…')).toBeTruthy();
});

it('confirms quick-add with captured remote weight and UID, not later reader events', async () => {
  const screen = await setup();
  await event('spoolbuddy_weight', {
    weight_grams: 812.4,
    stable: true,
    raw_adc: 200,
  });
  await event('spoolbuddy_unknown_tag', { tag_uid: '04010203040506', sak: 0 });
  await fireEvent.press(screen.getByLabelText('Quick add spool'));
  expect(screen.getByText(/Captured scale: 812.4 g/)).toBeTruthy();
  await event('spoolbuddy_weight', { weight_grams: 200, raw_adc: 250 });
  await event('spoolbuddy_unknown_tag', { tag_uid: '04000000000000' });
  await confirm(screen);
  expect(mocks.createSpool).toHaveBeenCalledWith(
    false,
    expect.objectContaining({
      material: 'PLA',
      label_weight: 1000,
      core_weight: 250,
      tag_uid: '04010203040506',
      last_scale_weight: 812,
    }),
  );
  expect(mocks.write).not.toHaveBeenCalled();
});

it('uses the Spoolman link endpoint and does not stamp a fabricated core weight on quick-add', async () => {
  mocks.inventoryMode.mockResolvedValue({ enabled: true });
  const screen = await setup();
  await event('spoolbuddy_weight', {
    weight_grams: 812,
    raw_adc: 200,
    stable: true,
  });
  await event('spoolbuddy_unknown_tag', { tag_uid: '04010203040506' });
  await fireEvent.press(screen.getByLabelText('Quick add spool'));
  await confirm(screen);
  expect(mocks.createSpool).toHaveBeenCalledWith(
    true,
    expect.not.objectContaining({ core_weight: expect.anything() }),
  );
  expect(mocks.link).toHaveBeenCalledWith(true, 12, {
    tag_uid: '04010203040506',
    tray_uuid: undefined,
  });
  expect(mocks.weighSpoolman).toHaveBeenCalledWith(12, 812);
});

it('retries a partially created Spoolman spool without creating a duplicate', async () => {
  mocks.inventoryMode.mockResolvedValue({ enabled: true });
  mocks.link.mockRejectedValueOnce(new Error('Spoolman link unavailable'));
  const screen = await setup();
  await event('spoolbuddy_unknown_tag', { tag_uid: '04010203040506' });
  await fireEvent.press(screen.getByLabelText('Quick add spool'));
  await confirm(screen);
  expect(screen.getByText('Spoolman link unavailable')).toBeTruthy();
  expect(screen.getByLabelText('Quick add spool')).toBeDisabled();
  await fireEvent.press(
    screen.getByLabelText('Retry captured tag link / weight'),
  );
  await confirm(screen);
  expect(mocks.createSpool).toHaveBeenCalledTimes(1);
  expect(mocks.link).toHaveBeenCalledTimes(2);
});

it('queues, fails, retries, cancels and completes remote write jobs without confusing other devices or spools', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('#10 PLA'));
  await fireEvent.press(screen.getByLabelText('Write tag on remote device'));
  expect(mocks.write).not.toHaveBeenCalled();
  await confirm(screen);
  expect(mocks.write).toHaveBeenCalledWith('reader-a', 10);
  await event('spoolbuddy_tag_written', {
    device_id: 'reader-b',
    spool_id: 10,
  });
  await event('spoolbuddy_tag_written', { spool_id: 11 });
  expect(screen.getByText('Job: queued')).toBeTruthy();
  await event('spoolbuddy_tag_write_failed', {
    spool_id: 10,
    message: 'Reader write rejected',
  });
  expect(screen.getByText(/Job: error — Reader write rejected/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Retry remote write'));
  await confirm(screen);
  await fireEvent.press(screen.getByLabelText('Cancel queued write'));
  await waitFor(() =>
    expect(mocks.cancelWrite).toHaveBeenCalledWith('reader-a'),
  );
  await waitFor(() => expect(screen.getByText(/Job: cancelled/)).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Write tag on remote device'));
  await confirm(screen);
  await event('spoolbuddy_tag_written', { spool_id: 10 });
  expect(screen.getByText('Job: success')).toBeTruthy();
});

it('ends a matching physically written job when its inventory link fails and retries only the link', async () => {
  mocks.inventoryMode.mockResolvedValue({ enabled: true });
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('#10 PLA'));
  await fireEvent.press(screen.getByLabelText('Write tag on remote device'));
  await confirm(screen);
  const failure = {
    spool_id: 10,
    tag_uid: '04010203040506',
    message: 'Spoolman link failed',
  };
  await event('spoolbuddy_tag_link_failed', {
    ...failure,
    device_id: 'reader-b',
  });
  await event('spoolbuddy_tag_link_failed', { ...failure, spool_id: 11 });
  expect(screen.getByText('Job: queued')).toBeTruthy();
  await event('spoolbuddy_tag_link_failed', failure);
  expect(
    screen.getByText(/Physical write succeeded; inventory link failed/),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Cancel queued write')).toBeNull();
  expect(screen.queryByLabelText('Retry remote write')).toBeNull();
  expect(screen.getByLabelText('Restart daemon')).not.toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Retry inventory link'));
  await confirm(screen);
  expect(mocks.link).toHaveBeenCalledWith(true, 10, {
    tag_uid: '04010203040506',
  });
  expect(mocks.write).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(/Job: success — Inventory link repaired/),
  ).toBeTruthy();
});

it('offers replacement writing and inventory-only untag, and creates a spool before a separate write action', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('Replace existing tag'));
  await fireEvent.press(screen.getByLabelText('#11 PETG'));
  await fireEvent.press(screen.getByLabelText('Untag selected spool'));
  await confirm(screen);
  expect(mocks.untag).toHaveBeenCalledWith(false, 11);
  await fireEvent.press(screen.getByLabelText('Create spool for writing'));
  await fireEvent.press(screen.getByLabelText('Create spool'));
  await confirm(screen);
  expect(mocks.createSpool).toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});

it.each([
  ['Restart browser', 'restart_browser'],
  ['Restart daemon', 'restart_daemon'],
  ['Reboot device', 'reboot'],
  ['Shut down device', 'shutdown'],
])(
  'confirms and can cancel %s on the selected remote device',
  async (label, command) => {
    const screen = await setup();
    await fireEvent.press(screen.getByLabelText(label));
    expect(mocks.command).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Cancel remote action'));
    expect(mocks.command).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(label));
    await confirm(screen);
    expect(mocks.command).toHaveBeenCalledWith('reader-a', command);
    expect(
      screen.getByText(
        /Server acknowledgement is not proof of device recovery/,
      ),
    ).toBeTruthy();
  },
);

it('surfaces command failures and leaves recovery controls usable', async () => {
  mocks.command.mockRejectedValueOnce(new Error('Device is offline'));
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('Restart daemon'));
  await confirm(screen);
  expect(screen.getByText('Device is offline')).toBeTruthy();
  expect(screen.getByLabelText('Restart daemon')).not.toBeDisabled();
});

it.each(['nfc', 'scale', 'read_tag'] as const)(
  'runs %s diagnostics and displays full failed output and retry',
  async type => {
    mocks.diagnosticResult.mockResolvedValue({
      diagnostic: type,
      success: false,
      output: 'Full diagnostic output\nI2C bus 0\nReader response: BAD',
      exit_code: 3,
    });
    const screen = await setup();
    await fireEvent.press(
      screen.getByLabelText(
        `Run ${type === 'read_tag' ? 'read-tag' : type} diagnostic`,
      ),
    );
    await fireEvent.press(screen.getByLabelText('Run / retry diagnostic'));
    await waitFor(() =>
      expect(mocks.diagnose).toHaveBeenCalledWith('reader-a', type),
    );
    expect(
      await screen.findByText(
        /Failed · Exit code: 3\s+Full diagnostic output\s+I2C bus 0\s+Reader response: BAD/,
      ),
    ).toBeTruthy();
    mocks.diagnosticResult.mockResolvedValue({
      diagnostic: type,
      success: true,
      output: 'Hardware ready',
      exit_code: 0,
    });
    await fireEvent.press(screen.getByLabelText('Run / retry diagnostic'));
    expect(
      await screen.findByText(/Success · Exit code: 0\s+Hardware ready/),
    ).toBeTruthy();
    expect(screen.getByText(/"cpu_temp_c": 45/)).toBeTruthy();
    expect(screen.getByText(/test-kernel/)).toBeTruthy();
  },
);

it('waits for diagnostic results after 404 instead of mistaking dispatch for completion', async () => {
  mocks.diagnosticResult
    .mockRejectedValueOnce(new ApiError('Not ready', 404))
    .mockResolvedValue({
      diagnostic: 'nfc',
      success: true,
      output: 'Ready after poll',
      exit_code: 0,
    });
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('Run nfc diagnostic'));
  await fireEvent.press(screen.getByLabelText('Run / retry diagnostic'));
  expect(await screen.findByText(/Ready after poll/)).toBeTruthy();
  expect(mocks.diagnosticResult.mock.calls.length).toBeGreaterThanOrEqual(2);
});

it('checks and applies updates with reported progress/failure, supports force retry and copies SSH setup key', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('Apply device update'));
  expect(mocks.update).not.toHaveBeenCalled();
  await confirm(screen);
  expect(mocks.update).toHaveBeenCalledWith('reader-a');
  await event('spoolbuddy_update', {
    update_status: 'updating',
    update_message: 'Installing daemon dependencies',
  });
  expect(screen.getByText(/Installing daemon dependencies/)).toBeTruthy();
  await event('spoolbuddy_update', {
    update_status: 'error',
    update_message: 'SSH authorization failed',
  });
  expect(screen.getByText(/SSH authorization failed/)).toBeTruthy();
  mocks.checkUpdate.mockResolvedValue({
    current_version: '1.1',
    latest_version: '1.1',
    update_available: false,
  });
  await fireEvent.press(screen.getByLabelText('Check device updates'));
  await fireEvent.press(await screen.findByLabelText('Force device update'));
  await confirm(screen);
  expect(mocks.update).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByLabelText('SSH setup / public key'));
  await screen.findByText('ssh-ed25519 PUBLIC-TEST-KEY server');
  await fireEvent.press(screen.getByLabelText('Copy SSH public key'));
  expect(Clipboard.setString).toHaveBeenCalledWith(
    'ssh-ed25519 PUBLIC-TEST-KEY server',
  );
});

it('shows completed update and verifies a subsequent remote reconnect/version instead of assuming dispatch means success', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('Apply device update'));
  await confirm(screen);
  mocks.devices.mockResolvedValue([
    { ...device, online: false, update_status: 'updating' },
  ]);
  await act(async () => {
    await screen.client.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
  });
  await screen.findByText('reader-a · offline');
  mocks.devices.mockResolvedValue([
    {
      ...device,
      online: true,
      firmware_version: '1.1',
      update_status: 'complete',
      update_message: 'Update complete',
    },
  ]);
  await act(async () => {
    await screen.client.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
  });
  expect(
    await screen.findByText(/Remote device reconnected after update/),
  ).toBeTruthy();
  expect(screen.getByText(/Current: 1.1[\s\S]*Update: complete/)).toBeTruthy();
});

it('polls tare acknowledgement and calibrates using the captured zero and validated known weight', async () => {
  const screen = await setup();
  await event('spoolbuddy_weight', {
    weight_grams: 0,
    stable: true,
    raw_adc: 100,
  });

  await fireEvent.press(
    screen.getByLabelText('Start known-weight calibration'),
  );
  await fireEvent.press(screen.getByLabelText('Capture empty-scale zero'));
  await waitFor(() => expect(mocks.tare).toHaveBeenCalledWith('reader-a'));
  expect(
    screen.getByText('Waiting for remote tare acknowledgement…'),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Known weight (g)')).toBeNull();
  mocks.devices.mockResolvedValue([
    { ...device, last_calibrated_at: '2026-10-27T20:00:00Z' },
  ]);
  await act(async () => {
    await screen.client.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
  });
  await screen.findByLabelText('Known weight (g)');
  await event('spoolbuddy_weight', {
    weight_grams: 500,
    stable: true,
    raw_adc: 1100,
  });
  await fireEvent.changeText(screen.getByLabelText('Known weight (g)'), '-5');
  expect(screen.getByLabelText('Save calibration factor')).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Known weight (g)'), '500');
  await fireEvent.press(screen.getByLabelText('Save calibration factor'));
  await waitFor(() =>
    expect(mocks.calibrate).toHaveBeenCalledWith('reader-a', 500, 1100, 100),
  );
});

it('does not mistake periodic online presence during installation for update recovery', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('Apply device update'));
  await confirm(screen);
  await event('spoolbuddy_update', { update_status: 'updating' });
  await event('spoolbuddy_online');
  await event('spoolbuddy_online');
  expect(
    screen.queryByText(/Remote device reconnected after update/),
  ).toBeNull();
  expect(
    screen.queryByText(/Update completed\. Remote device reports version/),
  ).toBeNull();
  expect(
    screen.getByText(
      /Waiting for remote reconnect; completion is not inferred from dispatch/,
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText('Apply device update')).toBeDisabled();
});

it('recognizes a genuine offline-online transition even between device polls', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('Apply device update'));
  await confirm(screen);
  await event('spoolbuddy_update', { update_status: 'updating' });
  await act(async () => {
    publishSpoolBuddyEvent({
      type: 'spoolbuddy_offline',
      data: { device_id: 'reader-a' },
    });
    publishSpoolBuddyEvent({
      type: 'spoolbuddy_online',
      data: { device_id: 'reader-a' },
    });
  });
  expect(
    await screen.findByText(/Remote device reconnected after update/),
  ).toBeTruthy();
});

it('requires completed update and the expected device version when no disconnect was observed', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByLabelText('Apply device update'));
  await confirm(screen);
  mocks.devices.mockResolvedValue([{ ...device, update_status: 'complete' }]);
  await act(async () => {
    await screen.client.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
  });
  await screen.findByText(/Current: 1.0[\s\S]*Update: complete/);
  expect(
    screen.queryByText(/Update completed\. Remote device reports version/),
  ).toBeNull();
  expect(
    screen.getByText(
      /Waiting for remote reconnect; completion is not inferred from dispatch/,
    ),
  ).toBeTruthy();
  mocks.devices.mockResolvedValue([
    { ...device, firmware_version: '1.1', update_status: 'complete' },
  ]);
  await act(async () => {
    await screen.client.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
  });
  expect(
    await screen.findByText(
      'Update completed. Remote device reports version 1.1.',
    ),
  ).toBeTruthy();
  expect(
    screen.queryByText(/Remote device reconnected after update/),
  ).toBeNull();
  expect(
    screen.queryByText(
      /Waiting for remote reconnect; completion is not inferred from dispatch/,
    ),
  ).toBeNull();
});

it('blocks unsupported/offline hardware and permission-restricted operations', async () => {
  mockPermission.mockReturnValue(false);
  mocks.devices.mockResolvedValue([
    { ...device, online: false, has_nfc: false, has_scale: false },
  ]);
  const screen = await setup();
  expect(screen.getByLabelText('Tare empty scale')).toBeDisabled();
  expect(screen.getByLabelText('Restart browser')).toBeDisabled();
  expect(screen.getByLabelText('Run nfc diagnostic')).toBeDisabled();
  expect(screen.getByLabelText('Apply device update')).toBeDisabled();
  expect(screen.getByLabelText('SSH setup / public key')).toBeDisabled();
});
