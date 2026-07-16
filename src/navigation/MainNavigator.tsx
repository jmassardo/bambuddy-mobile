// Main tab navigator — bottom tabs for authenticated users
// Mirrors the web UI sidebar: Dashboard, Queue, Archives, Files, More

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import type { MainTabParamList } from './types';
import { useTheme } from '@/theme';

import DashboardScreen from '@/screens/DashboardScreen';
import QueueScreen from '@/screens/QueueScreen';
import ArchivesScreen from '@/screens/ArchivesScreen';
import FilesScreen from '@/screens/FilesScreen';
import MoreScreen from '@/screens/MoreScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ name, color }: { name: string; color: string }) {
  // Simple text-based icons — replace with vector icons later
  const icons: Record<string, string> = {
    Dashboard: '🖨',
    Queue: '📋',
    Archives: '📦',
    Files: '📁',
    More: '⋯',
  };
  return <Text style={{ fontSize: 20, color }}>{icons[name] || '•'}</Text>;
}

export default function MainNavigator() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
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
