import { useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewInstance,
} from 'react-native';

import { formatCount } from '../counter';
import type { Theme } from '../theme';

type Props = {
  count: number;
  step: number;
  theme: Theme;
  onIncrement: () => void;
  onDecrement: () => void;
  onReset: () => void;
  /** Called with the on-screen height of the card, measured natively. */
  onMeasured?: (height: number) => void;
};

export function CounterCard({
  count,
  step,
  theme,
  onIncrement,
  onDecrement,
  onReset,
  onMeasured,
}: Props) {
  // Under the Strict TypeScript API a View ref is a `ViewInstance`, not the
  // removed `NativeMethods` mixin type. `ViewInstance` is an alias of
  // `HostInstance`, which is what carries `measureInWindow` and friends.
  const cardRef = useRef<ViewInstance | null>(null);

  const measure = () => {
    cardRef.current?.measureInWindow((_x, _y, _width, height) => {
      onMeasured?.(height);
    });
  };

  return (
    <View
      ref={cardRef}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}>
      <Text style={[styles.label, { color: theme.muted }]}>Count</Text>
      <Text style={[styles.value, { color: theme.text }]}>
        {formatCount(count)}
      </Text>
      <Text style={[styles.label, { color: theme.muted }]}>
        Step size: {step}
      </Text>

      <View style={styles.row}>
        <CardButton label="-" theme={theme} onPress={onDecrement} />
        <CardButton label="+" theme={theme} onPress={onIncrement} />
      </View>

      <View style={styles.row}>
        <CardButton label="Reset" theme={theme} onPress={onReset} />
        <CardButton label="Measure" theme={theme} onPress={measure} />
      </View>
    </View>
  );
}

type CardButtonProps = {
  label: string;
  theme: Theme;
  onPress: () => void;
};

function CardButton({ label, theme, onPress }: CardButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.accent, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 8,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
