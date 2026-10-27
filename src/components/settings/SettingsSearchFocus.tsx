import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  type ScrollView,
} from 'react-native';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import type { SettingsSearchResult } from './settingsSearch';
import { fontSize, spacing } from '@/theme/tokens';

let target: SettingsSearchResult | null = null;
const listeners = new Set<() => void>();
export function selectSettingsSearchResult(value: SettingsSearchResult | null) {
  target = value;
  listeners.forEach(listener => listener());
}
export function useSettingsSearchTarget() {
  return useSyncExternalStore(
    callback => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => target,
    () => null,
  );
}
const Context = createContext<{
  content: React.RefObject<View | null>;
  scroll: React.RefObject<ScrollView | null>;
} | null>(null);

export function SettingsSearchFocusProvider({
  content,
  scroll,
  children,
}: {
  content: React.RefObject<View | null>;
  scroll: React.RefObject<ScrollView | null>;
  children: React.ReactNode;
}) {
  return (
    <Context.Provider value={{ content, scroll }}>{children}</Context.Provider>
  );
}

export function SettingsSearchSelection() {
  const selected = useSettingsSearchTarget();
  const { colors } = useTheme();
  const { t, text } = useTranslation();
  if (!selected) return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.selection, { color: colors.accent }]}
    >
      {t('workflow.searchSelected', {
        defaultValue: 'Selected setting: {{label}}',
        label: text(selected.label),
      })}
    </Text>
  );
}

export function SettingsSearchAnchor({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const selected = useSettingsSearchTarget();
  const context = useContext(Context);
  const ref = useRef<View>(null);
  const { colors } = useTheme();
  const { text } = useTranslation();
  const matched =
    !!selected &&
    [selected.label, text(selected.label)].some(
      value => value.toLowerCase() === label.toLowerCase(),
    );
  const reveal = () => {
    const content = context?.content.current;
    if (matched && ref.current && content)
      ref.current.measureLayout(
        content,
        (_x, y) =>
          context?.scroll.current?.scrollTo({
            y: Math.max(0, y - 16),
            animated: true,
          }),
        () => {},
      );
  };
  useEffect(() => {
    if (!matched) return;
    AccessibilityInfo.announceForAccessibility(label);
    const timer = setTimeout(reveal, 150);
    return () => clearTimeout(timer);
    // The target changes only when a user explicitly selects a new result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, label]);
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={reveal}
      style={
        matched ? [styles.highlight, { borderColor: colors.accent }] : undefined
      }
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  selection: { fontSize: fontSize.sm, marginBottom: spacing.md },
  highlight: { borderWidth: 2 },
});
