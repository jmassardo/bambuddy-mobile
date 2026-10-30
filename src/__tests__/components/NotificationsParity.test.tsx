/* eslint-disable @typescript-eslint/no-shadow -- React Native test mocks import local host components. */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProviders } from '@/components/notifications/NotificationProviders';
import { NotificationLog } from '@/components/notifications/NotificationLog';
import { NotificationTemplates } from '@/components/notifications/NotificationTemplates';
import { BedCooledThreshold } from '@/components/notifications/BedCooledThreshold';
import NotificationsScreen from '@/screens/NotificationsScreen';
import { settingsApi } from '@/api/settings';
import { notificationsApi } from '@/api/notifications';
import { api } from '@/api/client';
import { buildProviderPayload, emptyProviderForm, PROVIDER_EVENTS } from '@/utils/notificationProvider';
import type { NotificationProvider } from '@/types/api';

let mockPermissions = true;
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'person@example.com', is_admin: mockPermissions }, hasPermission: () => mockPermissions }),
}));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/contexts/PushNotificationContext', () => ({
  usePushNotification: () => ({
    state: { enabled: false }, requestPermission: jest.fn(), enablePushNotifications: jest.fn(), disablePushNotifications: jest.fn(),
  }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ setOptions: jest.fn(), navigate: jest.fn() }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/api/settings', () => ({
  settingsApi: {
    getNotificationProviders: jest.fn(), createNotificationProvider: jest.fn(), updateNotificationProvider: jest.fn(),
    deleteNotificationProvider: jest.fn(), testNotificationProvider: jest.fn(), getNotificationLog: jest.fn(),
    getNotificationLogStats: jest.fn(), clearNotificationLogs: jest.fn(), getNotificationTemplates: jest.fn(),
    updateNotificationTemplate: jest.fn(), resetNotificationTemplate: jest.fn(), getSettings: jest.fn(), updateSettings: jest.fn(),
  },
}));
jest.mock('@/api/notifications', () => ({ notificationsApi: { testDraft: jest.fn(), testAll: jest.fn(), variables: jest.fn(), preview: jest.fn() } }));
jest.mock('@/api/printers', () => ({ printersApi: { getPrinters: jest.fn(async () => [{ id: 12, name: 'Printer X' }]) } }));
jest.mock('@/api/client', () => ({
  api: {
    getAdvancedAuthStatus: jest.fn(), getSettings: jest.fn(), getUserEmailPreferences: jest.fn(), updateUserEmailPreferences: jest.fn(),
  },
}));
jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    Card: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    Chip: ({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) => React.createElement(Pressable, { accessibilityRole: 'button', accessibilityState: { selected }, onPress }, React.createElement(Text, null, label)),
    Input: ({ label, ...props }: { label: string }) => React.createElement(TextInput, { accessibilityLabel: label, ...props }),
    Button: ({ title, onPress, disabled, expanded }: { title: string; onPress: () => void; disabled?: boolean; expanded?: boolean }) =>
      React.createElement(Pressable, { accessibilityRole: 'button', accessibilityState: { disabled, expanded }, disabled, onPress }, React.createElement(Text, null, title)),
    SectionHeader: ({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) =>
      React.createElement(View, null, React.createElement(Text, null, title), action
        ? React.createElement(Pressable, { onPress: action.onPress }, React.createElement(Text, null, action.label)) : null),
  };
});
jest.mock('@/components/common/ConfirmModal', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    ConfirmModal: ({ visible, onConfirm }: { visible: boolean; onConfirm: () => void }) =>
      visible ? React.createElement(Pressable, { onPress: onConfirm }, React.createElement(Text, null, 'Confirm delete')) : null,
  };
});
jest.mock('@/components/common/StateScreens', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    LoadingScreen: () => React.createElement(Text, null, 'Loading'),
    ErrorState: () => React.createElement(Text, null, 'Error'),
  };
});

const settings = jest.mocked(settingsApi);
const notifications = jest.mocked(notificationsApi);
const personal = jest.mocked(api);
const template = {
  id: 1, name: 'Print completed', event_type: 'print_complete',
  title_template: 'Complete', body_template: 'Done', is_default: true, created_at: '', updated_at: '',
};
const clients: QueryClient[] = [];
function renderWithClient(component: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
}

afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = true;
  settings.getNotificationProviders.mockResolvedValue([]);
  settings.createNotificationProvider.mockResolvedValue({} as never);
  settings.updateNotificationProvider.mockResolvedValue({} as never);
  settings.getSettings.mockResolvedValue({ bed_cooled_threshold: 35 } as never);
  settings.updateSettings.mockResolvedValue({ bed_cooled_threshold: 45 } as never);
  settings.getNotificationTemplates.mockResolvedValue([template] as never);
  settings.updateNotificationTemplate.mockResolvedValue(template as never);
  settings.getNotificationLog.mockResolvedValue([]);
  settings.getNotificationLogStats.mockResolvedValue({ total: 1, success_count: 0, failure_count: 1 });
  settings.clearNotificationLogs.mockResolvedValue({ deleted: 4 });
  notifications.variables.mockResolvedValue([{ event_type: 'print_complete', event_name: 'Completed', variables: ['printer_name'] }]);
  notifications.preview.mockResolvedValue({ title: 'Complete', body: 'DonePrinter X' });
  notifications.testDraft.mockResolvedValue({ success: false, message: 'Bark rejected key' });
  notifications.testAll.mockResolvedValue({
    tested: 2, success: 1, failed: 1, results: [
      { provider_id: 1, provider_name: 'Working', success: true, message: 'Delivered' },
      { provider_id: 2, provider_name: 'Broken', success: false, message: 'Unauthorized' },
    ],
  });
});

it('keeps independent notification tools available when personal preferences fail', async () => {
  personal.getUserEmailPreferences.mockRejectedValue(new Error('Personal settings unavailable'));
  const ui = await renderWithClient(<NotificationsScreen />);
  expect(await ui.findByText('Notification delivery log')).toBeTruthy();
  expect(ui.getByText('Notification templates')).toBeTruthy();
  expect(ui.getByText('Push notifications')).toBeTruthy();
  expect(await ui.findByText('Error')).toBeTruthy();
});

it('confirms resetting a saved notification template', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  settings.resetNotificationTemplate.mockResolvedValue(template as never);
  const ui = await renderWithClient(<NotificationTemplates />);
  await fireEvent.press(await ui.findByText('Reset'));
  expect(settings.resetNotificationTemplate).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls[0][2]?.find(button => button.style === 'destructive')?.onPress?.());
  await waitFor(() => expect(settings.resetNotificationTemplate).toHaveBeenCalled());
  alert.mockRestore();
});

it('tests a new provider draft without saving and reports test-all outcomes per provider', async () => {
  const ui = await renderWithClient(<NotificationProviders />);
  await fireEvent.press(await ui.findByText('Add'));
  await fireEvent.press(ui.getByText('Bark'));
  await fireEvent.changeText(ui.getByLabelText('Device key *'), 'draft-key');
  await fireEvent(ui.getByLabelText('Attach camera photo'), 'valueChange', false);
  await fireEvent.press(ui.getByText('Test draft without saving'));
  await waitFor(() => expect(notifications.testDraft).toHaveBeenCalledWith({
    provider_type: 'bark', attach_photo: false, config: expect.objectContaining({ device_key: 'draft-key' }),
  }, expect.anything()));
  expect(await ui.findByText('Bark rejected key')).toBeTruthy();
  expect(settings.createNotificationProvider).not.toHaveBeenCalled();
  await fireEvent.press(ui.getByText('Cancel'));
  await fireEvent.press(ui.getByText('Test all enabled providers'));
  expect(await ui.findByText('2 tested · 1 succeeded · 1 failed')).toBeTruthy();
  expect(ui.getByText('Working: Sent — Delivered')).toBeTruthy();
  expect(ui.getByText('Broken: Failed — Unauthorized')).toBeTruthy();
});

it('edits Bark transport, event subscriptions, policies and printer routing without touching personal preferences', async () => {
  const initial = {
    ...buildProviderPayload(emptyProviderForm('bark')), id: 7, name: 'Phone',
    config: { device_key: 'original', server: 'https://bark.example', future: { retained: true } },
    enabled: true, on_print_complete: true, on_ha_sensor_alert: true, printer_id: null,
  } as unknown as NotificationProvider;
  settings.getNotificationProviders.mockResolvedValue([initial] as never);
  const ui = await renderWithClient(<NotificationProviders />);
  await fireEvent.press(await ui.findByText('Edit'));
  await fireEvent.changeText(ui.getByLabelText('Device key *'), 'edited');
  await fireEvent(ui.getByLabelText('Print completed'), 'valueChange', false);
  await fireEvent(ui.getByLabelText('Quiet hours'), 'valueChange', true);
  await fireEvent.changeText(ui.getByLabelText('Quiet hours start (HH:MM)'), '23:15');
  await fireEvent.press(await ui.findByText('Printer X'));
  await fireEvent.press(ui.getByText('Save'));
  await waitFor(() => expect(settings.updateNotificationProvider).toHaveBeenCalledWith(7, expect.objectContaining({
    provider_type: 'bark', printer_id: 12, on_print_complete: false, on_ha_sensor_alert: true,
    quiet_hours_enabled: true, quiet_hours_start: '23:15',
    config: expect.objectContaining({ device_key: 'edited', server: 'https://bark.example', future: { retained: true } }),
  })));
  expect(personal.updateUserEmailPreferences).not.toHaveBeenCalled();
});

it('does not save invalid Home Assistant JSON, and retains the draft on delivery failure', async () => {
  notifications.testDraft.mockRejectedValueOnce(new Error('Network failed'));
  const ui = await renderWithClient(<NotificationProviders />);
  await fireEvent.press(await ui.findByText('Add'));
  await fireEvent.press(ui.getByText('Home Assistant'));
  await fireEvent.changeText(ui.getByLabelText('Provider name'), 'HA');
  const data = ui.getByLabelText('Custom service data (JSON object)');
  await fireEvent.changeText(data, '[]');
  await fireEvent.press(ui.getByText('Save'));
  expect(await ui.findByText('Custom service data must be a JSON object.')).toBeTruthy();
  expect(settings.createNotificationProvider).not.toHaveBeenCalled();
  await fireEvent.changeText(data, '{"priority":"high"}');
  await fireEvent.press(ui.getByText('Test draft without saving'));
  expect(await ui.findByText('Network failed')).toBeTruthy();
  expect(ui.getByLabelText('Custom service data (JSON object)').props.value).toBe('{"priority":"high"}');
});

it('keeps transport drafts and original unknown config isolated when switching provider families', async () => {
  const initial = {
    ...buildProviderPayload(emptyProviderForm('ntfy')), id: 8, name: 'Alerts', enabled: true,
    config: { server: 'https://ntfy.sh', topic: 'farm', auth_token: 'ntfy-secret', future: { retained: true } },
  } as unknown as NotificationProvider;
  settings.getNotificationProviders.mockResolvedValue([initial] as never);
  const ui = await renderWithClient(<NotificationProviders />);
  await fireEvent.press(await ui.findByText('Edit'));
  await fireEvent.changeText(ui.getByLabelText('Server URL'), 'https://private.ntfy.example');
  await fireEvent.press(ui.getByText('Bark'));
  expect(ui.getByLabelText('Server URL').props.value).toBe('https://api.day.app');
  await fireEvent.changeText(ui.getByLabelText('Device key *'), 'bark-device');
  await fireEvent.changeText(ui.getByLabelText('Server URL'), 'https://private.bark.example');
  await fireEvent.press(ui.getByText('ntfy'));
  expect(ui.getByLabelText('Server URL').props.value).toBe('https://private.ntfy.example');
  expect(ui.getByLabelText('Topic *').props.value).toBe('farm');
  await fireEvent.press(ui.getByText('Test draft without saving'));
  await waitFor(() => expect(notifications.testDraft).toHaveBeenLastCalledWith({
    provider_type: 'ntfy', attach_photo: true,
    config: expect.objectContaining({ future: { retained: true }, auth_token: 'ntfy-secret' }),
  }, expect.anything()));
  await fireEvent.press(ui.getByText('Bark'));
  expect(ui.getByLabelText('Server URL').props.value).toBe('https://private.bark.example');
  expect(ui.getByLabelText('Device key *').props.value).toBe('bark-device');
  await fireEvent.press(ui.getByText('Save'));
  await waitFor(() => expect(settings.updateNotificationProvider).toHaveBeenCalledWith(8, expect.objectContaining({
    provider_type: 'bark', config: expect.objectContaining({ server: 'https://private.bark.example', device_key: 'bark-device' }),
  })));
  const payload = settings.updateNotificationProvider.mock.calls[0][1];
  expect(payload.config).not.toHaveProperty('future');
  expect(payload.config).not.toHaveProperty('auth_token');
  expect(payload.config).not.toHaveProperty('topic');
});

it('edits the effective priority of a stored bare ntfy alias instead of retaining a shadowing old value', async () => {
  const initial = {
    ...buildProviderPayload(emptyProviderForm('ntfy')), id: 8, name: 'Alerts', enabled: true,
    ...Object.fromEntries(PROVIDER_EVENTS.map(([key]) => [key, key === 'on_print_failed'])),
    config: { topic: 'farm', event_priorities: { print_failed: 5, future_event: 2 } },
  } as unknown as NotificationProvider;
  settings.getNotificationProviders.mockResolvedValue([initial] as never);
  const ui = await renderWithClient(<NotificationProviders />);
  await fireEvent.press(await ui.findByText('Edit'));
  await fireEvent.press(ui.getByRole('button', { name: '1' }));
  await fireEvent.press(ui.getByText('Save'));
  await waitFor(() => expect(settings.updateNotificationProvider).toHaveBeenCalledWith(8, expect.objectContaining({
    config: expect.objectContaining({ event_priorities: { on_print_failed: 1, future_event: 2 } }),
  })));
});

it.each([
  ['Bark', 'bark', [['Device key *', 'device-key']]],
  ['CallMeBot', 'callmebot', [['Phone number *', '+123456789'], ['API key *', 'api-key']]],
  ['Home Assistant', 'homeassistant', [['Home Assistant service (e.g. notify.mobile_app_phone)', 'notify.mobile_app_phone']]],
] as const)('creates, tests and deletes a %s provider through the shared workflow', async (label, family, fields) => {
  let records: NotificationProvider[] = [];
  settings.getNotificationProviders.mockImplementation(async () => records as never);
  settings.createNotificationProvider.mockImplementation(async payload => {
    records = [{ ...payload, id: 11 } as unknown as NotificationProvider];
    return records[0] as never;
  });
  settings.testNotificationProvider.mockResolvedValue({ success: true, message: 'Test delivered' });
  settings.deleteNotificationProvider.mockImplementation(async () => { records = []; });
  const ui = await renderWithClient(<NotificationProviders />);
  await fireEvent.press(await ui.findByText('Add'));
  await fireEvent.press(ui.getByText(label));
  await fireEvent.changeText(ui.getByLabelText('Provider name'), `${label} alerts`);
  for (const [fieldLabel, value] of fields) await fireEvent.changeText(ui.getByLabelText(fieldLabel), value);
  await fireEvent.press(ui.getByText('Save'));
  await waitFor(() => expect(settings.createNotificationProvider).toHaveBeenCalledWith(expect.objectContaining({
    name: `${label} alerts`, provider_type: family,
  })));
  await fireEvent.press(await ui.findByText('Test'));
  expect(await ui.findByText('Test delivered')).toBeTruthy();
  await fireEvent.press(ui.getByText('Delete'));
  await fireEvent.press(ui.getByText('Confirm delete'));
  await waitFor(() => expect(settings.deleteNotificationProvider).toHaveBeenCalledWith(11, expect.anything()));
  expect(await ui.findByText('No providers configured.')).toBeTruthy();
});

it('requests server-side history filters, expands full delivery details, and clears only old history', async () => {
  settings.getNotificationLog.mockResolvedValue([{
    id: 1, event_type: 'print_failed', title: 'Failed job', message: 'Full delivery body',
    success: false, error_message: 'SMTP refused', provider_name: 'Email', provider_type: 'email',
    provider_id: 3, printer_id: 12, printer_name: 'Printer X', created_at: '2026-10-27T12:00:00Z',
  }]);
  const ui = await renderWithClient(<NotificationLog />);
  await ui.findByText('Failed job');
  expect(ui.queryByText('Full delivery body')).toBeNull();
  await fireEvent.press(ui.getByText('90'));
  await fireEvent(ui.getByLabelText('Failed deliveries only'), 'valueChange', true);
  await waitFor(() => expect(settings.getNotificationLog).toHaveBeenLastCalledWith({
    days: 90, success: false, limit: 100, offset: 0,
  }));
  await fireEvent.press(await ui.findByRole('button', { name: 'Inspect delivery', expanded: false }));
  expect(ui.getByRole('button', { name: 'Collapse', expanded: true })).toBeTruthy();
  expect(ui.getByText('Full delivery body')).toBeTruthy();
  expect(ui.getByText('SMTP refused')).toBeTruthy();
  expect(ui.getByText(/Provider #3.*Printer X/)).toBeTruthy();
  await fireEvent.press(ui.getByText('Clear logs older than 30 days'));
  await fireEvent.press(ui.getByText('Confirm delete'));
  await waitFor(() => expect(settings.clearNotificationLogs).toHaveBeenCalledWith(30));
});

it('pages notification history rather than hiding older matching deliveries behind a fixed cap', async () => {
  settings.getNotificationLog.mockImplementation(async params => Array.from(
    { length: params?.offset ? 1 : 100 },
    (_, index) => ({ id: (params?.offset ?? 0) + index, event_type: 'test', title: `Delivery ${(params?.offset ?? 0) + index}`, success: true }),
  ));
  const ui = await renderWithClient(<NotificationLog />);
  await fireEvent.press(await ui.findByText('Load more'));
  expect(await ui.findByText('Delivery 100')).toBeTruthy();
  expect(settings.getNotificationLog).toHaveBeenLastCalledWith({ days: 7, success: undefined, limit: 100, offset: 100 });
  expect(ui.queryByText('Load more')).toBeNull();
});

it('inserts event variables at selection, previews server rendering, retains drafts on preview/save errors and across search', async () => {
  notifications.preview.mockRejectedValueOnce(new Error('Renderer unavailable'));
  settings.updateNotificationTemplate.mockRejectedValueOnce(new Error('Invalid template from server'));
  const ui = await renderWithClient(<NotificationTemplates />);
  const body = await ui.findByLabelText('Body template');
  await ui.findByText('{printer_name}');
  await fireEvent(body, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 4 } } });
  await fireEvent.press(ui.getByText('{printer_name}'));
  expect(ui.getByLabelText('Body template').props.value).toBe('{printer_name}');
  await fireEvent(ui.getByLabelText('Live preview with sample event data'), 'valueChange', true);
  expect(await ui.findByText('Renderer unavailable')).toBeTruthy();
  await fireEvent.changeText(ui.getByLabelText('Body template'), 'Done{printer_name}');
  await waitFor(() => expect(notifications.preview).toHaveBeenLastCalledWith({
    event_type: 'print_complete', title_template: 'Complete', body_template: 'Done{printer_name}',
  }));
  expect(await ui.findByText('DonePrinter X')).toBeTruthy();
  await fireEvent.press(ui.getByText('Save'));
  expect(await ui.findByText('Invalid template from server')).toBeTruthy();
  const search = ui.getByLabelText('Search templates by name or event');
  await fireEvent.changeText(search, 'no match');
  expect(ui.getByText('No matching templates.')).toBeTruthy();
  await fireEvent.changeText(search, 'print_complete');
  expect(ui.getByLabelText('Body template').props.value).toBe('Done{printer_name}');
  await fireEvent.changeText(ui.getByLabelText('Title template'), '');
  await fireEvent.press(ui.getByText('Save'));
  expect(await ui.findAllByText('Title and body are required.')).not.toHaveLength(0);
  expect(settings.updateNotificationTemplate).toHaveBeenCalledTimes(1);
});

it('validates bed threshold bounds and persists only that setting', async () => {
  const ui = await renderWithClient(<BedCooledThreshold />);
  const input = ui.getByLabelText('Bed-cooled notification threshold (°C, 20–80)');
  await waitFor(() => expect(input.props.value).toBe('35'));
  await fireEvent.changeText(input, '19');
  expect(ui.getByRole('button', { name: 'Save bed-cooled threshold' })).toBeDisabled();
  await fireEvent.changeText(input, '45');
  await fireEvent.press(ui.getByText('Save bed-cooled threshold'));
  await waitFor(() => expect(settings.updateSettings).toHaveBeenCalledWith({ bed_cooled_threshold: 45 }));
  expect(await ui.findByText('Bed-cooled threshold saved.')).toBeTruthy();
});

it('preserves working personal email preferences and does not send provider event keys', async () => {
  mockPermissions = false;
  personal.getAdvancedAuthStatus.mockResolvedValue({ advanced_auth_enabled: true } as never);
  personal.getSettings.mockResolvedValue({ user_notifications_enabled: true } as never);
  personal.getUserEmailPreferences.mockResolvedValue({
    notify_print_start: false, notify_print_complete: true, notify_print_failed: true, notify_print_stopped: false,
  } as never);
  personal.updateUserEmailPreferences.mockResolvedValue({} as never);
  const ui = await renderWithClient(<NotificationsScreen />);
  await ui.findByText('Notifications will be sent to person@example.com.');
  await fireEvent(ui.getByLabelText('Print started'), 'valueChange', true);
  await fireEvent.press(ui.getByText('Save preferences'));
  await waitFor(() => expect(personal.updateUserEmailPreferences).toHaveBeenCalledWith({
    notify_print_start: true, notify_print_complete: true, notify_print_failed: true, notify_print_stopped: false,
  }));
  expect(settings.updateNotificationProvider).not.toHaveBeenCalled();
  expect(settings.createNotificationProvider).not.toHaveBeenCalled();
});
