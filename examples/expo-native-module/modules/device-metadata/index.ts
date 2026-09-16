// Re-export the native module. On web, it will be resolved to DeviceMetadataModule.web.ts
// and on native platforms to DeviceMetadataModule.ts
export { default } from './src/DeviceMetadataModule';
export { default as DeviceMetadataView } from './src/DeviceMetadataView';
export * from './src/DeviceMetadata.types';
