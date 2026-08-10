import React, { useEffect } from 'react';
import {
  NativeSyntheticEvent,
  requireNativeComponent,
  StyleProp,
  UIManager,
  View,
  ViewStyle,
} from 'react-native';
import type { IOSCameraEvent } from './cameraTransportTypes';

type NativeProps = {
  streamUrl: string;
  snapshotUrl: string;
  attemptId: string;
  snapshotFallbackIntervalMs: number;
  firstFrameTimeoutMs: number;
  paused: boolean;
  onCameraEvent: (event: NativeSyntheticEvent<IOSCameraEvent>) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type IOSMJPEGStreamViewProps = Omit<NativeProps, 'onCameraEvent'> & {
  onCameraEvent: (event: IOSCameraEvent) => void;
};

const viewName = 'IOSMJPEGStreamView';
const isNativeViewAvailable = UIManager.getViewManagerConfig(viewName) != null;
const NativeIOSMJPEGStreamView = isNativeViewAvailable
  ? requireNativeComponent<NativeProps>(viewName)
  : null;

export function IOSMJPEGStreamView({
  onCameraEvent,
  ...props
}: IOSMJPEGStreamViewProps) {
  useEffect(() => {
    if (NativeIOSMJPEGStreamView) return;
    onCameraEvent({
      type: 'failure',
      attemptId: props.attemptId,
      mode: 'native-mjpeg',
      phase: 'request',
      errorCode: 'native_unavailable',
      elapsedMs: 0,
    });
  }, [onCameraEvent, props.attemptId]);

  if (!NativeIOSMJPEGStreamView) {
    return <View style={props.style} testID={props.testID} />;
  }

  return (
    <NativeIOSMJPEGStreamView
      {...props}
      onCameraEvent={event => onCameraEvent(event.nativeEvent)}
    />
  );
}
