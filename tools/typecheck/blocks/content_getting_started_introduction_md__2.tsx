import {useRef} from 'react';
import {View, TextInput, Text} from 'react-native';
import type {ViewInstance, TextInputInstance} from 'react-native';

export function Field() {
  const wrapper = useRef<ViewInstance | null>(null);
  const input = useRef<TextInputInstance | null>(null);

  return (
    <View ref={wrapper}>
      <Text>Email</Text>
      <TextInput ref={input} inputMode="email" />
    </View>
  );
}
