import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, View, StyleSheet } from 'react-native';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

type Preference = { id: string; hidden: boolean; compact: boolean };
function widgetId(widget: React.ReactElement<{ title: string }>) {
  const key = String(widget.key ?? '');
  return key.startsWith('.$') ? key.slice(2) : widget.props.title;
}
export function reorderReport(
  items: Preference[],
  id: string,
  direction: -1 | 1,
) {
  const index = items.findIndex(item => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function ReportLayout({
  children,
  summaries,
}: {
  children: React.ReactNode;
  summaries: Record<string, string>;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const widgets = React.Children.toArray(children).filter(
    React.isValidElement,
  ) as React.ReactElement<{ title: string }>[];
  const defaults = widgets.map(widget => ({
    id: widgetId(widget),
    hidden: false,
    compact: false,
  }));
  const [preferences, setPreferences] = useState<Preference[]>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const label = (value: string) =>
    t(`stats.layout.${value}`, { defaultValue: value });
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('statistics-layout-v2')
      .then(raw => {
        if (!active || !raw) return;
        const saved: unknown = JSON.parse(raw);
        if (!Array.isArray(saved)) return;
        const valid = saved.filter(
          (item): item is Preference =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.id === 'string' &&
            typeof item.hidden === 'boolean' &&
            typeof item.compact === 'boolean',
        );
        setPreferences(current => [
          ...valid.filter(
            (item, index) =>
              current.some(entry => entry.id === item.id) &&
              valid.findIndex(entry => entry.id === item.id) === index,
          ),
          ...current.filter(item => !valid.some(entry => entry.id === item.id)),
        ]);
      })
      .catch(() => {
        if (active) setError(label('Unable to load layout'));
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
    // Widget ids are stable across data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function change(next: Preference[]) {
    setPreferences(next);
    if (loaded)
      AsyncStorage.setItem('statistics-layout-v2', JSON.stringify(next)).catch(
        () => setError(label('Unable to save layout')),
      );
  }
  function toggle(id: string, key: 'hidden' | 'compact') {
    change(
      preferences.map(item =>
        item.id === id ? { ...item, [key]: !item[key] } : item,
      ),
    );
  }
  return (
    <>
      <SectionCard title={label('Dashboard layout')}>
        <PrimaryButton
          variant="secondary"
          label={label(editing ? 'Finish customizing' : 'Customize reports')}
          disabled={!loaded}
          onPress={() => setEditing(!editing)}
        />
        {editing && (
          <>
            <PrimaryButton
              variant="secondary"
              label={label('Restore hidden reports')}
              onPress={() =>
                change(preferences.map(item => ({ ...item, hidden: false })))
              }
            />
            <PrimaryButton
              variant="secondary"
              label={label('Reset layout')}
              onPress={() => {
                change(defaults);
                setExpanded([]);
              }}
            />
          </>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            {error}
          </Text>
        )}
      </SectionCard>
      {preferences.map((item, index) => {
        const widget = widgets.find(entry => widgetId(entry) === item.id);
        if (!widget || (item.hidden && !editing)) return null;
        return (
          <View key={item.id} style={styles.widget}>
            {editing && (
              <SectionCard title={widget.props.title}>
                <PrimaryButton
                  variant="secondary"
                  label={label('Move up')}
                  disabled={index === 0}
                  onPress={() =>
                    change(reorderReport(preferences, item.id, -1))
                  }
                />
                <PrimaryButton
                  variant="secondary"
                  label={label('Move down')}
                  disabled={index === preferences.length - 1}
                  onPress={() => change(reorderReport(preferences, item.id, 1))}
                />
                <PrimaryButton
                  variant="secondary"
                  label={label(item.hidden ? 'Show report' : 'Hide report')}
                  onPress={() => toggle(item.id, 'hidden')}
                />
                <PrimaryButton
                  variant="secondary"
                  label={label(
                    item.compact ? 'Expanded details' : 'Compact summary',
                  )}
                  onPress={() => toggle(item.id, 'compact')}
                />
              </SectionCard>
            )}
            {!item.hidden &&
              (item.compact && !expanded.includes(item.id) ? (
                <SectionCard title={widget.props.title}>
                  <Text style={{ color: colors.text }}>
                    {summaries[item.id] ??
                      label('Report ready. Open details to explore.')}
                  </Text>
                  <PrimaryButton
                    variant="secondary"
                    label={label('Open report details')}
                    onPress={() =>
                      setExpanded(current => [...current, item.id])
                    }
                  />
                </SectionCard>
              ) : (
                widget
              ))}
            {!item.hidden && item.compact && expanded.includes(item.id) && (
              <PrimaryButton
                variant="secondary"
                label={label('Collapse report details')}
                onPress={() =>
                  setExpanded(current => current.filter(id => id !== item.id))
                }
              />
            )}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({ widget: { gap: spacing.sm } });
