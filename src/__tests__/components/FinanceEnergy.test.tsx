import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LivePlugEnergy,
  aggregatePlugEnergy,
} from '@/components/finance/LivePlugEnergy';
import { FinancePolicySection } from '@/components/finance/FinancePolicySection';
import { profilesApi } from '@/api/profiles';
import { settingsApi } from '@/api/settings';
import { financeApi } from '@/api/finance';
import type { Permission, SmartPlugStatus } from '@/types/api';

let mockPermissions: Permission[] = [];
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.dark }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1 },
    hasPermission: (p: Permission) => mockPermissions.includes(p),
  }),
}));
jest.mock('@/api/profiles', () => ({
  profilesApi: { getSmartPlugs: jest.fn(), getSmartPlugStatus: jest.fn() },
}));
jest.mock('@/api/settings', () => ({
  settingsApi: { getSettings: jest.fn(), updateSettings: jest.fn() },
}));
jest.mock('@/api/finance', () => ({ financeApi: { rebuild: jest.fn() } }));
const status = (
  reachable: boolean,
  energy: Partial<NonNullable<SmartPlugStatus['energy']>> | null,
): SmartPlugStatus => ({
  reachable,
  state: null,
  device_name: null,
  energy:
    energy === null
      ? null
      : {
          power: null,
          today: null,
          yesterday: null,
          total: null,
          current: null,
          voltage: null,
          factor: null,
          apparent_power: null,
          reactive_power: null,
          ...energy,
        },
});
async function show(children: React.ReactNode) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = [];
  jest.mocked(settingsApi.getSettings).mockResolvedValue({
    billing_enabled: true,
    finance_budget_reset_day: 1,
    finance_budget_reset_timezone: 'UTC',
    printer_kill_switch_enabled: false,
    energy_tracking_mode: 'print',
  } as unknown as Awaited<ReturnType<typeof settingsApi.getSettings>>);
  jest
    .mocked(settingsApi.updateSettings)
    .mockResolvedValue(
      {} as Awaited<ReturnType<typeof settingsApi.updateSettings>>,
    );
  jest.mocked(financeApi.rebuild).mockResolvedValue({ status: 'success' });
});
it('counts reachable switch-only plugs, accepts MQTT power and preserves unavailable versus zero', () => {
  const result = aggregatePlugEnergy([
    { plug: { plug_type: 'rest' }, status: status(true, null) },
    {
      plug: { plug_type: 'mqtt' },
      status: status(false, { power: 0, today: 0 }),
    },
    {
      plug: { plug_type: 'tasmota' },
      status: status(false, { power: 999, total: 999 }),
    },
    { plug: { plug_type: 'tasmota' }, status: null },
  ]);
  expect(result).toEqual({
    reachable: 2,
    power: 0,
    today: 0,
    yesterday: null,
    total: null,
  });
});
it('never polls smart plugs or settings without read permissions', async () => {
  const view = await show(
    <>
      <LivePlugEnergy />
      <FinancePolicySection />
    </>,
  );
  expect(view.queryByText('Live smart-plug energy')).toBeNull();
  expect(profilesApi.getSmartPlugs).not.toHaveBeenCalled();
  expect(settingsApi.getSettings).not.toHaveBeenCalled();
});
it('renders live measured units and excludes disabled plugs without inventing missing counters', async () => {
  mockPermissions = ['smart_plugs:read'];
  jest.mocked(profilesApi.getSmartPlugs).mockResolvedValue([
    { id: 1, name: 'Meter', enabled: true, plug_type: 'tasmota' },
    { id: 2, name: 'Switch only', enabled: true, plug_type: 'rest' },
    { id: 3, name: 'Disabled', enabled: false, plug_type: 'tasmota' },
  ] as Awaited<ReturnType<typeof profilesApi.getSmartPlugs>>);
  jest
    .mocked(profilesApi.getSmartPlugStatus)
    .mockImplementation(async id =>
      id === 1
        ? status(true, { power: 12, today: 0, total: 2 })
        : status(true, null),
    );
  const view = await show(<LivePlugEnergy />);
  await waitFor(() =>
    expect(view.getByText('Live total power: 12.00 W')).toBeTruthy(),
  );
  expect(view.getByText('Reachable plugs: 2 / 2')).toBeTruthy();
  expect(view.getByText('Today: 0.00 kWh')).toBeTruthy();
  expect(view.getByText('Yesterday: Unavailable')).toBeTruthy();
  expect(profilesApi.getSmartPlugStatus).not.toHaveBeenCalledWith(3);
});
it('loads and saves the real print-versus-total energy setting', async () => {
  mockPermissions = ['settings:read', 'settings:update'];
  const view = await show(<FinancePolicySection energyOnly />);
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Prints only ✓' })).toBeTruthy(),
  );
  await fireEvent.press(
    view.getByRole('button', { name: 'Total consumption' }),
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(settingsApi.updateSettings).toHaveBeenCalledWith({
      energy_tracking_mode: 'total',
    }),
  );
  expect(view.getByText('Settings saved')).toBeTruthy();
});
it('validates reset boundaries and timezone before saving billing policy', async () => {
  mockPermissions = ['settings:read', 'settings:update'];
  const view = await show(<FinancePolicySection />);
  await waitFor(() =>
    expect(view.getByLabelText('Monthly budget reset day (1–31)')).toBeTruthy(),
  );
  await fireEvent.changeText(
    view.getByLabelText('Monthly budget reset day (1–31)'),
    '32',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(view.getByText('Reset day must be 1–31')).toBeTruthy(),
  );
  expect(settingsApi.updateSettings).not.toHaveBeenCalled();
  await fireEvent.changeText(
    view.getByLabelText('Monthly budget reset day (1–31)'),
    '31',
  );
  await fireEvent.changeText(
    view.getByLabelText('Reset timezone (IANA, e.g. America/Chicago)'),
    'Not/AZone',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(view.getByText('Enter a valid IANA timezone')).toBeTruthy(),
  );
  await fireEvent.changeText(
    view.getByLabelText('Reset timezone (IANA, e.g. America/Chicago)'),
    'America/Chicago',
  );
  await fireEvent.press(view.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(settingsApi.updateSettings).toHaveBeenCalledWith({
      billing_enabled: true,
      printer_kill_switch_enabled: false,
      finance_budget_reset_day: 31,
      finance_budget_reset_timezone: 'America/Chicago',
    }),
  );
});
it('requires explicit ledger rebuild confirmation and exposes pending/result feedback', async () => {
  mockPermissions = ['settings:read', 'cost_centers:modify'];
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await show(<FinancePolicySection />);
  await waitFor(() =>
    expect(
      view.getByRole('button', { name: 'Rebuild wallet ledger' }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    view.getByRole('button', { name: 'Rebuild wallet ledger' }),
  );
  expect(financeApi.rebuild).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  await buttons[1].onPress?.();
  await waitFor(() => expect(financeApi.rebuild).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(view.getByText('Ledger rebuilt successfully')).toBeTruthy(),
  );
  alert.mockRestore();
});
