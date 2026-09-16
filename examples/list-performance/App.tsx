import {useCallback, useMemo, useState} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {FlashList} from '@shopify/flash-list';
import {Row} from './src/Row';
import {makeRows, type Row as RowData} from './src/data';

const COUNT = 10000;

type Mode = 'flatlist' | 'flatlist-naive' | 'flashlist';

const MODES: {key: Mode; label: string}[] = [
  {key: 'flatlist', label: 'FlatList'},
  {key: 'flatlist-naive', label: 'FlatList (naive)'},
  {key: 'flashlist', label: 'FlashList'},
];

export default function App() {
  const [mode, setMode] = useState<Mode>('flatlist');

  // Built once. Regenerating the array on every render would make every list
  // look equally bad and hide the difference this example exists to show.
  const data = useMemo(() => makeRows(COUNT), []);

  const keyExtractor = useCallback((item: RowData) => item.id, []);

  const renderItem = useCallback(
    ({item}: ListRenderItemInfo<RowData>) => <Row row={item} />,
    [],
  );

  // FlashList declares its own ListRenderItemInfo, which has no `separators`
  // field, so React Native's ListRenderItem type is not assignable to it. The
  // two lists therefore need separate callbacks even though the body is
  // identical — worth knowing before you try to share one between them.
  const renderItemFlash = useCallback(
    ({item}: {item: RowData}) => <Row row={item} />,
    [],
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.heading}>{COUNT.toLocaleString()} rows</Text>
          <View style={styles.tabs}>
            {MODES.map(m => {
              const active = m.key === mode;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setMode(m.key)}
                  style={[styles.tab, active && styles.tabActive]}
                  accessibilityRole="button"
                  accessibilityState={{selected: active}}>
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {mode === 'flashlist' ? (
          // FlashList 2.x needs no size estimate: it measures rows itself.
          // It also rejects FlatList's windowing props, which is deliberate —
          // its recycler does not have an equivalent knob.
          <FlashList data={data} renderItem={renderItemFlash} keyExtractor={keyExtractor} />
        ) : mode === 'flatlist' ? (
          <FlatList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            // Hoisted renderItem + memoised Row + a stable keyExtractor are
            // what actually make this variant usable at 10k rows.
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
          />
        ) : (
          <FlatList
            data={data}
            // Every one of these is a mistake, kept together so the cost is
            // observable on a real device. Each closure is newly created per
            // render, so `memo` on Row never hits.
            renderItem={({item}: ListRenderItemInfo<RowData>) => <Row row={item} />}
            keyExtractor={(item: RowData) => item.id}
            // A very large window forces far more rows to stay mounted.
            windowSize={41}
            initialNumToRender={COUNT > 200 ? 200 : COUNT}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#ffffff'},
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d9dde2',
  },
  heading: {fontSize: 20, fontWeight: '700', color: '#12161b', marginBottom: 10},
  tabs: {flexDirection: 'row', gap: 6},
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#eef1f4',
  },
  tabActive: {backgroundColor: '#0a58ca'},
  tabText: {fontSize: 13, fontWeight: '600', color: '#41505f'},
  tabTextActive: {color: '#ffffff'},
});
