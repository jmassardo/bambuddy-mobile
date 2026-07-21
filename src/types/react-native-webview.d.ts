declare module 'react-native-webview' {
  import type * as React from 'react';
  import type { ViewProps } from 'react-native';

  export interface WebViewProps extends ViewProps {
    source?: { uri?: string; html?: string };
    allowsFullscreenVideo?: boolean;
    mediaPlaybackRequiresUserAction?: boolean;
  }

  export const WebView: React.ComponentType<WebViewProps>;
}
