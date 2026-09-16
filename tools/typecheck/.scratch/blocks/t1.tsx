import React from 'react';
import {WebView} from 'react-native-webview';
import type {WebViewMessageEvent} from 'react-native-webview';

export function Wv() {
  const onMessage = (e: WebViewMessageEvent) => {
    console.log(e.nativeEvent.data);
  };
  return (
    <WebView
      source={{uri: 'https://example.com'}}
      originWhitelist={['https://example.com']}
      javaScriptEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
      mixedContentMode="never"
      onMessage={onMessage}
      onShouldStartLoadWithRequest={(req) => req.url.startsWith('https://example.com/')}
    />
  );
}
