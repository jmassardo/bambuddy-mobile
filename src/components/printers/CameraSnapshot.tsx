import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { camerasApi } from '@/api/cameras';
import { useMediaToken } from '@/hooks/useStreamToken';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import { PrimaryButton } from '@/components/common/AppUI';
import { CameraMessage } from './CameraControls';

export function CameraSnapshot({ printerId, active = true, refreshSeed = 0, intervalSec = 0, rotation = 0, resizeMode = 'contain' }: {
  printerId: number; active?: boolean; refreshSeed?: number; intervalSec?: number; rotation?: number; resizeMode?: 'contain' | 'cover';
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { token, isReady } = useMediaToken();
  const [seed, setSeed] = useState(Date.now);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const degrees = [0, 90, 180, 270].includes(rotation) ? rotation : 0;
  const swapAxes = (degrees === 90 || degrees === 270) && size.width > 0;
  useEffect(() => {
    setLoading(true);
    setFailed(false);
    setSeed(current => Math.max(Date.now(), current + 1));
  }, [printerId, refreshSeed, token, active]);
  useEffect(() => {
    if (!active || !isReady || intervalSec <= 0) return;
    const timer = setInterval(() => {
      setLoading(true);
      setFailed(false);
      setSeed(current => Math.max(Date.now(), current + 1));
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [active, intervalSec, isReady]);
  if (!active) return null;
  return (
    <View style={styles.container} onLayout={event => {
      const { width, height } = event.nativeEvent.layout;
      setSize(current => current.width === width && current.height === height ? current : { width, height });
    }}>
      {isReady ? <Image key={`${printerId}:${seed}:${token}`} accessibilityLabel={t('camera.snapshotImage', { defaultValue: 'Camera snapshot' })} style={[styles.image, swapAxes ? { width: size.height, height: size.width, left: (size.width - size.height) / 2, top: (size.height - size.width) / 2 } : null, { transform: [{ rotate: `${degrees}deg` }] }]} resizeMode={resizeMode} source={{ uri: camerasApi.snapshot(printerId, seed) }} onLoad={() => { setLoading(false); setFailed(false); }} onError={() => { setLoading(false); setFailed(true); }} /> : null}
      {(loading || !isReady) && !failed ? <ActivityIndicator accessibilityLabel={t('camera.loadingSnapshot', { defaultValue: 'Loading snapshot' })} style={styles.loading} color={colors.accent} /> : null}
      {failed ? <View style={styles.error}>
        <CameraMessage>{t('camera.snapshotFailed', { defaultValue: 'Snapshot unavailable. Retry without starting a live stream.' })}</CameraMessage>
        <PrimaryButton label={t('camera.refreshSnapshot', { defaultValue: 'Refresh snapshot' })} onPress={() => { setFailed(false); setLoading(true); setSeed(current => current + 1); }} />
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 160 },
  image: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  loading: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  error: { position: 'absolute', top: '30%', left: 16, right: 16 },
});
