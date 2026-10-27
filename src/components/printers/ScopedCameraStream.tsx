import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { printersApi } from '@/api/printers';
import { useMediaToken } from '@/hooks/useStreamToken';
import { useTranslation } from '@/i18n';
import { CameraMessage } from './CameraControls';

export function ScopedCameraStream({ printerId, rotation = 0 }: { printerId: number; rotation?: number }) {
  const { isReady, token } = useMediaToken();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const degrees = [0, 90, 180, 270].includes(rotation) ? rotation : 0;
  const swapAxes = (degrees === 90 || degrees === 270) && size.width > 0;
  useEffect(() => setFailed(false), [printerId, token]);
  if (!isReady) return <CameraMessage>{t('camera.waitingMedia', { defaultValue: 'Preparing camera access…' })}</CameraMessage>;
  const uri = printersApi.getCameraStreamUrl(printerId);
  if (failed) return <CameraMessage>{t('camera.streamFailed', { defaultValue: 'Live stream unavailable. Reduce the live cap to use snapshots.' })}</CameraMessage>;
  return <View style={styles.container} key={token} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    setSize(current => current.width === width && current.height === height ? current : { width, height });
  }}>
    {Platform.OS === 'ios' ? <WebView
      source={{ html: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#000;overflow:hidden"><img alt="" style="position:absolute;left:50%;top:50%;width:${degrees === 90 || degrees === 270 ? '100vh' : '100vw'};height:${degrees === 90 || degrees === 270 ? '100vw' : '100vh'};object-fit:contain;transform:translate(-50%,-50%) rotate(${degrees}deg)" src="${uri.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></body></html>` }}
      style={styles.image}
      originWhitelist={['about:blank']}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      javaScriptEnabled={false}
      incognito
      sharedCookiesEnabled={false}
      javaScriptCanOpenWindowsAutomatically={false}
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      onError={() => setFailed(true)}
      onHttpError={() => setFailed(true)}
    /> : <Image style={[styles.image, swapAxes ? { position: 'absolute', width: size.height, height: size.width, left: (size.width - size.height) / 2, top: (size.height - size.width) / 2 } : null, { transform: [{ rotate: `${degrees}deg` }] }]} accessibilityLabel={t('camera.liveImage', { defaultValue: 'Live camera' })} source={{ uri }} resizeMode="contain" onError={() => setFailed(true)} />}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  image: { width: '100%', height: '100%' },
});
