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
    domStorageEnabled?: boolean;
    scrollEnabled?: boolean;
    onShouldStartLoadWithRequest?: (request: { url: string }) => boolean;
    onMessage?: (event: { nativeEvent: { data: string } }) => void;
  }

  export interface WebViewHandle {
    injectJavaScript: (script: string) => void;
  }

  export const WebView: React.ForwardRefExoticComponent<WebViewProps & React.RefAttributes<WebViewHandle>>;
}
