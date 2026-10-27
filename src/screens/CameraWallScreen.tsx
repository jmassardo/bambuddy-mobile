import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Text, View, type ViewToken } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { printersApi } from '@/api/printers';
import { useServerStore } from '@/api/server';
import { CameraChoices, CameraMessage } from '@/components/printers/CameraControls';
import { CameraSnapshot } from '@/components/printers/CameraSnapshot';
import { ScopedCameraStream } from '@/components/printers/ScopedCameraStream';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { PrinterStatus } from '@/types/api';

type WallSettings = { maxLive: number; interval: number; overlay: 'off' | 'compact' | 'full' };
const defaults: WallSettings = { maxLive: 4, interval: 10, overlay: 'compact' };

export function wallLiveIds(visible: readonly number[], statuses: ReadonlyMap<number, PrinterStatus | undefined>, cap: number) {
  return new Set(visible.filter(id => statuses.get(id)?.connected).slice(0, cap));
}

export default function CameraWallScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission, authEnabled, user } = useAuth();
  const navigation = useNavigation<NavigationProp<{ Camera: { id: number } }>>();
  const focused = useIsFocused();
  const server = useServerStore(state => state.serverUrl);
  const key = `camera-wall:${server ?? ''}`;
  const [settings, setSettings] = useState(defaults);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [visible, setVisible] = useState<number[]>([]);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const active = focused && appActive && loadedKey === key && (!authEnabled || Boolean(user)) && hasPermission('camera:view');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key).then(value => {
      if (cancelled) return;
      try {
        const stored = value ? JSON.parse(value) as Partial<WallSettings> : {};
        setSettings({
          maxLive: typeof stored.maxLive === 'number' ? Math.min(16, Math.max(0, stored.maxLive)) : defaults.maxLive,
          interval: typeof stored.interval === 'number' ? Math.min(60, Math.max(2, stored.interval)) : defaults.interval,
          overlay: stored.overlay === 'off' || stored.overlay === 'full' ? stored.overlay : 'compact',
        });
      } catch { setSettings(defaults); }
      setLoadedKey(key);
    }).catch(() => { if (!cancelled) { setSettings(defaults); setLoadedKey(key); } });
    return () => { cancelled = true; };
  }, [key]);
  const change = (patch: Partial<WallSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void AsyncStorage.setItem(key, JSON.stringify(next));
  };
  const printers = useQuery({ queryKey: ['printers'], queryFn: printersApi.getPrinters, enabled: active });
  const statuses = useQueries({
    queries: (printers.data ?? []).map(printer => ({
      queryKey: ['printerStatus', printer.id],
      queryFn: () => printersApi.getPrinterStatus(printer.id),
      enabled: active,
      refetchInterval: active ? 5000 : false as const,
    })),
  });
  const byId = new Map((printers.data ?? []).map((printer, index) => [printer.id, statuses[index]?.data]));
  const live = wallLiveIds(visible, byId, settings.maxLive);
  const visibleSet = useMemo(() => new Set(visible), [visible]);
  const viewability = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setVisible(viewableItems.map(item => (item.item as { id: number }).id));
  }).current;
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.controls}>
        <TextField label={t('camera.liveCap', { defaultValue: 'Maximum live streams (0–16)' })} value={String(settings.maxLive)} keyboardType="number-pad" onChangeText={value => {
          if (/^\d+$/.test(value)) change({ maxLive: Math.min(16, Math.max(0, Number(value))) });
        }} />
        <TextField label={t('camera.snapshotInterval', { defaultValue: 'Snapshot interval (2–60 seconds)' })} value={String(settings.interval)} keyboardType="number-pad" onChangeText={value => {
          if (/^\d+$/.test(value)) change({ interval: Math.min(60, Math.max(2, Number(value))) });
        }} />
        <CameraChoices label={t('camera.statusOverlay', { defaultValue: 'Status overlay' })} options={['off', 'compact', 'full']} value={settings.overlay} onChange={overlay => change({ overlay })} />
        {printers.isError ? <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} onPress={() => void printers.refetch()} /> : null}
      </View>
      <FlatList
        data={printers.data ?? []}
        keyExtractor={printer => String(printer.id)}
        onViewableItemsChanged={viewability}
        viewabilityConfig={{ itemVisiblePercentThreshold: 25 }}
        extraData={[active, settings, visible, statuses.map(status => status.dataUpdatedAt).join(',')]}
        renderItem={({ item: printer }) => {
          const status = byId.get(printer.id);
          const running = active && visibleSet.has(printer.id) && Boolean(status?.connected);
          return <Pressable accessibilityRole="button" accessibilityLabel={t('camera.openPrinter', { defaultValue: 'Open {{printer}} camera', printer: printer.name })} onPress={() => navigation.navigate('Camera', { id: printer.id })} style={[styles.tile, { borderColor: colors.border }]}>
            <Text style={[styles.name, { color: colors.text }]}>{printer.name}</Text>
            <View style={styles.feed}>
              {running ? (live.has(printer.id)
                ? <ScopedCameraStream key={`${printer.id}:${server}`} printerId={printer.id} rotation={printer.camera_rotation} />
                : <CameraSnapshot printerId={printer.id} rotation={printer.camera_rotation} active={running} intervalSec={settings.interval} />)
                : <CameraMessage>{status?.connected ? t('camera.paused', { defaultValue: 'Camera paused' }) : t('camera.offline', { defaultValue: 'Printer offline' })}</CameraMessage>}
            </View>
            {settings.overlay !== 'off' ? <CameraMessage>{status?.state ?? '—'} · {Math.round(status?.progress ?? 0)}%</CameraMessage> : null}
            {settings.overlay === 'full' ? <CameraMessage>{status?.subtask_name ?? status?.gcode_file ?? '—'}{'\n'}{t('camera.wallDetails', { defaultValue: 'Layer {{layer}}/{{total}} · Remaining {{remaining}} min', layer: status?.layer_num ?? '—', total: status?.total_layers ?? '—', remaining: status?.remaining_time ?? '—' })}</CameraMessage> : null}
          </Pressable>;
        }}
        ListEmptyComponent={<CameraMessage>{printers.isLoading ? t('camera.loadingPrinters', { defaultValue: 'Loading printers…' }) : t('camera.noPrinters', { defaultValue: 'No printers' })}</CameraMessage>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controls: { padding: spacing.md, gap: spacing.sm },
  tile: { margin: spacing.sm, padding: spacing.sm, borderWidth: 1, borderRadius: 12 },
  feed: { height: 220 },
  name: { fontWeight: '600' },
});
