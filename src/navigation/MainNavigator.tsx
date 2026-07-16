// Main tab navigator — bottom tabs for authenticated users
// Mirrors the web UI sidebar: Dashboard, Queue, Archives, Files, More

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import { useTheme } from '@/theme';
import { Printer, ListOrdered, Archive, FolderOpen, Menu } from 'lucide-react-native';

import DashboardScreen from '@/screens/DashboardScreen';
import QueueScreen from '@/screens/QueueScreen';
import ArchivesScreen from '@/screens/ArchivesScreen';
import FilesScreen from '@/screens/FilesScreen';
import MoreScreen from '@/screens/MoreScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Dashboard: Printer,
  Queue: ListOrdered,
  Archives: Archive,
  Files: FolderOpen,
  More: Menu,
};

export default function MainNavigator() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color }) => {
          const IconComponent = TAB_ICONS[route.name] || Menu;
          return <IconComponent size={22} color={color} />;
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
