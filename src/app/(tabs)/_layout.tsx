// Tab layout — bottom tab navigation matching the web UI's sidebar
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useTheme } from '../../theme';
import { useWebSocket } from '../../hooks/useWebSocket';
import { TabBarIcon } from '../../components/common/TabBarIcon';

function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useWebSocket();
  return <>{children}</>;
}

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <WebSocketProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.tabBarBorder,
            borderTopWidth: 1,
            paddingBottom: Platform.OS === 'ios' ? 0 : 8,
            height: Platform.OS === 'ios' ? 88 : 64,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Printers',
            tabBarIcon: ({ color, size }) => (
              <TabBarIcon name="printer" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="archives"
          options={{
            title: 'Archives',
            tabBarIcon: ({ color, size }) => (
              <TabBarIcon name="archive" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="queue"
          options={{
            title: 'Queue',
            tabBarIcon: ({ color, size }) => (
              <TabBarIcon name="list-ordered" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="files"
          options={{
            title: 'Files',
            tabBarIcon: ({ color, size }) => (
              <TabBarIcon name="folder" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => (
              <TabBarIcon name="menu" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </WebSocketProvider>
  );
}
