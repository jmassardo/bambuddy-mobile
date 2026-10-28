import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { availableLanguages, catalogs, english, resourceEnglish, type Language } from './catalog';
import { getFormattingPreferences, setFormattingPreferences } from '@/utils/preferences';
import { useFormattingPreferences } from '@/hooks/useFormattingPreferences';

export { availableLanguages, type Language } from './catalog';
export const LANGUAGE_STORAGE_KEY = '@bambuddy_mobile:display_language';
export type TranslationOptions = { defaultValue?: string; count?: number } & Record<string, string | number | undefined>;
export type Translate = (key: string, options?: TranslationOptions) => string;

export function resolveLanguage(value: string): Language {
  const normalized = value.replace(/_/g, '-').toLowerCase();
  const exact = availableLanguages.find(item => item.key.toLowerCase() === normalized);
  if (exact) return exact.key;
  if (/^zh-(tw|hk|mo|hant)/.test(normalized)) return 'zh-TW';
  if (normalized.startsWith('zh')) return 'zh-CN';
  return availableLanguages.find(item => item.key.split('-')[0] === normalized.split('-')[0])?.key ?? 'en';
}

export function deviceLanguage(): Language {
  return resolveLanguage(Intl.DateTimeFormat().resolvedOptions().locale);
}

export function createTranslator(language: Language): Translate {
  return (key, options = {}) => {
    const plural = options.count === undefined ? key : `${key}_${new Intl.PluralRules(language).select(options.count)}`;
    const alias = literalKeys.get(options.defaultValue ?? key);
    const aliasPlural = alias && options.count !== undefined ? `${alias}_${new Intl.PluralRules(language).select(options.count)}` : alias;
    const template = catalogs[language][plural] ?? catalogs[language][key] ??
      (aliasPlural ? catalogs[language][aliasPlural] : undefined) ??
      (alias ? catalogs[language][alias] : undefined) ??
      english[plural] ?? english[key] ?? catalogs.en[plural] ?? catalogs.en[key] ?? options.defaultValue ?? key;
    return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => String(options[name] ?? match));
  };
}

const literalKeys = new Map([...Object.entries(resourceEnglish), ...Object.entries(english)].map(([key, text]) => [text, key]));
interface LocalizationValue {
  language: Language;
  loaded: boolean;
  t: Translate;
  text: (literal: string) => string;
  setLanguage: (language: string) => Promise<void>;
  resetLanguage: () => Promise<void>;
}
const defaultTranslator = createTranslator('en');
const LocalizationContext = createContext<LocalizationValue>({
  language: 'en', loaded: false, t: defaultTranslator, text: value => value,
  setLanguage: async () => {}, resetLanguage: async () => {},
});

export function LocalizationProvider({ children }: { children: React.ReactNode }) {
  const [language, updateLanguage] = useState<Language>(deviceLanguage);
  const [loaded, setLoaded] = useState(false);
  const userSelected = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then(stored => {
        if (active && !userSelected.current && stored) {
          const resolved = resolveLanguage(stored);
          setFormattingPreferences({ locale: resolved });
          updateLanguage(resolved);
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { setFormattingPreferences({ locale: language }); }, [language]);
  const setLanguage = useCallback(async (next: string) => {
    userSelected.current = true;
    const resolved = resolveLanguage(next);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, resolved);
    setFormattingPreferences({ locale: resolved });
    updateLanguage(resolved);
  }, []);
  const resetLanguage = useCallback(async () => {
    userSelected.current = true;
    await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
    const resolved = deviceLanguage();
    setFormattingPreferences({ locale: resolved });
    updateLanguage(resolved);
  }, []);
  const value = useMemo(() => {
    const t = createTranslator(language);
    return { language, loaded, t, text: (literal: string) => literalKeys.has(literal) ? t(literalKeys.get(literal)!) : literal, setLanguage, resetLanguage };
  }, [language, loaded, setLanguage, resetLanguage]);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useTranslation() {
  useFormattingPreferences();
  return useContext(LocalizationContext);
}

/** Only explicit app-authored catalog keys belong here, never server/user text. */
export function translateNative(key: string, values: TranslationOptions = {}): string {
  return createTranslator(resolveLanguage(getFormattingPreferences().locale ?? deviceLanguage()))(key, values);
}

/** Generated only for source-authored [wire key, display label, ...] option tuples. */
export function nativeLabelTuple<const T extends readonly unknown[]>(tuple: T): { [K in keyof T]: K extends '1' ? string : T[K] } {
  const copy = [...tuple];
  Object.defineProperty(copy, 1, {
    enumerable: true,
    get: () => translateNative(String(tuple[1])),
  });
  return copy as unknown as { [K in keyof T]: K extends '1' ? string : T[K] };
}

/** English suffix fragments are not words to interpolate into another language. */
export function nativeEnglishSuffix(value: string): string {
  return resolveLanguage(getFormattingPreferences().locale ?? deviceLanguage()) === 'en' ? value : '';
}

/** Also invalidates memoized formatted props when late server preferences arrive. */
export function useNativeLocale(): string {
  const { language } = useContext(LocalizationContext);
  const preferences = useFormattingPreferences();
  return `${language}|${preferences.locale ?? ''}|${preferences.dateFormat}|${preferences.timeFormat}|${preferences.currency}`;
}

/** Memoized labels/formatter outputs also depend on observable display preferences. */
export function useLocalizedMemo<T>(factory: () => T, dependencies: React.DependencyList): T {
  const locale = useNativeLocale();
  // The caller supplies its original dependencies; this adds the external snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [locale, ...dependencies]);
}

/** Keeps React-node values/data untouched while translating/reordering authored text. */
export function NativeTranslation({ id, values = {}, count }: { id: string; values?: Record<string, React.ReactNode>; count?: number }) {
  const { t } = useTranslation();
  const template = t(id, count !== undefined ? { count } : typeof values.count === 'number' ? { count: values.count } : {});
  return <>{template.split(/(\{\{\w+\}\})/g).map((part, index) =>
    <React.Fragment key={index}>{/^\{\{\w+\}\}$/.test(part) ? values[part.slice(2, -2)] : part}</React.Fragment>,
  )}</>;
}

export interface NativeMessage {
  readonly nativeMessage: true;
  readonly key: string;
  readonly options: TranslationOptions | (() => TranslationOptions);
}
export function nativeMessage(key: string, options: NativeMessage['options'] = {}): NativeMessage {
  return { nativeMessage: true, key, options };
}
function messageOptions(message: NativeMessage): TranslationOptions {
  return typeof message.options === 'function' ? message.options() : message.options;
}
export function useNativeMessageState(initial: string | NativeMessage | (() => string | NativeMessage)): readonly [string, (next: React.SetStateAction<string> | NativeMessage) => void];
export function useNativeMessageState<T extends string | null | undefined>(initial: T | NativeMessage | (() => T | NativeMessage)): readonly [T, (next: React.SetStateAction<T> | NativeMessage) => void];
export function useNativeMessageState<T extends string | null | undefined>(initial: T | NativeMessage | (() => T | NativeMessage)) {
  const [stored, store] = useState<T | NativeMessage>(initial);
  const { t } = useTranslation();
  const visible = typeof stored === 'object' && stored !== null ? t(stored.key, messageOptions(stored)) as T : stored;
  const set = useCallback((next: React.SetStateAction<T> | NativeMessage) => {
    store(previous => {
      if (typeof next !== 'function') return next;
      const current = typeof previous === 'object' && previous !== null ? translateNative(previous.key, messageOptions(previous)) as T : previous;
      return next(current);
    });
  }, []);
  return [visible, set] as const;
}
