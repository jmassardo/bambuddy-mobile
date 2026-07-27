import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { MainTabParamList } from './types';
import { api } from '@/api/client';
import { TabBarIcon } from '@/components/common/TabBarIcon';
import { useTheme } from '@/theme';
import { pickString } from '@/utils/data';
import { getNavigationLayout } from './navigationConfig';

import DashboardScreen from '@/screens/DashboardScreen';
import QueueScreen from '@/screens/QueueScreen';
import ArchivesScreen from '@/screens/ArchivesScreen';
import FilesScreen from '@/screens/FilesScreen';
import MoreScreen from '@/screens/MoreScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_COMPONENTS: Record<keyof MainTabParamList, React.ComponentType> = {
  Dashboard: DashboardScreen,
  Queue: QueueScreen,
  Archives: ArchivesScreen,
  Files: FilesScreen,
  More: MoreScreen,
};

export default function MainNavigator() {
  const theme = useTheme();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const layout = React.useMemo(
    () => getNavigationLayout({ defaultSidebarOrder: pickString(settingsQuery.data, ['default_sidebar_order']) }),
    [settingsQuery.data],
  );
  const tabItems = React.useMemo(
    () => layout.tabItems.filter(item => item.tabRoute).map(item => ({ ...item, tabRoute: item.tabRoute as keyof MainTabParamList })),
    [layout.tabItems],
  );
  const iconNameByRoute = React.useMemo(
    () => tabItems.reduce<Partial<Record<keyof MainTabParamList, string>>>((acc, item) => {
      acc[item.tabRoute] = item.icon;
      return acc;
    }, {}),
    [tabItems],
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        tabBarIcon: ({ color, size }) => <TabBarIcon name={iconNameByRoute[route.name] ?? 'menu'} color={color} size={size} />,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      })}
    >
      {tabItems.map(item => (
        <Tab.Screen
          key={item.id}
          name={item.tabRoute}
          component={TAB_COMPONENTS[item.tabRoute]}
          options={{ title: item.label }}
        />
      ))}
    </Tab.Navigator>
  );
}
