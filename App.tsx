import 'react-native-get-random-values';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MutationCache, QueryClient, QueryClientProvider, QueryErrorResetBoundary, onlineManager, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/hooks/useOffline';
import { ToastProvider } from '@/contexts/ToastContext';
import { PushNotificationProvider } from '@/contexts/PushNotificationContext';
import RootNavigator from '@/navigation/RootNavigator';
import { ThemeProvider, useTheme } from '@/theme';
import { useServerStore } from '@/api/server';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import { LocalizationProvider, translateNative, useTranslation } from '@/i18n';
import { ServerPreferencesSync } from '@/components/common/ServerPreferencesSync';
import { BugReportCollectionGuard } from '@/components/system/BugReportTools';
import { AnnouncementBanner } from '@/components/common/AnnouncementBanner';
import { SliceJobStatusBanner, SliceJobTrackerProvider } from '@/contexts/SliceJobTrackerContext';
import { useUiPreferencesStore } from '@/store/uiPreferencesStore';
import { useNavigationItems } from '@/navigation/useNavigationItems';
import { applicationLandingState, parseConnectAuthorizeLink } from '@/navigation/applicationEntry';
import type { RootStackParamList } from '@/navigation/types';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

// On iOS, Linking.getInitialURL() can stall indefinitely when no URL scheme is
// registered, so we cap how long app entry waits on it.
const LINK_RESOLVE_TIMEOUT_MS = 2500;

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  });
});

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
      gcTime: typeof jest !== 'undefined' ? 0 : undefined,
    },
    mutations: {
      retry: 0,
    },
  },
});

function AppContent() {
  const theme = useTheme();
  const { isOffline } = useOffline();
  const appQueryClient = useQueryClient();
  const { user, authEnabled, loading, requiresSetup } = useAuth();
  const serverUrl = useServerStore(state => state.serverUrl);
  const preferencesLoaded = useUiPreferencesStore(state => state.loaded);
  const landingPage = useUiPreferencesStore(state => state.landingPage);
  const navigationItems = useNavigationItems();
  const [navigationReady, setNavigationReady] = useState(false);
  const [linkLoaded, setLinkLoaded] = useState(false);
  const [pendingConsent, setPendingConsent] = useState<RootStackParamList['ConnectAuthorize'] | null>(null);
  const appliedSession = useRef<string | null>(null);
  const session = serverUrl && !requiresSetup && (!authEnabled || user)
    ? `${serverUrl}:${user?.id ?? 'guest'}` : null;
  const authenticated = Boolean(session) && !loading;
  const entryReady = preferencesLoaded && !navigationItems.loading && linkLoaded;

  useEffect(() => {
    let active = true;
    let receivedLink = false;
    const subscription = Linking.addEventListener('url', event => {
      const consent = parseConnectAuthorizeLink(event.url);
      if (consent) {
        receivedLink = true;
        setPendingConsent(consent);
      }
    });
    // getInitialURL() can stall forever on iOS (no URL scheme registered yet,
    // as in the demo build), so entry must not wait on it unconditionally.
    const initialUrl = Linking.getInitialURL().then(url => {
      if (active && !receivedLink && url) setPendingConsent(parseConnectAuthorizeLink(url));
    }).catch(() => {});
    void Promise.race([
      initialUrl,
      new Promise<null>(resolve => setTimeout(() => resolve(null), LINK_RESOLVE_TIMEOUT_MS)),
    ]).finally(() => { if (active) setLinkLoaded(true); });
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!session) {
      appliedSession.current = null;
      return;
    }
    if (!authenticated || !entryReady || !navigationReady || !navigationRef.isReady()) return;
    if (appliedSession.current !== session) {
      const state = applicationLandingState(landingPage, navigationItems.items);
      navigationRef.resetRoot(pendingConsent && user
        ? { ...state, index: state.routes.length, routes: [...state.routes, { name: 'ConnectAuthorize', params: pendingConsent }] }
        : state);
      appliedSession.current = session;
      if (pendingConsent && user) setPendingConsent(null);
    } else if (pendingConsent && user) {
      navigationRef.navigate('ConnectAuthorize', pendingConsent);
      setPendingConsent(null);
    }
  }, [session, authenticated, entryReady, navigationReady, landingPage, navigationItems.items, pendingConsent, user]);

  useEffect(() => {
    appQueryClient.setDefaultOptions({
      queries: {
        refetchInterval: isOffline ? false : undefined,
      },
    });
  }, [appQueryClient, isOffline]);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setNavigationReady(true)}
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
      <OfflineBanner isOffline={isOffline} />
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.background}
      />
      {authenticated ? (
        <PushNotificationProvider>
          <AnnouncementBanner onReadMore={id => {
            if (navigationRef.isReady()) navigationRef.navigate('Announcements', { id });
          }} />
          <SliceJobStatusBanner />
          <RootNavigator entryReady={entryReady} />
        </PushNotificationProvider>
      ) : <RootNavigator entryReady={entryReady} />}
    </NavigationContainer>
  );
}

// Before ThemeProvider/i18n hydrate, StartupRecoveryScreen is unavailable
// (useTheme throws without its provider), so the hydration gate renders its
// own theme-free escape hatch on a fixed clock.
const STARTUP_ESCAPE_TIMEOUT_MS = 6000;

function ServerHydrationGate({ onEscape }: { onEscape: () => void }) {
  const [showEscape, setShowEscape] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowEscape(true), STARTUP_ESCAPE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.startupGate} testID="server-hydration-gate">
      <ActivityIndicator size="large" color="#00AE42" />
      <Text style={styles.startupGateTitle}>{translateNative('startup.title')}</Text>
      <Text style={styles.startupGateMessage}>{translateNative('startup.restoringSession')}</Text>
      {showEscape && (
        <Text
          accessibilityRole="button"
          onPress={onEscape}
          style={styles.startupGateAction}
        >
          {translateNative('startup.backToServerSetup')}
        </Text>
      )}
    </View>
  );
}

function AppErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  const { text, t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.error, { backgroundColor: theme.colors.background }]}>
      <Text accessibilityRole="alert" style={[styles.errorTitle, { color: theme.colors.text }]}>{text('Something went wrong')}</Text>
      <Text style={[styles.errorMessage, { color: theme.colors.textSecondary }]}>{t('common.unexpectedError', { defaultValue: 'An unexpected error occurred. Tap below to try again.' })}</Text>
      <Text accessibilityRole="button" onPress={resetErrorBoundary} style={[styles.retry, { color: theme.colors.accent }]}>{text('Retry')}</Text>
    </View>
  );
}

export default function App() {
  const serverLoading = useServerStore((s) => s.loading);
  const loadServerUrl = useServerStore((s) => s.loadServerUrl);
  const clearServerUrl = useServerStore((s) => s.clearServerUrl);

  useEffect(() => {
    loadServerUrl();
  }, [loadServerUrl]);

  // Don't render until server URL is hydrated from AsyncStorage — but never
  // leave the user on a blank screen if that read stalls.
  if (serverLoading) return <ServerHydrationGate onEscape={() => clearServerUrl?.()} />;

  return (
    <LocalizationProvider>
      <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <QueryErrorResetBoundary>
              {({ reset }) => (
                <ErrorBoundary
                  onReset={reset}
                  fallbackRender={({ resetErrorBoundary }) => <AppErrorFallback resetErrorBoundary={resetErrorBoundary} />}
                >
                  <ToastProvider>
                    <AuthProvider>
                        <ServerPreferencesSync />
                        <BugReportCollectionGuard />
                        <SliceJobTrackerProvider>
                          <AppContent />
                        </SliceJobTrackerProvider>
                    </AuthProvider>
                  </ToastProvider>
                </ErrorBoundary>
              )}
            </QueryErrorResetBoundary>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
      </GestureHandlerRootView>
    </LocalizationProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  error: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  errorMessage: { marginBottom: 16, textAlign: 'center' },
  retry: { fontSize: 16, fontWeight: '600' },
  startupGate: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#1a1a1a' },
  startupGateTitle: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#ffffff' },
  startupGateMessage: { marginTop: 8, fontSize: 14, color: '#a0a0a0' },
  startupGateAction: { marginTop: 24, fontSize: 16, fontWeight: '600', color: '#00AE42', padding: 8 },
});
