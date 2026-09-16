import { DeviceMetadataViewProps } from './DeviceMetadata.types';

// DeviceMetadataView is not available on the web platform.
export default function DeviceMetadataView(_props: DeviceMetadataViewProps) {
  throw new Error('DeviceMetadataView is not available on the web platform.');
}
