import { translateNative, useNativeLocale } from '@/i18n';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useTheme } from '@/theme';

export default function ExternalLinkBrowserScreen() {
  const titleLocale = useNativeLocale();
  const { colors } = useTheme();
  const [reload, setReload] = React.useState(0);
  const navigation =
    useNavigation<RootNavigationProp<'ExternalLinkBrowser'>>();
  const route = useRoute<RootRouteProp<'ExternalLinkBrowser'>>();

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: route.params.title?.trim() || translateNative('screen.externalLink'),
    });
  }, [navigation, route.params.title, titleLocale]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WebView
        key={`${route.params.url}:${reload}`}
        startInLoadingState
        renderLoading={() => <LoadingScreen />}
        renderError={(_domain, _code, message) => <ErrorState message={message} onRetry={() => setReload(value => value + 1)} />}
        testID="external-link-webview"
        source={{ uri: route.params.url }}
        originWhitelist={['http://*', 'https://*']}
        javaScriptEnabled={true}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
