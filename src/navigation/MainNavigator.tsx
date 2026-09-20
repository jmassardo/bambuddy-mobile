// Main tab navigator — bottom tabs for authenticated users
// Mirrors the web UI sidebar: Dashboard, Queue, Archives, Files, More

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { Printer, ListOrdered, Archive, FolderOpen, Menu } from 'lucide-react-native';
import { useServerStore } from '@/api/server';
import { DemoBadge } from '@/components/common/DemoBadge';

import DashboardScreen from '@/screens/DashboardScreen';
import QueueScreen from '@/screens/QueueScreen';
import ArchivesScreen from '@/screens/ArchivesScreen';
import FilesScreen from '@/screens/FilesScreen';
import MoreScreen from '@/screens/MoreScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Header with a demo badge when demo mode is active */
function MainTabHeader({ title }: { title: string }) {
  const demoMode = useServerStore(state => state.demoMode);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text>{title}</Text>
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

  const TAB_LABELS: Record<string, string> = {
    Dashboard: 'Printers',
    Queue: 'Queue',
    Archives: 'Archives',
    Files: 'Files',
    More: 'More',
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        headerTitle: () => {
          const label = TAB_LABELS[route.name] || '';
          return <MainTabHeader title={label} />;
        },
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
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Queue" component={QueueScreen} />
      <Tab.Screen name="Archives" component={ArchivesScreen} />
      <Tab.Screen name="Files" component={FilesScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}
