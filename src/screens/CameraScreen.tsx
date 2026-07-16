import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { withCacheBuster, pickString } from '@/utils/data';
import { X } from 'lucide-react-native';

export default function CameraScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Camera', headerShown: false });
  }, [navigation]);
  const route = useRoute<any>();
  const { id } = (route.params ?? {}) as { id: string };
  const printerId = Number(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tick, setTick] = useState(0);

  const printerQuery = useQuery({
    queryKey: ['printer', printerId],
    queryFn: () => api.getPrinter(printerId),
    enabled: Number.isFinite(printerId),
  });
  const statusQuery = useQuery({
    queryKey: ['printerStatus', printerId],
    queryFn: () => api.getPrinterStatus(printerId),
    enabled: Number.isFinite(printerId),
    refetchInterval: 2_000,
  });

  useEffect(() => {
    const interval = setInterval(() => setTick(current => current + 1), 2_000);
    return () => clearInterval(interval);
  }, []);

  const imageUri = useMemo(
    () => withCacheBuster(api.getCameraSnapshotUrl(printerId), tick),
    [printerId, tick],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image
        source={{ uri: imageUri }}
        style={styles.image}
        resizeMode="contain"
      />
      <Pressable
        onPress={() => navigation.goBack()}
        style={[
          styles.closeButton,
          { backgroundColor: colors.overlay, top: insets.top + spacing.md },
        ]}
      >
        <X size={20} color={colors.text} />
      </Pressable>
      <View
        style={[
          styles.overlayCard,
          { backgroundColor: colors.overlay, bottom: insets.bottom + spacing.lg },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {pickString(printerQuery.data, ['name'], 'Camera')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {pickString(statusQuery.data, ['state', 'status'], 'Unknown')}
        </Text>
        <Text
          style={[styles.subtitle, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {pickString(
            statusQuery.data,
            ['current_file', 'job.name'],
            'No active file',
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  image: { flex: 1, width: '100%' },
  closeButton: {
    position: 'absolute',
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  overlayCard: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.sm },
});
