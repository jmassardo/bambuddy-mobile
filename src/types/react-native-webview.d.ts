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
    onShouldStartLoadWithRequest?: (request: { url: string; isTopFrame?: boolean }) => boolean;
    onMessage?: (event: { nativeEvent: { data: string } }) => void;
    injectedJavaScriptBeforeContentLoaded?: string;
    injectedJavaScriptBeforeContentLoadedForMainFrameOnly?: boolean;
    incognito?: boolean;
    sharedCookiesEnabled?: boolean;
    useSharedProcessPool?: boolean;
    javaScriptCanOpenWindowsAutomatically?: boolean;
    allowFileAccessFromFileURLs?: boolean;
    allowUniversalAccessFromFileURLs?: boolean;
    allowsLinkPreview?: boolean;
    onOpenWindow?: () => void;
    onFileDownload?: () => void;
    onError?: (event: { nativeEvent: { description: string } }) => void;
    onHttpError?: (event: { nativeEvent?: { statusCode?: number } }) => void;
    onContentProcessDidTerminate?: () => void;
    onNavigationStateChange?: (navigation: { url: string }) => void;
    mixedContentMode?: 'never' | 'always' | 'compatibility';
    thirdPartyCookiesEnabled?: boolean;
    startInLoadingState?: boolean;
  }

  export interface WebViewHandle {
    injectJavaScript: (script: string) => void;
  }

  export const WebView: React.ForwardRefExoticComponent<WebViewProps & React.RefAttributes<WebViewHandle>>;
}
