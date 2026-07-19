import React, { useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
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
import type { AppNavigationProp } from '@/navigation/types';

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function extractSpoolId(value: string) {
  const spoolMatch = value.match(/spool(?:[_-]?id)?[:=\/]([A-Za-z0-9_-]+)/i);
  return spoolMatch?.[1] ?? null;
}

export default function ScannerScreen() {
  const navigation = useNavigation<AppNavigationProp>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Scan QR Code', headerShown: false });
  }, [navigation]);
  const route = useRoute<any>();
  const { mode } = (route.params ?? {}) as { mode?: string };
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { setServerConnected } = useAuth();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [handled, setHandled] = useState(false);

  const subtitle = useMemo(
    () =>
      mode === 'server'
        ? 'Scan a QR code containing your Bambuddy server URL.'
        : 'Scan a server URL or a spool label QR code.',
    [mode],
  );

  const handleScan = async (data: string) => {
    if (handled) return;
    setHandled(true);

    try {
      if (mode === 'server' || isLikelyUrl(data)) {
        await useServerStore
          .getState()
          .setServerUrl(data.trim().replace(/\/$/, ''));
        const status = await api.getAuthStatus();
        setServerConnected(true);
        showToast('Server URL saved from QR code.', 'success');
        if (status.requires_setup) {
          navigation.reset({ index: 0, routes: [{ name: 'Setup' }] });
          return;
        }
        if (status.auth_enabled) {
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          return;
        }
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        return;
      }

      const spoolId = extractSpoolId(data);
      if (spoolId) {
        showToast(`Scanned spool label ${spoolId}.`, 'success');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Inventory', params: { spool: spoolId } }],
        });
        return;
      }

      showToast('QR code not recognized. Try again.', 'warning');
      setHandled(false);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Scan failed.',
        'error',
      );
      setHandled(false);
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
          Camera permission required
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
        <PrimaryButton
          label="Grant Camera Access"
          onPress={() => void requestPermission()}
        />
        <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colors.accent }]}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (device == null) {
    return (
      <SafeAreaView
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Camera unavailable
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          No back camera is available on this device.
        </Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colors.accent }]}>Go Back</Text>
        </Pressable>
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
      <View style={[styles.overlayCard, { backgroundColor: colors.overlay }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          QR Code Scanner
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
        {handled ? (
          <PrimaryButton
            label="Scan Another"
            onPress={() => setHandled(false)}
            variant="secondary"
          />
        ) : null}
      </View>
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.closeButton, { backgroundColor: colors.overlay }]}
      >
        <Text style={[styles.closeText, { color: colors.text }]}>Close</Text>
      </Pressable>
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
  backLink: { marginTop: spacing.lg },
  backLinkText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  closeButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
