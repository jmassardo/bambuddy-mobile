declare module 'react-native-webview' {
  import type * as React from 'react';
  import type { ViewProps } from 'react-native';

  export interface WebViewProps extends ViewProps {
    source?: { uri?: string; html?: string };
    originWhitelist?: string[];
    javaScriptEnabled?: boolean;
    allowFileAccess?: boolean;
    setSupportMultipleWindows?: boolean;
    allowsInlineMediaPlayback?: boolean;
    allowsFullscreenVideo?: boolean;
    mediaPlaybackRequiresUserAction?: boolean;
  }

  export const WebView: React.ComponentType<WebViewProps>;
}
