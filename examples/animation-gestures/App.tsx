import {useCallback, useState} from 'react';
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  directionOf,
  opacityFor,
  restingX,
  rotationFor,
  shouldCommit,
  type Direction,
  type SwipeConfig,
} from './src/swipe';

const CARDS = [
  {id: '1', title: 'Worklets run on the UI thread', body: 'So a drag keeps up with your finger even when the JS thread is busy.'},
  {id: '2', title: 'Shared values are mutable', body: 'Writing .value does not re-render. That is the point.'},
  {id: '3', title: 'runOnJS crosses back', body: 'Use it for state changes, never per frame.'},
  {id: '4', title: 'Gesture composition', body: 'Simultaneous, Exclusive and Race describe how handlers interact.'},
];

export default function App() {
  return (
    // Required at the root, above everything that uses a gesture.
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
          <Deck />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Deck() {
  const {width} = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<string>('Drag a card sideways.');

  const config: SwipeConfig = {
    distanceThreshold: 110,
    velocityThreshold: 800,
    width,
  };

  const onSwiped = useCallback((direction: Direction) => {
    setLog(`Swiped ${direction}.`);
    setIndex(i => (i + 1) % CARDS.length);
  }, []);

  const card = CARDS[index];

  return (
    <View style={styles.deck}>
      <Text style={styles.heading}>Swipeable card</Text>
      <Text style={styles.log} accessibilityLiveRegion="polite">
        {log}
      </Text>
      <SwipeCard
        key={card.id}
        title={card.title}
        body={card.body}
        config={config}
        onSwiped={onSwiped}
      />
    </View>
  );
}

type CardProps = {
  title: string;
  body: string;
  config: SwipeConfig;
  onSwiped: (direction: Direction) => void;
};

function SwipeCard({title, body, config, onSwiped}: CardProps) {
  // Shared values live on the UI thread. Mutating .value does not re-render.
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const pan = Gesture.Pan()
    .onChange(event => {
      // This body is a worklet: the Babel plugin extracts it so it runs on the
      // UI thread. That is why the card tracks the finger even under JS load.
      x.value += event.changeX;
      y.value += event.changeY;
    })
    .onEnd(event => {
      if (shouldCommit(x.value, event.velocityX, config)) {
        const direction = directionOf(x.value, event.velocityX);
        x.value = withTiming(restingX(direction, config), {duration: 220}, finished => {
          // runOnJS hops back to the JS thread to touch React state. It belongs
          // here, once per gesture — never in onChange, which runs every frame.
          if (finished) runOnJS(onSwiped)(direction);
        });
        y.value = withTiming(y.value + 40, {duration: 220});
        return;
      }
      x.value = withSpring(0, {damping: 18});
      y.value = withSpring(0, {damping: 18});
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: x.value},
      {translateY: y.value},
      {rotate: `${rotationFor(x.value, config)}deg`},
    ],
    opacity: opacityFor(x.value, config),
  }));

  return (
    <GestureDetector gesture={pan}>
      {/* transform and opacity only — both are animated off the JS thread.
          Animating width, height or margin here would force layout every
          frame and is the usual cause of a janky card. */}
      <Animated.View style={[styles.card, animatedStyle]}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  screen: {flex: 1, backgroundColor: '#f4f6f8'},
  deck: {flex: 1, alignItems: 'center', paddingTop: 24},
  heading: {fontSize: 22, fontWeight: '700', color: '#12161b'},
  log: {fontSize: 14, color: '#5b6570', marginTop: 6, marginBottom: 28},
  card: {
    width: 300,
    minHeight: 180,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 22,
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#0b1220',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 6},
  },
  cardTitle: {fontSize: 19, fontWeight: '700', color: '#12161b', marginBottom: 10},
  cardBody: {fontSize: 15, lineHeight: 22, color: '#41505f'},
});
