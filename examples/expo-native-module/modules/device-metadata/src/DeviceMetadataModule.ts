import { NativeModule, requireNativeModule } from 'expo';

import { DeviceMetadataModuleEvents } from './DeviceMetadata.types';

declare class DeviceMetadataModule extends NativeModule<DeviceMetadataModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<DeviceMetadataModule>('DeviceMetadata');
