import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';


import React, { useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
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

function isAllowedHttpHost(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.local')
  ) {
    return true;
  }

  const ipv4Match = normalizedHostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (!ipv4Match) return false;

  const octets = ipv4Match.slice(1).map(value => Number(value));
  if (octets.some(value => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  const [first, second] = octets;
  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return false;
}

function parseServerUrl(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  try {
    const parsedUrl = new URL(trimmedValue);
    if (parsedUrl.protocol === 'https:') {
      return parsedUrl;
    }
    if (
      parsedUrl.protocol === 'http:' &&
      isAllowedHttpHost(parsedUrl.hostname)
    ) {
      return parsedUrl;
    }
    return null;
  } catch {
    return null;
  }
}

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
  const { showToast } = useToast();
  const { setServerConnected } = useAuth();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [handled, setHandled] = useState(false);
  const [pendingServerUrl, setPendingServerUrl] = useState<URL | null>(null);

  const subtitle = useLocalizedMemo(
    () =>
      mode === 'server'
        ? translateNative('native.f51f36569070ccf1')
        : translateNative('native.955faba40562e151'),
    [mode],
  );

  const handleScan = async (data: string) => {
    if (handled) return;
    setHandled(true);

    try {
      const scannedServerUrl = parseServerUrl(data);
      if (mode === 'server' || scannedServerUrl) {
        if (!scannedServerUrl) {
          showToast(nativeMessage('native.df6b1b526ca88536'), 'warning');
          setHandled(false);
          return;
        }
        setPendingServerUrl(scannedServerUrl);
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

      showToast(nativeMessage('native.29e1912cf1b5f745'), 'warning');
      setHandled(false);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : nativeMessage('native.115b8e6f5c633cac'),
        'error',
      );
      setHandled(false);
    }
  };

  const confirmServerUrl = async () => {
    if (!pendingServerUrl) return;

    try {
      await useServerStore
        .getState()
        .setServerUrl(pendingServerUrl.toString().trim().replace(/\/$/, ''));
      const status = await api.getAuthStatus();
      setServerConnected(true);
      setPendingServerUrl(null);
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
    } catch (error) {
      setPendingServerUrl(null);
      setHandled(false);
      showToast(
        error instanceof Error ? error.message : nativeMessage('native.115b8e6f5c633cac'),
        'error',
      );
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      const value = codes[0]?.value;
      if (!value || handled) return;
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
          onPress={() => void requestPermission()}
        />
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
      />
      <View style={[styles.overlayCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {translateNative('native.55fccab1a84fc8e0')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
        {handled ? (
          <PrimaryButton
            label={translateNative('native.10d0efeaef75c794')}
            onPress={() => {
              setPendingServerUrl(null);
              setHandled(false);
            }}
            variant="secondary"
          />
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translateNative('common.close')}
        onPress={() => navigation.goBack()}
        style={[styles.closeButton, { backgroundColor: colors.surface }]}
      >
        <Text style={[styles.closeText, { color: colors.text }]}>{translateNative('common.close')}</Text>
      </Pressable>
      <ConfirmModal
        visible={pendingServerUrl !== null}
        onClose={() => {
          setPendingServerUrl(null);
          setHandled(false);
        }}
        onConfirm={() => {
          void confirmServerUrl();
        }}
        title={translateNative('native.8dce0a5836189aeb')}
        message={
          pendingServerUrl
            ? translateNative('native.b5ab96962e7fbfba', { value0: String(pendingServerUrl.origin), value1: String(pendingServerUrl.host) })
            : ''
        }
        confirmLabel={translateNative('common.save')}
        variant="info"
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
