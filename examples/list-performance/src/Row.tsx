import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {ROW_HEIGHT, ROW_HEIGHT_TALL, type Row as RowData} from './data';

type Props = {row: RowData};

/**
 * `memo` is the point of this file. Both lists render the same row component,
 * so any difference you measure comes from the list, not the row.
 *
 * The row takes a single `row` prop and no callbacks. A callback prop created
 * inline in `renderItem` would get a new identity on every parent render and
 * defeat `memo` entirely — that is the single most common list-performance bug,
 * and it is why the screen hoists its `renderItem` with `useCallback`.
 */
export const Row = memo(function Row({row}: Props) {
  return (
    <View style={[styles.row, row.tall ? styles.tall : null]}>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {row.subtitle}
        </Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{row.badge}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d9dde2',
  },
  tall: {height: ROW_HEIGHT_TALL},
  text: {flex: 1, minWidth: 0},
  title: {fontSize: 15, fontWeight: '600', color: '#12161b'},
  subtitle: {fontSize: 13, color: '#5b6570', marginTop: 2},
  badge: {
    marginLeft: 12,
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#e8eef8',
    alignItems: 'center',
  },
  badgeText: {fontSize: 12, fontWeight: '600', color: '#14498f'},
});
