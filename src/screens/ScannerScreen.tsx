import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';


import React, { useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { URL } from 'react-native-url-polyfill';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { api } from '@/api/client';
import { useServerStore } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { PrimaryButton } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { parseServerEnrollment, type ServerEnrollment } from '@/utils/serverEnrollment';

function extractSpoolId(value: string) {
  // eslint-disable-next-line no-useless-escape -- \/ required to terminate regex literal inside character class
  const spoolMatch = value.match(/spool(?:[_-]?id)?[:=\/]([A-Za-z0-9_-]+)/i);
  return spoolMatch?.[1] ?? null;
}

export default function ScannerScreen() {
  const titleLocale = useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'Scanner'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('native.5fde9a627feaf209'), headerShown: false });
  }, [navigation, titleLocale]);
  const route = useRoute<RootRouteProp<'Scanner'>>();
  const { mode } = (route.params ?? {}) as { mode?: string };
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const errorStyles = React.useMemo(() => StyleSheet.create({
    message: { color: colors.error },
  }), [colors.error]);
  const { showToast } = useToast();
  const { setServerConnected, loginWithApiKey, user, loading } = useAuth();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [handled, setHandled] = useState(false);
  const handledRef = useRef(false);
  const [pendingServer, setPendingServer] = useState<ServerEnrollment | null>(null);
  const [connecting, setConnecting] = useState(false);
  const connectingRef = useRef(false);
  const [enrolled, setEnrolled] = useState(false);
  const [scanError, setScanError] = useState<'invalid' | 'enrollment' | 'camera' | null>(null);
  const errorMessage = scanError === 'invalid' ? translateNative('scanner.invalidCode')
    : scanError === 'enrollment' ? translateNative('scanner.enrollFailed')
    : scanError === 'camera' ? translateNative('scanner.cameraError') : '';

  React.useEffect(() => {
    if (enrolled && user && !loading) {
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Dashboard' } }] });
    }
  }, [enrolled, loading, navigation, user]);

  const resetScan = () => {
    if (connectingRef.current) return;
    handledRef.current = false;
    setHandled(false);
    setPendingServer(null);
    setScanError(null);
  };

  const subtitle = useLocalizedMemo(
    () =>
      mode === 'server'
        ? translateNative('native.f51f36569070ccf1')
        : translateNative('native.955faba40562e151'),
    [mode],
  );

  const handleScan = async (data: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setHandled(true);
    setScanError(null);

    try {
      const enrollment = parseServerEnrollment(data);
      if (mode === 'server' || enrollment || /^bambuddy:/i.test(data.trim())) {
        if (!enrollment) {
          setScanError('invalid');
          return;
        }
        setPendingServer(enrollment);
        return;
      }

      const spoolId = extractSpoolId(data);
      if (spoolId) {
        showToast(nativeMessage('native.539a4279ec497356', () => ({ value0: String(spoolId) })), 'success');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Inventory', params: { spool: spoolId } }],
        });
        return;
      }

      setScanError('invalid');
    } catch {
      setScanError('invalid');
    }
  };

  const confirmServerUrl = async () => {
    if (!pendingServer || connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);

    try {
      if (pendingServer.apiKey) {
        await loginWithApiKey(pendingServer.serverUrl, pendingServer.apiKey);
        queryClient.clear();
        setPendingServer(null);
        setEnrolled(true);
        showToast(nativeMessage('scanner.enrollSuccess'), 'success');
        return;
      }
      await useServerStore
        .getState()
        .setServerUrl(pendingServer.serverUrl);
      const status = await api.getAuthStatus();
      setServerConnected(true);
      setPendingServer(null);
      showToast(nativeMessage('native.00221374e03d28d4'), 'success');
      if (status.requires_setup) {
        navigation.reset({ index: 0, routes: [{ name: 'Setup' }] });
        return;
      }
      if (status.auth_enabled) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { screen: 'Dashboard' } }],
      });
    } catch {
      setPendingServer(null);
      setScanError('enrollment');
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      const value = codes[0]?.value;
      if (!value || handledRef.current) return;
      void handleScan(value);
    },
  });

  if (!hasPermission) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {translateNative('native.138ce5c4744561ca')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
        <PrimaryButton
          label={translateNative('native.21fa199932c61d99')}
          onPress={() => {
            resetScan();
            void requestPermission().catch(() => setScanError('camera'));
          }}
        />
        {errorMessage ? <Text style={errorStyles.message}>{errorMessage}</Text> : null}
        <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  if (device == null) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {translateNative('native.dd79b585121476fc')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {translateNative('native.2be9febb83a2863b')}</Text>
        <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Camera
        style={styles.camera}
        device={device}
        isActive={!handled}
        codeScanner={handled ? undefined : codeScanner}
        onError={() => {
          if (handledRef.current) return;
          handledRef.current = true;
          setHandled(true);
          setScanError('camera');
        }}
      />
      <View style={[styles.overlayCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {translateNative('native.55fccab1a84fc8e0')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
        {errorMessage ? <Text style={errorStyles.message}>{errorMessage}</Text> : null}
        {handled ? (
          <PrimaryButton
            label={translateNative('native.10d0efeaef75c794')}
            onPress={resetScan}
            variant="secondary"
            disabled={connecting}
          />
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translateNative('common.close')}
        onPress={() => navigation.goBack()}
        disabled={connecting}
        style={[styles.closeButton, { backgroundColor: colors.surface }]}
      >
        <Text style={[styles.closeText, { color: colors.text }]}>{translateNative('common.close')}</Text>
      </Pressable>
      <ConfirmModal
        visible={pendingServer !== null}
        onClose={() => {
          if (!connectingRef.current) setPendingServer(null);
        }}
        onConfirm={() => {
          void confirmServerUrl();
        }}
        title={pendingServer?.apiKey
          ? translateNative('scanner.enrollTitle')
          : translateNative('native.8dce0a5836189aeb')}
        message={
          pendingServer?.apiKey
            ? pendingServer.serverUrl.startsWith('http:')
              ? translateNative('scanner.insecureEnrollment', { server: pendingServer.serverUrl })
              : translateNative('scanner.enrollMessage', { server: pendingServer.serverUrl })
            : pendingServer
            ? translateNative('native.b5ab96962e7fbfba', { value0: String(new URL(pendingServer.serverUrl).origin), value1: String(new URL(pendingServer.serverUrl).host) })
            : ''
        }
        confirmLabel={translateNative('common.save')}
        variant={pendingServer?.serverUrl.startsWith('http:') ? 'warning' : 'info'}
        loading={connecting}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  camera: { flex: 1 },
  overlayCard: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.base, lineHeight: 22 },
  closeButton: {
    minHeight: 44,
    justifyContent: 'center',
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
