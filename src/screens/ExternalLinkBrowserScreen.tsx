import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';

export default function ExternalLinkBrowserScreen() {
  const navigation = useNavigation<RootNavigationProp<'ExternalLinkBrowser'>>();
  const route = useRoute<RootRouteProp<'ExternalLinkBrowser'>>();

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: route.params.title?.trim() || 'External Link' });
  }, [navigation, route.params.title]);

  return (
    <View style={styles.container}>
      <WebView source={{ uri: route.params.url }} originWhitelist={['http://*', 'https://*']} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
