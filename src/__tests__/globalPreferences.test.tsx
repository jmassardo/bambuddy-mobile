import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTranslator, LANGUAGE_STORAGE_KEY, LocalizationProvider, resolveLanguage, useLocalizedMemo, useTranslation } from '@/i18n';
import { catalogs, english, availableLanguages } from '@/i18n/catalog';
import { MenuItem, PrimaryButton, TextField } from '@/components/common/AppUI';
import { UiPreferencesSection } from '@/components/settings/UiPreferencesSection';
import { useFormattingPreferences } from '@/hooks/useFormattingPreferences';
import { ServerPreferencesSync } from '@/components/common/ServerPreferencesSync';
import type { SettingsScreenController } from '@/components/settings/useSettingsScreenController';
import { ThemeProvider, THEME_CUSTOMIZATION_KEY, THEME_STORAGE_KEY, useTheme } from '@/theme';
import { customizedColors, DEFAULT_THEME } from '@/theme/preferences';
import { printersApi } from '@/api/printers';
import { settingsApi } from '@/api/settings';
import { uiPreferencesApi } from '@/api/uiPreferences';
import { useServerStore } from '@/api/server';
import { LANDING_PAGE_KEY, landingNavigationState, resolveLandingPage, useUiPreferencesStore } from '@/store/uiPreferencesStore';
import { formatCurrency, formatDate, formatDateTime, formatTime } from '@/utils/data';
import { formatCost } from '@/utils/formatters';
import { formatDateInput, formatPreferredTime, formatTimeInput, parseDateInput, parseServerDate, parseTimeInput, setFormattingPreferences } from '@/utils/preferences';

const mockAuth = { authEnabled: false, user: null as { id: number } | null, loading: false, hasPermission: jest.fn(() => true) };
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
const storage = new Map<string, string>();
beforeEach(() => {
  jest.clearAllMocks();
  storage.clear();
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => storage.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { storage.set(key, value); });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async key => { storage.delete(key); });
  setFormattingPreferences({ locale: 'en-US', dateFormat: 'system', timeFormat: 'system', currency: 'USD' });
  useUiPreferencesStore.setState({ landingPage: 'dashboard', loaded: false, resetRevision: 0 });
  useServerStore.setState({ serverUrl: 'https://farm.example' });
  mockAuth.authEnabled = false;
  mockAuth.user = null;
  mockAuth.hasPermission.mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

function wrapper({ children }: { children: React.ReactNode }) {
  return <LocalizationProvider><ThemeProvider>{children}</ThemeProvider></LocalizationProvider>;
}

describe('native localization', () => {
  it('updates rendered controls, accessibility labels and validation, and restores the selected locale', async () => {
    storage.set(LANGUAGE_STORAGE_KEY, 'de');
    function Controls() {
      const { setLanguage, t } = useTranslation();
      return <>
        <PrimaryButton label={t('common.save')} onPress={() => {}} />
        <TextField label="Name" error={t('common.required')} value="" />
        <MenuItem icon="link" label="Save" translateText={false} onPress={() => {}} />
        <Pressable accessibilityLabel="switch-language" onPress={() => { void setLanguage('ja'); }}><Text>Switch</Text></Pressable>
      </>;
    }
    const first = await render(<Controls />, { wrapper });
    await waitFor(() => expect(first.getByLabelText('Speichern')).toBeTruthy());
    expect(first.getByText('Dieses Feld ist erforderlich')).toBeTruthy();
    expect(first.getByLabelText('Name')).toBeTruthy();
    expect(first.getByLabelText('Save')).toBeTruthy();
    await fireEvent.press(first.getByLabelText('switch-language'));
    await waitFor(() => expect(first.getByLabelText('保存')).toBeTruthy());
    expect(first.getByText('必須項目です')).toBeTruthy();
    await first.unmount();
    const second = await render(<Controls />, { wrapper });
    await waitFor(() => expect(second.getByLabelText('保存')).toBeTruthy());
    expect(storage.get(LANGUAGE_STORAGE_KEY)).toBe('ja');
  });

  it('detects supported regional device locales and safely falls back', () => {
    expect(resolveLanguage('pt_PT')).toBe('pt-BR');
    expect(resolveLanguage('zh-Hant-HK')).toBe('zh-TW');
    expect(resolveLanguage('zh-Hans')).toBe('zh-CN');
    expect(resolveLanguage('de-AT')).toBe('de');
    expect(resolveLanguage('xx-XX')).toBe('en');
  });
  it('does not replace a new user selection with a delayed stored-language read', async () => {
    let finishRead: (value: string | null) => void = () => {};
    jest.mocked(AsyncStorage.getItem).mockImplementation(() => new Promise(resolve => { finishRead = resolve; }));
    const hook = await renderHook(() => useTranslation(), { wrapper: LocalizationProvider });
    await act(async () => { await hook.result.current.setLanguage('fr'); });
    await act(async () => { finishRead('de'); });
    expect(hook.result.current.language).toBe('fr');
    await hook.unmount();
  });

  it('resolves new domain default labels through English-value lookup with interpolation and fallback', () => {
    expect(createTranslator('uk')('lane.save', { defaultValue: 'Save' })).toBe('Зберегти');
    expect(createTranslator('fr')('lane.removed', { defaultValue: 'Removed printer ({{id}})', id: 8 })).toBe('Imprimante supprimée (8)');
    expect(createTranslator('ko')('unknown', { defaultValue: '{{count}} widgets', count: 4 })).toBe('4 widgets');
    expect(createTranslator('en')('missing')).toBe('missing');
    english['test.files_one'] = '{{count}} file';
    english['test.files_other'] = '{{count}} files';
    try {
      expect(createTranslator('en')('test.files', { count: 1 })).toBe('1 file');
      expect(createTranslator('en')('test.files', { count: 2 })).toBe('2 files');
    } finally {
      delete english['test.files_one'];
      delete english['test.files_other'];
    }
  });

  it.each(availableLanguages.map(item => item.key))('has usable native translations, not undefined row cells, for %s', language => {
    for (const key of Object.keys(english)) {
      expect(catalogs[language][key]).toEqual(expect.any(String));
      expect(catalogs[language][key].length).toBeGreaterThan(0);
    }
    expect(createTranslator(language)('common.save')).not.toBe('common.save');
  });
});

describe('shared date, time and currency preferences', () => {
  it('updates formatted props and memoized rows when preferences arrive without remounting', async () => {
    const date = new Date(2026, 0, 15, 14, 30);
    let mounts = 0;
    const Value = React.memo(({ value }: { value: string }) => <Text testID="formatted-value">{value}</Text>);
    function Readout() {
      React.useEffect(() => { mounts += 1; }, []);
      const value = useLocalizedMemo(() => `${formatCurrency(12)}|${formatDate(date)}|${formatTime(date)}`, []);
      return <Value value={value} />;
    }
    const screen = await render(<Readout />);
    expect(screen.getByTestId('formatted-value').props.children).toContain('$12.00');
    await act(async () => { setFormattingPreferences({ currency: 'EUR', dateFormat: 'eu', timeFormat: '24h' }); });
    expect(screen.getByTestId('formatted-value').props.children).toBe('€12.00|15/01/2026|14:30');
    expect(mounts).toBe(1);
    await screen.unmount();
  });
  it('normalizes zone-less UTC timestamps while preserving calendar dates and explicit offsets', () => {
    expect(parseServerDate('2026-01-15T10:30:00').toISOString()).toBe('2026-01-15T10:30:00.000Z');
    expect(parseServerDate('2026-01-15 10:30:00.123').toISOString()).toBe('2026-01-15T10:30:00.123Z');
    expect(parseServerDate('2026-01-15 10:30:00.123456+02:00').toISOString()).toBe('2026-01-15T08:30:00.123Z');
    expect(parseServerDate('2026-01-15T10:30:00+02:00').toISOString()).toBe('2026-01-15T08:30:00.000Z');
    expect(parseServerDate('2026-01-15').getDate()).toBe(15);
  });
  it('honors explicit format choices in both shared helpers and round-trips editable values', () => {
    const localDate = new Date(2026, 0, 15, 14, 30);
    setFormattingPreferences({ dateFormat: 'us', timeFormat: '12h' });
    expect(formatDate(localDate)).toBe('01/15/2026');
    expect(formatTime(localDate)).toBe('02:30 PM');
    expect(formatTimeInput(localDate)).toBe('2:30 PM');
    expect(parseTimeInput(formatTimeInput(localDate))).toEqual({ hours: 14, minutes: 30 });
    setFormattingPreferences({ dateFormat: 'eu', timeFormat: '24h' });
    expect(formatDate(localDate)).toBe('15/01/2026');
    expect(formatTime(localDate)).toBe('14:30');
    expect(formatPreferredTime(localDate, undefined, true)).toBe('14:30:00');
    expect(formatDateTime(localDate)).toBe('15/01/2026 14:30');
    expect(parseDateInput(formatDateInput(localDate))?.getTime()).toBe(new Date(2026, 0, 15).getTime());
    setFormattingPreferences({ dateFormat: 'iso' });
    expect(formatDate(localDate)).toBe('2026-01-15');
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(parseDateInput('2026-02-29')).toBeNull();
    expect(parseDateInput('2024-02-29')?.getDate()).toBe(29);
    expect(parseDateInput('2024//02/29')).toBeNull();
    setFormattingPreferences({ locale: 'ko-KR', dateFormat: 'system' });
    expect(parseDateInput(formatDateInput(localDate))?.getTime()).toBe(new Date(2026, 0, 15).getTime());
    expect(parseTimeInput('13:30 PM')).toBeNull();
    expect(parseTimeInput('12:00 AM')).toEqual({ hours: 0, minutes: 0 });
    expect(parseTimeInput('12:00 PM')).toEqual({ hours: 12, minutes: 0 });
  });
  it('does not force twelve-hour output for system preference', () => {
    const date = new Date(2026, 0, 15, 14, 30);
    setFormattingPreferences({ locale: 'de-DE', timeFormat: 'system' });
    expect(formatTime(date)).toBe(date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
    setFormattingPreferences({ timeFormat: '24h' });
    expect(formatTime(date)).toBe('14:30');
  });
  it('formats server amounts in configured currency without conversion or USD relabeling', () => {
    setFormattingPreferences({ currency: 'EUR' });
    expect(formatCurrency(12)).toBe('€12.00');
    expect(formatCost(12)).toBe('€12.00');
    expect(formatCost(0)).toBe('€0.00');
    expect(formatCost(12, 'GBP')).toBe('£12.00');
    expect(formatCost(12, 'Fr.')).toBe('Fr.12.00');
    setFormattingPreferences({ currency: 'XYZ' });
    expect(formatCurrency(12)).toContain('XYZ');
    expect(formatCurrency(12)).not.toContain('$');
    setFormattingPreferences({ currency: 'bad-code' });
    expect(formatCurrency(12)).toBe('bad-code 12.00');
    expect(formatCurrency(null)).toBe('—');
  });
});

describe('landing and appearance preferences', () => {
  it('persists landing selection and resolves tab, stack, stale and unauthorized destinations', async () => {
    await useUiPreferencesStore.getState().setLandingPage('queue');
    useUiPreferencesStore.setState({ landingPage: 'dashboard' });
    await useUiPreferencesStore.getState().load();
    expect(useUiPreferencesStore.getState().landingPage).toBe('queue');
    expect(storage.get(LANDING_PAGE_KEY)).toBe('queue');
    expect(landingNavigationState('queue').routes[0]).toEqual({ name: 'Main', params: { screen: 'Queue' } });
    expect(landingNavigationState('inventory').routes[1]).toEqual({ name: 'Inventory' });
    expect(resolveLandingPage('removed')).toBe('dashboard');
    expect(resolveLandingPage('users', ['queue'])).toBe('dashboard');
  });
  it('keeps palettes independent and applies supported background, accent and visual styles', () => {
    const dark = customizedColors('dark', { ...DEFAULT_THEME, dark_background: 'oled', dark_accent: 'blue', dark_style: 'glow' });
    const light = customizedColors('light', DEFAULT_THEME);
    expect(dark.background).toBe('#000000');
    expect(dark.accent).toBe('#2563eb');
    expect(dark.cardBorder).toBe('#2563eb88');
    expect(light.accent).not.toBe(dark.accent);
  });
  it('preserves independent edits made before persistence finishes', async () => {
    const hook = await renderHook(() => useTheme(), { wrapper });
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    await act(async () => {
      await Promise.all([
        hook.result.current.setCustomization({ dark_accent: 'blue' }),
        hook.result.current.setCustomization({ dark_style: 'glow' }),
      ]);
    });
    expect(hook.result.current.customization.dark_accent).toBe('blue');
    expect(hook.result.current.customization.dark_style).toBe('glow');
    expect(JSON.parse(storage.get(THEME_CUSTOMIZATION_KEY)!).dark_accent).toBe('blue');
    await hook.unmount();
  });
  it('shows removed/default printers, previews theme changes and resets only local UI preferences after confirmation', async () => {
    jest.spyOn(printersApi, 'getPrinters').mockResolvedValue([]);
    const updateServer = jest.spyOn(settingsApi, 'updateSettings');
    storage.set('bambuddy-server-url', 'https://farm.example');
    storage.set(LANGUAGE_STORAGE_KEY, 'en');
    storage.set(THEME_STORAGE_KEY, 'dark');
    storage.set(LANDING_PAGE_KEY, 'queue');
    storage.set('bambuddy-printer-sort', 'name');
    const setDraft = jest.fn();
    const controller = {
      state: { draft: { default_printer_id: 99, announcements_enabled: true, announcements_all_users: false } },
      actions: { setDraft },
      permissions: { canUpdateSettings: true },
    } as unknown as SettingsScreenController;
    function ThemeReadout() {
      const { colors } = useTheme();
      return <Text testID="theme-accent">{colors.accent}</Text>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const screen = await render(<QueryClientProvider client={client}><UiPreferencesSection controller={controller} /><ThemeReadout /></QueryClientProvider>, { wrapper });
    await waitFor(() => expect(screen.getByText('Removed printer (99)')).toBeTruthy());
    await fireEvent.press(screen.getByText('No default printer'));
    const updater = setDraft.mock.calls[0][0] as (value: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({ default_printer_id: 99 }).default_printer_id).toBeNull();
    await fireEvent.press(screen.getAllByText('Blue')[0]);
    await waitFor(() => expect(screen.getByTestId('theme-accent').props.children).toBe('#2563eb'));
    expect(storage.get(THEME_CUSTOMIZATION_KEY)).toContain('blue');
    await fireEvent.press(screen.getByText('Reset UI preferences'));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Reset UI preferences'));
    await fireEvent.press(screen.getByLabelText('Reset'));
    await waitFor(() => expect(storage.has(LANGUAGE_STORAGE_KEY)).toBe(false));
    expect(storage.has(LANDING_PAGE_KEY)).toBe(false);
    expect(storage.has(THEME_CUSTOMIZATION_KEY)).toBe(false);
    expect(storage.has('bambuddy-printer-sort')).toBe(false);
    expect(useUiPreferencesStore.getState().resetRevision).toBe(1);
    expect(storage.get('bambuddy-server-url')).toBe('https://farm.example');
    expect(AsyncStorage.clear).not.toHaveBeenCalled();
    expect(updateServer).not.toHaveBeenCalled();
    await screen.unmount();
    client.clear();
  });

  it('loads policy booleans, preserves the all-users policy while disabled, and only exposes policy editing to authorized users', async () => {
    jest.spyOn(printersApi, 'getPrinters').mockResolvedValue([]);
    function Policy({ canEdit }: { canEdit: boolean }) {
      const [draft, setDraft] = useState({ announcements_enabled: true, announcements_all_users: true });
      const controller = { state: { draft }, actions: { setDraft }, permissions: { canUpdateSettings: canEdit } } as unknown as SettingsScreenController;
      return <><UiPreferencesSection controller={controller} /><Text testID="policy-state">{JSON.stringify(draft)}</Text></>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const screen = await render(<QueryClientProvider client={client}><Policy canEdit /></QueryClientProvider>, { wrapper });
    await fireEvent(screen.getByLabelText('Enable announcements'), 'valueChange', false);
    expect(screen.getByTestId('policy-state').props.children).toBe('{"announcements_enabled":false,"announcements_all_users":true}');
    expect(screen.getByLabelText('Show announcements to all users').props.disabled).toBe(true);
    await fireEvent(screen.getByLabelText('Enable announcements'), 'valueChange', true);
    await fireEvent(screen.getByLabelText('Show announcements to all users'), 'valueChange', false);
    expect(screen.getByTestId('policy-state').props.children).toBe('{"announcements_enabled":true,"announcements_all_users":false}');
    await screen.rerender(<QueryClientProvider client={client}><Policy canEdit={false} /></QueryClientProvider>);
    expect(screen.queryByLabelText('Enable announcements')).toBeNull();
    await screen.unmount();
    client.clear();
  });

  it('applies saved server formats, currency and theme on query refresh without changing notification language', async () => {
    storage.set(LANGUAGE_STORAGE_KEY, 'en');
    const settings = { ...DEFAULT_THEME, date_format: 'eu', time_format: '24h', currency: 'EUR', notification_language: 'ja' } as Awaited<ReturnType<typeof settingsApi.getSettings>>;
    const getSettings = jest.spyOn(settingsApi, 'getSettings').mockResolvedValue(settings);
    jest.spyOn(uiPreferencesApi, 'getDisplayPreferences').mockResolvedValue({ date_format: 'eu', time_format: '24h' });
    jest.spyOn(uiPreferencesApi, 'getFlags').mockResolvedValue({ currency: 'EUR', billing_enabled: false, check_updates: true, user_notifications_enabled: true });
    function Readout() {
      const { colors } = useTheme();
      const { language } = useTranslation();
      return <Text testID="server-preferences">{`${language}|${colors.accent}`}</Text>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const screen = await render(<QueryClientProvider client={client}><ServerPreferencesSync /><Readout /></QueryClientProvider>, { wrapper });
    await waitFor(() => expect(formatCurrency(12)).toContain('€'));
    expect(formatDate(new Date(2026, 0, 15))).toBe('15/01/2026');
    expect(screen.getByTestId('server-preferences').props.children).toBe('en|#00AE42');
    await act(async () => {
      client.setQueryData(['settings', 'https://farm.example'], { ...settings, date_format: 'iso', currency: 'GBP', dark_accent: 'purple' });
    });
    await waitFor(() => expect(screen.getByTestId('server-preferences').props.children).toBe('en|#9333ea'));
    expect(formatCurrency(12)).toContain('£');
    expect(formatDate(new Date(2026, 0, 15))).toBe('2026-01-15');
    await screen.unmount();
    client.clear();
    getSettings.mockClear();
    mockAuth.authEnabled = true;
    const gated = await render(<QueryClientProvider client={client}><ServerPreferencesSync /></QueryClientProvider>, { wrapper });
    expect(getSettings).not.toHaveBeenCalled();
    await gated.unmount();
    client.clear();
  });
  it('uses non-sensitive server defaults without requiring settings:read for normal signed-in users', async () => {
    mockAuth.authEnabled = true;
    mockAuth.user = { id: 8 };
    mockAuth.hasPermission.mockReturnValue(false);
    const privilegedSettings = jest.spyOn(settingsApi, 'getSettings');
    const display = jest.spyOn(uiPreferencesApi, 'getDisplayPreferences').mockResolvedValue({ date_format: 'iso', time_format: '24h' });
    const flags = jest.spyOn(uiPreferencesApi, 'getFlags').mockResolvedValue({ currency: 'EUR', billing_enabled: false, check_updates: true, user_notifications_enabled: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const screen = await render(<QueryClientProvider client={client}><ServerPreferencesSync /></QueryClientProvider>, { wrapper });
    await waitFor(() => expect(formatCurrency(12)).toContain('€'));
    expect(formatDate(new Date(2026, 0, 15))).toBe('2026-01-15');
    expect(display).toHaveBeenCalled();
    expect(flags).toHaveBeenCalled();
    expect(privilegedSettings).not.toHaveBeenCalled();
    await screen.unmount();
    client.clear();
  });
  it('never applies cached server A full settings over server B safe defaults while B is delayed or fails', async () => {
    const settingsA = { ...DEFAULT_THEME, date_format: 'us', time_format: '12h', currency: 'JPY' } as Awaited<ReturnType<typeof settingsApi.getSettings>>;
    let failB: (error: Error) => void = () => {};
    jest.spyOn(settingsApi, 'getSettings').mockImplementation(() =>
      useServerStore.getState().serverUrl === 'https://farm.example' ? Promise.resolve(settingsA) : new Promise((_, reject) => { failB = reject; }),
    );
    jest.spyOn(uiPreferencesApi, 'getDisplayPreferences').mockResolvedValue({ date_format: 'eu', time_format: '24h' });
    jest.spyOn(uiPreferencesApi, 'getFlags').mockResolvedValue({ currency: 'EUR', billing_enabled: false, check_updates: true, user_notifications_enabled: true });
    function Readout() {
      useFormattingPreferences();
      return <Text testID="isolated-preferences">{`${formatCurrency(12)}|${formatDate(new Date(2026, 0, 15))}`}</Text>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const screen = await render(<QueryClientProvider client={client}><ServerPreferencesSync /><Readout /></QueryClientProvider>, { wrapper });
    await waitFor(() => expect(formatCurrency(12)).toContain('¥'));
    await act(async () => { useServerStore.setState({ serverUrl: 'https://farm-b.example' }); });
    await waitFor(() => expect(screen.getByTestId('isolated-preferences').props.children).toBe('€12.00|15/01/2026'));
    await act(async () => { failB(new Error('B unavailable')); });
    await waitFor(() => expect(client.getQueryState(['settings', 'https://farm-b.example'])?.status).toBe('error'));
    expect(screen.getByTestId('isolated-preferences').props.children).toBe('€12.00|15/01/2026');
    expect(client.getQueryData(['settings', 'https://farm.example'])).toEqual(settingsA);
    await screen.unmount();
    client.clear();
  });
  it('renders late safe currency/date/time defaults for a role without settings:read', async () => {
    mockAuth.authEnabled = true;
    mockAuth.user = { id: 8 };
    mockAuth.hasPermission.mockReturnValue(false);
    let finishDisplay: (value: { date_format: 'eu'; time_format: '24h' }) => void = () => {};
    let finishFlags: (value: Awaited<ReturnType<typeof uiPreferencesApi.getFlags>>) => void = () => {};
    jest.spyOn(uiPreferencesApi, 'getDisplayPreferences').mockImplementation(() => new Promise(resolve => { finishDisplay = resolve; }));
    jest.spyOn(uiPreferencesApi, 'getFlags').mockImplementation(() => new Promise(resolve => { finishFlags = resolve; }));
    const fullSettings = jest.spyOn(settingsApi, 'getSettings');
    function Readout() {
      useFormattingPreferences();
      const date = new Date(2026, 0, 15, 14, 30);
      return <Text testID="late-safe-preferences">{`${formatCurrency(12)}|${formatDate(date)}|${formatTime(date)}`}</Text>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const screen = await render(<QueryClientProvider client={client}><ServerPreferencesSync /><Readout /></QueryClientProvider>, { wrapper });
    expect(screen.getByTestId('late-safe-preferences').props.children).toContain('$12.00');
    await act(async () => {
      finishDisplay({ date_format: 'eu', time_format: '24h' });
      finishFlags({ currency: 'EUR', billing_enabled: false, check_updates: true, user_notifications_enabled: true });
    });
    await waitFor(() => expect(screen.getByTestId('late-safe-preferences').props.children).toBe('€12.00|15/01/2026|14:30'));
    expect(fullSettings).not.toHaveBeenCalled();
    await screen.unmount();
    client.clear();
  });
});
