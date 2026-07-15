import React, { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../api/client';
import { useServerStore } from '../../api/server';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { PrimaryButton } from '../../components/common/AppUI';

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function extractSpoolId(value: string) {
  const spoolMatch = value.match(/spool(?:[_-]?id)?[:=\/]([A-Za-z0-9_-]+)/i);
  return spoolMatch?.[1] ?? null;
}

export default function ScannerScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { setServerConnected } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);

  const subtitle = useMemo(() => (mode === 'server' ? 'Scan a QR code containing your Bambuddy server URL.' : 'Scan a server URL or a spool label QR code.'), [mode]);

  const handleScan = async ({ data }: BarcodeScanningResult) => {
    if (handled) return;
    setHandled(true);

    try {
      if (mode === 'server' || isLikelyUrl(data)) {
        await useServerStore.getState().setServerUrl(data.trim().replace(/\/$/, ''));
        const status = await api.getAuthStatus();
        setServerConnected(true);
        showToast('Server URL saved from QR code.', 'success');
        if (status.requires_setup) {
          router.replace('/setup');
          return;
        }
        if (status.auth_enabled) {
          router.replace('/login');
          return;
        }
        router.replace('/(tabs)');
        return;
      }

      const spoolId = extractSpoolId(data);
      if (spoolId) {
        showToast(`Scanned spool label ${spoolId}.`, 'success');
        router.replace(`/inventory?spool=${encodeURIComponent(spoolId)}`);
        return;
      }

      showToast('QR code not recognized. Try again.', 'warning');
      setHandled(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Scan failed.', 'error');
      setHandled(false);
    }
  };

  if (!permission) {
    return <View style={[styles.centered, { backgroundColor: colors.background }]} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}> 
        <Text style={[styles.title, { color: colors.text }]}>Camera permission required</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        <PrimaryButton label="Grant Camera Access" onPress={() => void requestPermission()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={handled ? undefined : handleScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />
      <View style={[styles.overlayCard, { backgroundColor: colors.overlay }]}> 
        <Text style={[styles.title, { color: colors.text }]}>QR Code Scanner</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        {handled ? <PrimaryButton label="Scan Another" onPress={() => setHandled(false)} variant="secondary" /> : null}
      </View>
      <Pressable onPress={() => router.back()} style={[styles.closeButton, { backgroundColor: colors.overlay }]}> 
        <Text style={[styles.closeText, { color: colors.text }]}>Close</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
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
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
