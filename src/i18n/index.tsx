import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { availableLanguages, catalogs, english, type Language } from './catalog';
import { setFormattingPreferences } from '@/utils/preferences';

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
      english[plural] ?? english[key] ?? options.defaultValue ?? key;
    return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => String(options[name] ?? match));
  };
}

const literalKeys = new Map(Object.entries(english).map(([key, text]) => [text, key]));
literalKeys.set('Settings saved.', 'common.saved');
literalKeys.set('Tap to retry', 'common.retry');
literalKeys.set('Error', 'common.error');
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
      .then(stored => { if (active && !userSelected.current && stored) updateLanguage(resolveLanguage(stored)); })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { setFormattingPreferences({ locale: language }); }, [language]);
  const setLanguage = useCallback(async (next: string) => {
    userSelected.current = true;
    const resolved = resolveLanguage(next);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, resolved);
    updateLanguage(resolved);
  }, []);
  const resetLanguage = useCallback(async () => {
    userSelected.current = true;
    await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
    updateLanguage(deviceLanguage());
  }, []);
  const value = useMemo(() => {
    const t = createTranslator(language);
    return { language, loaded, t, text: (literal: string) => literalKeys.has(literal) ? t(literalKeys.get(literal)!) : literal, setLanguage, resetLanguage };
  }, [language, loaded, setLanguage, resetLanguage]);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useTranslation() { return useContext(LocalizationContext); }
