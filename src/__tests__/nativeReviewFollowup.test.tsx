import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { I18nManager, Platform, Settings } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocalizationProvider, createTranslator, deviceLanguage, nativeMessage, useTranslation } from '@/i18n';
import { catalogs } from '@/i18n/catalog';
import { ToastProvider, useToast } from '@/contexts/ToastContext';
import { summarize, type SectionSummaryQueries } from '@/components/settings/constants';
import SettingsScreen from '@/screens/SettingsScreen';
import FilesScreen from '@/screens/FilesScreen';
import ProjectDetailScreen from '@/screens/ProjectDetailScreen';
import { setFormattingPreferences } from '@/utils/preferences';

let mockOptions: Record<string, unknown> = {};
const mockNavigation = { setOptions: jest.fn((options: Record<string, unknown>) => { mockOptions = { ...options }; }), dispatch: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useRoute: () => ({ key: 'fixture', params: { id: 5 } }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: () => ({ data: undefined, isLoading: true, isPending: true, refetch: jest.fn() }),
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ authEnabled: false, hasPermission: () => false, hasAnyPermission: () => false }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/components/settings/useSettingsScreenController', () => ({
  useSettingsScreenController: () => ({ queries: { settingsQuery: { isLoading: true } } }),
}));
jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn(), getString: jest.fn() }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('@react-native-documents/picker', () => ({ pick: jest.fn(), types: { allFiles: '*/*' }, isErrorWithCode: () => false, errorCodes: {} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native/Libraries/Settings/Settings', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('@/components/settings/SettingsModals', () => ({ SettingsModals: () => null }));
jest.mock('@/components/settings/SettingsSectionContent', () => ({ SettingsSectionContent: () => null }));

let changeLanguage: (language: string) => Promise<void>;
function LanguageControl() {
  changeLanguage = useTranslation().setLanguage;
  return null;
}
function TestProviders({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } }));
  return <LocalizationProvider><QueryClientProvider client={client}><ToastProvider><LanguageControl />{children}</ToastProvider></QueryClientProvider></LocalizationProvider>;
}
beforeEach(() => {
  jest.mocked(Settings.get).mockReset();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  setFormattingPreferences({ locale: 'en' });
  mockOptions = {};
  mockNavigation.setOptions.mockClear();
});
afterEach(() => { jest.restoreAllMocks(); });

it('renders counted dashboard text when the native runtime has no plural rules', () => {
  const original = Object.getOwnPropertyDescriptor(Intl, 'PluralRules')!;
  try {
    Object.defineProperty(Intl, 'PluralRules', { ...original, value: undefined });
    jest.isolateModules(() => {
      const { availableLanguages, createTranslator: translate } = require('@/i18n') as typeof import('@/i18n');
      expect(translate('en')('fleet.loadingCount', { count: 3, defaultValue: '{{count}} loading' })).toBe('3 loading');
      expect(Intl.PluralRules.supportedLocalesOf(availableLanguages.map(item => item.key))).toHaveLength(availableLanguages.length);
      expect(new Intl.PluralRules('ru').select(2)).toBe('few');
      expect(new Intl.PluralRules('uk').select(5)).toBe('many');
      expect(new Intl.PluralRules('ja').select(2)).toBe('other');
    });
  } finally {
    Object.defineProperty(Intl, 'PluralRules', original);
  }
});

it('uses native Spanish preferences ahead of Hermes Intl English, while preserving stored selection and reset', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(Settings, 'get').mockImplementation(key => key === 'AppleLanguages' ? ['es'] : 'es_ES');
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...resolved, locale: 'en-US' });
  expect(deviceLanguage()).toBe('es');
  jest.mocked(AsyncStorage.getItem).mockResolvedValue('ja');
  const hook = await renderHook(() => useTranslation(), { wrapper: LocalizationProvider });
  await waitFor(() => expect(hook.result.current.language).toBe('ja'));
  await act(async () => { await hook.result.current.resetLanguage(); });
  expect(hook.result.current.language).toBe('es');
  await hook.unmount();
});

it.each([
  ['Settings', SettingsScreen, 'nav.settings'],
  ['Files', FilesScreen, 'nav.files'],
  ['Project', ProjectDetailScreen, 'screen.project'],
] as const)('updates an already-mounted %s header after navigation eagerly spreads its options', async (_name, Screen, key) => {
  const mounted = jest.fn();
  function MountedScreen() {
    React.useEffect(() => { mounted(); }, []);
    return <Screen />;
  }
  const screen = await render(<MountedScreen />, { wrapper: TestProviders });
  expect(mockOptions.title).toBe(createTranslator('en')(key));
  await act(async () => { await changeLanguage('zh-CN'); });
  expect(mockOptions.title).toBe(createTranslator('zh-CN')(key));
  expect(mockOptions.title).not.toBe(createTranslator('en')(key));
  expect(mounted).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

it('re-resolves an explicit authored toast while visible and preserves colliding raw server text', async () => {
  function Notices() {
    const { showToast } = useToast();
    React.useEffect(() => {
      showToast(nativeMessage('common.save'), 'success', 60000);
      showToast('Save', 'error', 60000);
    }, [showToast]);
    return null;
  }
  const screen = await render(<Notices />, { wrapper: TestProviders });
  expect(screen.getAllByText('Save')).toHaveLength(2);
  await act(async () => { await changeLanguage('zh-CN'); });
  expect(screen.getByText('保存')).toBeTruthy();
  expect(screen.getByText('Save')).toBeTruthy();
  await screen.unmount();
});

it('localizes each formerly raw settings summary template without translating backend values', () => {
  const templates: Record<string, string> = {
    '{{count}} smart plugs': '{{count}} 个智能插座',
    '{{count}} providers': '{{count}} 个服务提供商',
    'Low stock {{threshold}}%': '低库存 {{threshold}}%',
    '{{count}} profiles': '{{count}} 个配置',
    '{{count}} custom links': '{{count}} 个自定义链接',
    '{{keys}} keys • {{tokens}} camera tokens': '{{keys}} 个密钥 • {{tokens}} 个摄像头令牌',
    '{{count}} configured': '已配置 {{count}} 项',
    '{{count}} virtual printers': '{{count}} 台虚拟打印机',
    '{{count}} devices': '{{count}} 台设备',
    '{{count}} locations': '{{count}} 个位置',
  };
  const crypto = require('crypto');
  const keys = Object.keys(templates).map(english => `native.${crypto.createHash('sha256').update(`shared\0${english}`).digest('hex').slice(0, 16)}`);
  const previous = keys.map(key => catalogs['zh-CN'][key]);
  Object.entries(templates).forEach(([, chinese], index) => { catalogs['zh-CN'][keys[index]] = chinese; });
  setFormattingPreferences({ locale: 'zh-CN' });
  try {
    expect(summarize('plugs', {})).toBe('0 个智能插座');
    expect(summarize('notifications', {})).toBe('0 个服务提供商');
    expect(summarize('filament', {})).toBe('低库存 20%');
    expect(summarize('kprofiles', {})).toBe('0 个配置');
    expect(summarize('custom-navigation', {})).toBe('0 个自定义链接');
    expect(summarize('apikeys', {})).toBe('0 个密钥 • 0 个摄像头令牌');
    expect(summarize('external-cameras', {})).toBe('已配置 0 项');
    expect(summarize('virtual-printer', {})).toBe('0 台虚拟打印机');
    expect(summarize('spoolbuddy', {})).toBe('0 台设备');
    expect(summarize('storage-locations', {})).toBe('0 个位置');
    expect(summarize('mqtt', {})).toBe(createTranslator('zh-CN')('native.4d09977f8d9eacf6'));
    expect(summarize('general', { settings: { language: 'Save', date_format: 'eu' } })).toBe('Save • eu');
    expect(summarize('backup', { githubBackupStatus: { last_backup_status: 'Save' } })).toBe('Save');
    const t = createTranslator('zh-CN');
    expect(summarize('backup', {})).toBe(t('native.942bcda081837f61'));
    expect(summarize('filament', { settings: { low_stock_threshold: 42 } })).toBe('低库存 42%');
    expect(summarize('apikeys', { apiKeys: [{}], cameraTokens: [{}, {}] })).toBe('1 个密钥 • 2 个摄像头令牌');
    for (const enabled of [false, true]) {
      expect(summarize('queue', { settings: { preheat_enabled: enabled } })).toBe(t(enabled ? 'native.2ec4b547f7d1df5b' : 'native.84fbff152ecea1e7'));
      expect(summarize('network', { settings: { prometheus_enabled: enabled } })).toBe(t('native.47939e09554555ed', { value0: t(enabled ? 'native.6786e575ee872370' : 'native.08e76ba2b69926c4') }));
      expect(summarize('navigation', { settings: { default_sidebar_order: enabled ? 'raw-wire-order' : '' } })).toBe(t(enabled ? 'native.37be3bba93bb8283' : 'native.ac77ddfd82114632'));
      expect(summarize('failure-detection', { obicoStatus: { enabled } })).toBe(t(enabled ? 'common.enabled' : 'common.disabled'));
      expect(summarize('users', { advancedAuthStatus: { advanced_auth_enabled: enabled } })).toBe(t(enabled ? 'native.c4d355ef26a57929' : 'native.395bd020ccc498d8'));
      const mqtt = { enabled, connected: enabled, broker: 'Save', port: 1883 } as SectionSummaryQueries['mqttStatus'];
      expect(summarize('mqtt', { mqttStatus: mqtt })).toBe(`${t(enabled ? 'common.enabled' : 'common.disabled')} • ${t(enabled ? 'native.7a24d4ce1f2c4857' : 'native.22cd1cee4ce4b061')} • Save:1883`);
    }
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete catalogs['zh-CN'][key]; else catalogs['zh-CN'][key] = previous[index]; });
  }
});

it('falls through supported native language lists, native locales and finally Intl', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const get = jest.spyOn(Settings, 'get').mockImplementation(key => key === 'AppleLanguages' ? ['pl-PL', 'es-MX'] : 'de_DE');
  expect(deviceLanguage()).toBe('es');
  get.mockImplementation(key => key === 'AppleLanguages' ? [] : 'de_DE');
  expect(deviceLanguage()).toBe('de');
  jest.replaceProperty(Platform, 'OS', 'android');
  const constants = I18nManager.getConstants();
  const native = jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ ...constants, localeIdentifier: 'ko_KR' });
  expect(deviceLanguage()).toBe('ko');
  native.mockReturnValue({ ...constants, localeIdentifier: undefined });
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  const intl = jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...resolved, locale: 'fr-FR' });
  expect(deviceLanguage()).toBe('fr');
  intl.mockReturnValue({ ...resolved, locale: 'pl-PL' });
  expect(deviceLanguage()).toBe('en');
});
