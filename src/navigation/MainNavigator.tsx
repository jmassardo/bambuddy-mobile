import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { MainTabParamList } from './types';
<<<<<<< HEAD
import { api } from '@/api/client';
import { TabBarIcon } from '@/components/common/TabBarIcon';
import { useTheme } from '@/theme';
import { pickString } from '@/utils/data';
import { getNavigationLayout } from './navigationConfig';
=======
import { Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { Printer, ListOrdered, Archive, FolderOpen, Menu } from 'lucide-react-native';
import { useServerStore } from '@/api/server';
import { DemoBadge } from '@/components/common/DemoBadge';
>>>>>>> origin/develop

import DashboardScreen from '@/screens/DashboardScreen';
import QueueScreen from '@/screens/QueueScreen';
import ArchivesScreen from '@/screens/ArchivesScreen';
import FilesScreen from '@/screens/FilesScreen';
import MoreScreen from '@/screens/MoreScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

<<<<<<< HEAD
const TAB_COMPONENTS: Record<keyof MainTabParamList, React.ComponentType> = {
  Dashboard: DashboardScreen,
  Queue: QueueScreen,
  Archives: ArchivesScreen,
  Files: FilesScreen,
  More: MoreScreen,
=======
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
>>>>>>> origin/develop
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
<<<<<<< HEAD
        tabBarIcon: ({ color, size }) => <TabBarIcon name={iconNameByRoute[route.name] ?? 'menu'} color={color} size={size} />,
=======
        headerTitle: () => {
          const label = TAB_LABELS[route.name] || '';
          return <MainTabHeader title={label} />;
        },
        tabBarIcon: ({ color, size }) => {
          const IconComponent = TAB_ICONS[route.name] || Menu;
          return <IconComponent size={size} color={color} />;
        },
>>>>>>> origin/develop
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
