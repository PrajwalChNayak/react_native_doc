import type { StyleProp, ViewStyle } from 'react-native';

export type DeviceMetadataModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type OnTapEventPayload = Record<string, never>;

export type DeviceMetadataViewProps = {
  style?: StyleProp<ViewStyle>;
};
