import { requireNativeView } from 'expo';
import * as React from 'react';

import { DeviceMetadataViewProps } from './DeviceMetadata.types';

const NativeView: React.ComponentType<DeviceMetadataViewProps> = requireNativeView('DeviceMetadata');

export default function DeviceMetadataView(props: DeviceMetadataViewProps) {
  return <NativeView {...props} />;
}
