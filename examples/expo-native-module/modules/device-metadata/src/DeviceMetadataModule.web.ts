import { registerWebModule, NativeModule } from 'expo';

import { DeviceMetadataModuleEvents } from './DeviceMetadata.types';

// DeviceMetadataModule is not available on the web platform.
class DeviceMetadataModule extends NativeModule<DeviceMetadataModuleEvents> {}

export default registerWebModule(DeviceMetadataModule, 'DeviceMetadataModule');
