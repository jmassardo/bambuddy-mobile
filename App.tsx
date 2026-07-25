import React, { useEffect } from 'react';
import { StatusBar, Text, View } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MutationCache, QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import RootNavigator from '@/navigation/RootNavigator';
import { ThemeProvider, useTheme } from '@/theme';
import { useServerStore } from '@/api/server';

const mutationCache = new MutationCache({
  onError: (error) => {
    // Global fallback — screens can still handle errors locally
    const message = error instanceof Error ? error.message : 'An error occurred';
    console.warn('[Mutation Error]', message);
  },
});

const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

function AppContent() {
  const theme = useTheme();

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: theme.colors.accent,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.error,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '900' },
        },
      }}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.background}
      />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const serverLoading = useServerStore((s) => s.loading);
  const loadServerUrl = useServerStore((s) => s.loadServerUrl);

  useEffect(() => {
    loadServerUrl();
  }, [loadServerUrl]);

  // Don't render until server URL is hydrated from AsyncStorage
  if (serverLoading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <QueryErrorResetBoundary>
              {({ reset }) => (
                <ErrorBoundary
                  onReset={reset}
                  fallbackRender={({ resetErrorBoundary }) => (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#fff' }}>Something went wrong</Text>
                      <Text style={{ color: '#aaa', marginBottom: 16, textAlign: 'center' }}>An unexpected error occurred. Tap below to try again.</Text>
                      <Text onPress={resetErrorBoundary} style={{ color: '#00AE42', fontSize: 16, fontWeight: '600' }}>Retry</Text>
                    </View>
                  )}
                >
                  <ToastProvider>
                    <AuthProvider>
                      <AppContent />
                    </AuthProvider>
                  </ToastProvider>
                </ErrorBoundary>
              )}
            </QueryErrorResetBoundary>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
