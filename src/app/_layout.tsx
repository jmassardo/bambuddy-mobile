// Root layout — wraps the entire app with providers
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, useTheme } from '../theme';
import { ToastProvider } from '../contexts/ToastContext';
import { AuthProvider } from '../contexts/AuthContext';
import { useServerStore } from '../api/server';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="server/index" options={{ headerShown: false }} />
        <Stack.Screen name="login/index" options={{ headerShown: false }} />
        <Stack.Screen name="setup/index" options={{ title: 'Setup' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="printer/[id]" options={{ title: 'Printer' }} />
        <Stack.Screen name="archive/[id]" options={{ title: 'Archive' }} />
        <Stack.Screen name="projects/index" options={{ title: 'Projects' }} />
        <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
        <Stack.Screen name="camera/[id]" options={{ title: 'Camera', presentation: 'fullScreenModal' }} />
        <Stack.Screen name="scanner/index" options={{ title: 'Scan QR Code', presentation: 'modal' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        <Stack.Screen name="stats/index" options={{ title: 'Statistics' }} />
        <Stack.Screen name="inventory/index" options={{ title: 'Spool Inventory' }} />
        <Stack.Screen name="maintenance/index" options={{ title: 'Maintenance' }} />
        <Stack.Screen name="profiles/index" options={{ title: 'Profiles' }} />
        <Stack.Screen name="notifications/index" options={{ title: 'Notifications' }} />
        <Stack.Screen name="makerworld/index" options={{ title: 'MakerWorld' }} />
        <Stack.Screen name="system/index" options={{ title: 'System Info' }} />
        <Stack.Screen name="users/index" options={{ title: 'Users & Groups' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    useServerStore.getState().loadServerUrl();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
