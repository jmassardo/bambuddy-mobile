// Main tab navigator — bottom tabs for authenticated users
// Mirrors the web UI sidebar: Dashboard, Queue, Archives, Files, More

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getHeaderTitle, Header } from '@react-navigation/elements';
import type { MainTabParamList } from './types';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { Printer, ListOrdered, Archive, FolderOpen, Menu } from 'lucide-react-native';
import { useServerStore } from '@/api/server';
import { DemoBadge } from '@/components/common/DemoBadge';
import { QuickSmartPlugPanel } from '@/components/settings/SmartPlugPowerControls';
import { useTranslation } from '@/i18n';
import { useNavigationItems } from './useNavigationItems';
import { useUiPreferencesStore } from '@/store/uiPreferencesStore';

import DashboardScreen from '@/screens/DashboardScreen';
import QueueScreen from '@/screens/QueueScreen';
import ArchivesScreen from '@/screens/ArchivesScreen';
import FilesScreen from '@/screens/FilesScreen';
import MoreScreen from '@/screens/MoreScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Header with a demo badge when demo mode is active */
function MainTabHeader({ title }: { title: string }) {
  const demoMode = useServerStore(state => state.demoMode);
  const { colors } = useTheme();

  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
      {demoMode ? <DemoBadge size="sm" /> : null}
    </View>
  );
}

const TAB_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Dashboard: Printer,
  Queue: ListOrdered,
  Archives: Archive,
  Files: FolderOpen,
  More: Menu,
};

export default function MainNavigator() {
  const theme = useTheme();
  const { text } = useTranslation();
  const { items } = useNavigationItems();
  const resetRevision = useUiPreferencesStore(state => state.resetRevision);

  const TAB_LABELS: Record<string, string> = {
    Dashboard: text('Printers'),
    Queue: text('Queue'),
    Archives: text('Archives'),
    Files: text('Files'),
    More: text('More'),
  };
  const screens = { Dashboard: DashboardScreen, Queue: QueueScreen, Archives: ArchivesScreen, Files: FilesScreen, More: MoreScreen };
  const tabItems = items.filter(item => item.tabRoute);

  return (
    <Tab.Navigator
      key={resetRevision}
      screenOptions={({ route }) => ({
        title: TAB_LABELS[route.name],
        tabBarAccessibilityLabel: TAB_LABELS[route.name],
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        headerTitle: () => {
          const label = TAB_LABELS[route.name] || '';
          return <MainTabHeader title={label} />;
        },
        header: ({ layout, options }) => (
          <Header
            {...options}
            layout={layout}
            title={getHeaderTitle(options, route.name)}
            headerRight={props => (
              <View style={styles.header}>
                {options.headerRight?.(props)}
                <QuickSmartPlugPanel />
              </View>
            )}
          />
        ),
        tabBarIcon: ({ color, size }) => {
          const IconComponent = TAB_ICONS[route.name] || Menu;
          return <IconComponent size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      })}
    >
      {tabItems.map(item => item.tabRoute && (
        <Tab.Screen key={item.id} name={item.tabRoute} component={screens[item.tabRoute]} />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '700' },
});
