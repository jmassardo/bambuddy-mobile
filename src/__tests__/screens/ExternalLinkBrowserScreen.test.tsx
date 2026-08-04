import React from 'react';
import { render } from '@testing-library/react-native';
import ExternalLinkBrowserScreen from '@/screens/ExternalLinkBrowserScreen';

const mockSetOptions = jest.fn();
const mockRoute = {
  params: {
    url: 'https://example.com/docs',
    title: 'Documentation',
  },
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
  useRoute: () => mockRoute,
}));

jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) =>
      ReactModule.createElement(MockView, props),
  };
});

describe('ExternalLinkBrowserScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the routed URL in a hardened WebView', async () => {
    const { getByTestId } = await render(<ExternalLinkBrowserScreen />);
    const webView = getByTestId('external-link-webview');

    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'Documentation' });
    expect(webView.props.source).toEqual({
      uri: 'https://example.com/docs',
    });
    expect(webView.props.originWhitelist).toEqual([
      'http://*',
      'https://*',
    ]);
    expect(webView.props.javaScriptEnabled).toBe(false);
    expect(webView.props.allowFileAccess).toBe(false);
    expect(webView.props.setSupportMultipleWindows).toBe(false);
  });
});
