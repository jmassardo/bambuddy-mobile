import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { withCacheBuster, pickString } from '../../utils/data';
import { Icon } from '../../components/common/TabBarIcon';

export default function CameraScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const printerId = Number(id);
  const router = useRouter();
  const { colors } = useTheme();
  const [tick, setTick] = useState(0);

  const printerQuery = useQuery({ queryKey: ['printer', printerId], queryFn: () => api.getPrinter(printerId), enabled: Number.isFinite(printerId) });
  const statusQuery = useQuery({ queryKey: ['printerStatus', printerId], queryFn: () => api.getPrinterStatus(printerId), enabled: Number.isFinite(printerId), refetchInterval: 2_000 });

  useEffect(() => {
    const interval = setInterval(() => setTick((current) => current + 1), 2_000);
    return () => clearInterval(interval);
  }, []);

  const imageUri = useMemo(() => withCacheBuster(api.getCameraSnapshotUrl(printerId), tick), [printerId, tick]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}> 
      <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
      <Pressable onPress={() => router.back()} style={[styles.closeButton, { backgroundColor: colors.overlay }]}> 
        <Icon name="x" size={20} color={colors.text} />
      </Pressable>
      <View style={[styles.overlayCard, { backgroundColor: colors.overlay }]}> 
        <Text style={[styles.title, { color: colors.text }]}>{pickString(printerQuery.data, ['name'], 'Camera')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{pickString(statusQuery.data, ['state', 'status'], 'Unknown')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{pickString(statusQuery.data, ['current_file', 'job.name'], 'No active file')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  image: { flex: 1, width: '100%' },
  closeButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.sm },
});
