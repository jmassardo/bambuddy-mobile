import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, type ThemeColors } from './tokens';
import { customizedColors, DEFAULT_THEME, sanitizeTheme, type ThemeCustomization } from './preferences';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
  customization: ThemeCustomization;
  setCustomization: (value: Partial<ThemeCustomization>) => Promise<void>;
  resetTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_STORAGE_KEY = 'bambuddy-theme-mode';
export const THEME_CUSTOMIZATION_KEY = '@bambuddy_mobile:theme_customization';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [loaded, setLoaded] = useState(false);
  const [customization, updateCustomization] = useState<ThemeCustomization>(DEFAULT_THEME);
  const customizationRef = useRef<ThemeCustomization>(DEFAULT_THEME);

  useEffect(() => {
    const loadThemeMode = async () => {
      try {
        const [stored, custom] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY), AsyncStorage.getItem(THEME_CUSTOMIZATION_KEY),
        ]);
        if (stored === 'light' || stored === 'dark' || stored === 'system') setModeState(stored);
        if (custom) {
          customizationRef.current = sanitizeTheme(JSON.parse(custom) as Record<string, unknown>);
          updateCustomization(customizationRef.current);
        }
      } catch {
        // A corrupt preference must not prevent the app from opening.
      } finally {
        setLoaded(true);
      }
    };

    void loadThemeMode();
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    const persistThemeMode = async () => {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    };

    void persistThemeMode().catch(() => {});
  }, []);
  const setCustomization = useCallback(async (value: Partial<ThemeCustomization>) => {
    const next = sanitizeTheme({ ...customizationRef.current, ...value });
    customizationRef.current = next;
    updateCustomization(next);
    await AsyncStorage.setItem(THEME_CUSTOMIZATION_KEY, JSON.stringify(next));
  }, []);
  const resetTheme = useCallback(async () => {
    await Promise.all([AsyncStorage.removeItem(THEME_STORAGE_KEY), AsyncStorage.removeItem(THEME_CUSTOMIZATION_KEY)]);
    setModeState('dark');
    customizationRef.current = DEFAULT_THEME;
    updateCustomization(DEFAULT_THEME);
  }, []);

  const resolvedMode: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;
  const isDark = resolvedMode === 'dark';
  const themeColors = useMemo(() => customizedColors(resolvedMode, customization), [resolvedMode, customization]);

  const value = useMemo(
    () => ({ mode, resolvedMode, colors: themeColors, setMode, isDark, customization, setCustomization, resetTheme }),
    [mode, resolvedMode, themeColors, setMode, isDark, customization, setCustomization, resetTheme],
  );

  if (!loaded) return null;

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export { colors, type ThemeColors };
