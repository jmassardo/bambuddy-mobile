import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';

export default function ExternalLinkBrowserScreen() {
<<<<<<< HEAD
  const navigation = useNavigation<RootNavigationProp<'ExternalLinkBrowser'>>();
  const route = useRoute<RootRouteProp<'ExternalLinkBrowser'>>();

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: route.params.title?.trim() || 'External Link' });
=======
  const navigation =
    useNavigation<RootNavigationProp<'ExternalLinkBrowser'>>();
  const route = useRoute<RootRouteProp<'ExternalLinkBrowser'>>();

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: route.params.title?.trim() || 'External Link',
    });
>>>>>>> origin/develop
  }, [navigation, route.params.title]);

  return (
    <View style={styles.container}>
<<<<<<< HEAD
      <WebView source={{ uri: route.params.url }} originWhitelist={['http://*', 'https://*']} />
=======
      <WebView
        testID="external-link-webview"
        source={{ uri: route.params.url }}
        originWhitelist={['http://*', 'https://*']}
        javaScriptEnabled={true}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
      />
>>>>>>> origin/develop
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
