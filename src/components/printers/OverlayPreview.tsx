import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getAuthToken } from '@/api/http';

import { CameraMessage } from './CameraControls';

export function allowOverlayNavigation(expected: string, candidate: string) {
  try {
    const url = new URL(candidate);
    return url.href === new URL(expected).href && !url.username && !url.password && /^https?:$/.test(url.protocol);
  } catch {
    return false;
  }
}

export function OverlayPreview({ url }: { url: string }) {
  useNativeLocale();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const jwt = getAuthToken();
  const encoded = JSON.stringify(jwt).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return <View style={styles.container}>
    {failed ? <CameraMessage>{t('camera.previewFailed', { defaultValue: 'Preview failed. Check the overlay token and server connection.' })}</CameraMessage> : <WebView
      source={{ uri: url }}
      style={styles.preview}
      originWhitelist={['https://*', 'http://*']}
      onShouldStartLoadWithRequest={request => allowOverlayNavigation(url, request.url)}
      injectedJavaScriptBeforeContentLoaded={`window.sessionStorage.removeItem("auth_token"); ${jwt ? `window.sessionStorage.setItem("auth_token", ${encoded});` : ''} true;`}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly
      javaScriptEnabled
      incognito
      sharedCookiesEnabled={false}
      useSharedProcessPool={false}
      javaScriptCanOpenWindowsAutomatically={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      allowsLinkPreview={false}
      onOpenWindow={() => undefined}
      onFileDownload={() => undefined}
      onError={() => setFailed(true)}
      onHttpError={() => setFailed(true)}
      onContentProcessDidTerminate={() => setFailed(true)}
    />}
  </View>;
}

const styles = StyleSheet.create({
  container: { height: 260 },
  preview: { flex: 1 },
});
