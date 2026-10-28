import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LocalizationProvider, NativeTranslation, nativeLabelTuple, nativeMessage, translateNative,
  useLocalizedMemo, useNativeLocale, useNativeMessageState, useTranslation,
} from '@/i18n';
import { ArchiveCard } from '@/components/archives/ArchiveCard';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { InventoryText } from '@/components/inventory/InventoryControls';
import { booleanPrintFields } from '@/components/printers/PrintOptionsForm';
import { CameraChoices } from '@/components/printers/CameraControls';
import { TIME_FORMAT_OPTIONS } from '@/components/settings/constants';
import { ThemeProvider, useTheme } from '@/theme';
import { HomeAssistantSettings } from '@/components/settings/HomeAssistantSettings';
import type { SettingsScreenController } from '@/components/settings/useSettingsScreenController';
import { integrationsApi } from '@/api/integrations';
import { setFormattingPreferences } from '@/utils/preferences';
import { localizedStatus } from '@/utils/statusLabel';
import { formatWeekday } from '@/utils/formatters';
import { useServerStore } from '@/api/server';
import { availableLanguages, catalogs } from '@/i18n/catalog';
import type { Archive } from '@/types/api';

beforeEach(() => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  setFormattingPreferences({ locale: 'en', dateFormat: 'iso', timeFormat: '24h', currency: 'USD' });
  useServerStore.setState({ serverUrl: 'http://localization.test' });
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <LocalizationProvider><ThemeProvider>{children}</ThemeProvider></LocalizationProvider>;
}

it('reacts in existing/new native controls, lazy tuples and memoized module options without remounting', async () => {
  let mounts = 0;
  const archive = {
    id: 8, filename: 'Save', print_name: 'Save', status: 'completed',
    print_time_seconds: 90, created_at: '2026-01-15T10:30:00',
  } as Archive;
  function Controls() {
    useNativeLocale();
    const { setLanguage } = useTranslation();
    React.useEffect(() => { mounts += 1; }, []);
    const timeLabel = useLocalizedMemo(() => TIME_FORMAT_OPTIONS[1].label, []);
    return <>
      <ArchiveCard archive={archive} />
      <PrimaryButton label={booleanPrintFields[0][1]} onPress={() => {}} />
      <Text testID="time-option">{timeLabel}</Text>
      <Text testID="weekday">{formatWeekday(0)}</Text>
      <Pressable testID="simplified" onPress={() => { void setLanguage('zh-CN'); }} />
      <Pressable testID="traditional" onPress={() => { void setLanguage('zh-TW'); }} />
      {availableLanguages.map(locale => <Pressable key={locale.key} testID={`locale-${locale.key}`} onPress={() => { void setLanguage(locale.key); }} />)}
    </>;
  }
  const screen = await render(<Controls />, { wrapper });
  expect(screen.getByText('Duration')).toBeTruthy();
  expect(screen.getByText('completed')).toBeTruthy();
  expect(screen.getByTestId('weekday').props.children).toBe('Sun');
  expect(screen.getByLabelText('Vibration calibration')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('simplified'));
  await waitFor(() => expect(screen.getByText('时长')).toBeTruthy());
  expect(screen.getByLabelText('振动校准')).toBeTruthy();
  expect(screen.getByTestId('time-option').props.children).toBe('12 小时');
  expect(screen.getByText('已完成')).toBeTruthy();
  expect(screen.getByTestId('weekday').props.children).toBe('周日');
  const lateModuleOption = nativeLabelTuple(['wire-format', 'native.4ea7434fc0ab30c5'] as const);
  expect(lateModuleOption[1]).toBe('振动校准');
  expect(screen.getByLabelText('Save')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('traditional'));
  await waitFor(() => expect(screen.getByText('時間')).toBeTruthy());
  expect(screen.getByLabelText('振動校準')).toBeTruthy();
  expect(screen.getByTestId('time-option').props.children).toBe('12 小時');
  expect(booleanPrintFields[0][0]).toBe('vibration_cali');
  for (const locale of availableLanguages.filter(item => item.key !== 'en')) {
    await fireEvent.press(screen.getByTestId(`locale-${locale.key}`));
    const authored = catalogs[locale.key]['native.4ea7434fc0ab30c5'];
    expect(authored).not.toBe('Vibration calibration');
    expect(screen.getByLabelText(authored)).toBeTruthy();
    expect(screen.getByLabelText('Save')).toBeTruthy();
  }
  await fireEvent.press(screen.getByTestId('locale-en'));
  expect(lateModuleOption[1]).toBe('Vibration calibration');
  expect(lateModuleOption[0]).toBe('wire-format');
  expect(mounts).toBe(1);
  await screen.unmount();
});

it('keeps user/server text untouched, including catalog-colliding labels and React-node interpolation', async () => {
  function Controls() {
    useNativeLocale();
    const { setLanguage } = useTranslation();
    const [error, setError] = useNativeMessageState<string | null>(null);
    return <>
      <SectionCard title="Save">
        <TextField label="Save" value="Save" error={error ?? undefined} />
        <InventoryText>Save</InventoryText>
        <CameraChoices label="Save" value="Save" options={['Save']} onChange={() => {}} />
        <Text><NativeTranslation id="native.44a64f63cce0cc8e" values={{ name: <Text testID="user-name">Save</Text> }} /></Text>
        <Text testID="unknown-status">{localizedStatus('Save')}</Text>
      </SectionCard>
      <PrimaryButton label={translateNative('common.save')} onPress={() => {}} />
      <Pressable testID="validation" onPress={() => setError(nativeMessage('common.required'))} />
      <Pressable testID="raw-error" onPress={() => setError('Save')} />
      <Pressable testID="language" onPress={() => { void setLanguage('zh-CN'); }} />
    </>;
  }
  const screen = await render(<Controls />, { wrapper });
  await fireEvent.press(screen.getByTestId('validation'));
  expect(screen.getByText('This field is required')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('language'));
  await waitFor(() => expect(screen.getByText('此项为必填项')).toBeTruthy());
  expect(screen.getByTestId('user-name').props.children).toBe('Save');
  expect(screen.getByTestId('unknown-status').props.children).toBe('Save');
  expect(screen.getByDisplayValue('Save')).toBeTruthy();
  expect(screen.getByLabelText('保存')).toBeTruthy();
  expect(screen.getAllByLabelText('Save').length).toBeGreaterThan(0);
  expect(screen.getByText('确认结果：Save')).toBeTruthy();
  await act(async () => { await fireEvent.press(screen.getByTestId('raw-error')); });
  expect(screen.queryByText('此项为必填项')).toBeNull();
  expect(screen.getAllByText('Save').length).toBeGreaterThan(1);
  await screen.unmount();
});

it('re-evaluates descriptor bindings lazily when the locale changes, without rewriting raw error bodies', async () => {
  function Controls() {
    const { setLanguage } = useTranslation();
    const [error] = useNativeMessageState(nativeMessage('native.44a64f63cce0cc8e', () => ({ name: TIME_FORMAT_OPTIONS[1].label })));
    return <>
      <Text>{error}</Text>
      <Pressable testID="language" onPress={() => { void setLanguage('zh-CN'); }} />
    </>;
  }
  const screen = await render(<Controls />, { wrapper });
  expect(screen.getByText('Confirm outcome: 12 hour')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('language'));
  await waitFor(() => expect(screen.getByText('确认结果：12 小时')).toBeTruthy());
  await screen.unmount();
});

it('preserves a real integration response whose text collides with an authored native caption', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const response = jest.spyOn(integrationsApi, 'testHA').mockResolvedValue({ success: true, message: 'Save', error: null });
  function Controls() {
    const { colors } = useTheme();
    const { setLanguage } = useTranslation();
    const controller = {
      state: { draft: { ha_enabled: true, ha_url: 'https://home-assistant.invalid', ha_token: 'fixture-token' } },
      actions: { setDraft: jest.fn() },
      permissions: { canUpdateSettings: true, canControlSmartPlugs: true },
      colors,
    } as unknown as SettingsScreenController;
    return <>
      <HomeAssistantSettings controller={controller} />
      <Pressable testID="language" onPress={() => { void setLanguage('zh-CN'); }} />
    </>;
  }
  const screen = await render(<QueryClientProvider client={client}><Controls /></QueryClientProvider>, { wrapper });
  await fireEvent.press(screen.getByTestId('language'));
  const key = Object.keys(catalogs.en).find(item => catalogs.en[item] === 'Test Home Assistant connection')!;
  await fireEvent.press(screen.getByLabelText(catalogs['zh-CN'][key]));
  await waitFor(() => expect(screen.getByText('Save')).toBeTruthy());
  expect(screen.queryByText('保存')).toBeNull();
  await screen.unmount();
  client.clear();
  response.mockRestore();
});
