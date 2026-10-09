import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, useWindowDimensions, type ScrollView } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { distanceMeters, haversineMatrix, type LatLng, type Poi } from '@tuur/shared';
import { useReduceMotion } from '../motion';
import { retainCarouselSelection, type CarouselSelection } from './carouselSelection';
import { PlaceCard } from './PlaceCard';

const GAP = 12;

interface Props {
  places: Poi[];
  position?: LatLng | null;
  navigate?: boolean;
  disabled?: boolean;
  /** Only the card's navigation button chooses a destination; tapping its body flips it. */
  onNavigate: (poi: Poi) => void;
  /** Lines the place up as the stop after the current target; toggles it off when already queued. */
  onQueue?: ((poi: Poi) => void) | undefined;
  queuedIds?: readonly string[] | undefined;
  /** A map selection scrolls the matching card into view without starting its activity. */
  selectedId?: string | null | undefined;
  /** Increment when selecting the same map pin again after manually browsing cards. */
  selectionKey?: number | string | undefined;
}

/** Centered destination cards; only the scroll position and transforms run every frame. */
export function PlacesCarousel({
  places,
  position,
  navigate = false,
  disabled = false,
  onNavigate,
  onQueue,
  queuedIds,
  selectedId,
  selectionKey,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  const viewportWidth = measuredWidth ?? windowWidth;
  const [snapshot, setSnapshot] = useState(() => ({ places, width: viewportWidth }));
  const pending = useRef(snapshot);
  const interacting = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedPlaces = snapshot.places;
  const width = snapshot.width;
  const cardWidth = Math.min(360, Math.max(160, width - 80));
  const interval = cardWidth + GAP;
  const side = Math.max(0, (width - cardWidth) / 2);
  const reduced = useReduceMotion();
  const scrollX = useSharedValue(0);
  const scroller = useRef<ScrollView>(null);
  const selected = useRef<CarouselSelection>({ id: places[0]?.id ?? null, index: 0 });
  const synchronizedLayout = useRef('');
  const synchronizedSelection = useRef('');
  const latestSelectionRequest = useRef('');
  const selectionRequest = JSON.stringify([selectedId ?? null, selectionKey ?? null]);
  const ids = displayedPlaces.map((poi) => poi.id);
  const order = JSON.stringify(ids);

  const rememberSelection = useCallback((next: CarouselSelection) => {
    selected.current = next;
  }, []);

  const clearSettleTimer = useCallback(() => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  }, []);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  // Keep the geometry and destinations under the finger stable through native momentum.
  // Position labels can still update; only the latest result snapshot is adopted on release.
  useLayoutEffect(() => {
    pending.current = { places, width: viewportWidth };
    if (latestSelectionRequest.current !== selectionRequest) {
      latestSelectionRequest.current = selectionRequest;
      if (selectedId) {
        interacting.current = false;
        clearSettleTimer();
      }
    }
    if (!interacting.current) setSnapshot(pending.current);
  }, [places, viewportWidth, selectedId, selectionRequest, clearSettleTimer]);

  // Location updates can change ranking while this component remains mounted. Track identity,
  // then move without animation so a new POI never silently replaces the one being considered.
  useLayoutEffect(() => {
    const layout = `${interval}:${order}`;
    if (!selectedId) synchronizedSelection.current = selectionRequest;
    const requested = selectedId && synchronizedSelection.current !== selectionRequest;
    if (synchronizedLayout.current === layout && !requested) return;
    synchronizedLayout.current = layout;
    const next = retainCarouselSelection(
      displayedPlaces.map((poi) => poi.id),
      selected.current,
      requested ? selectedId : undefined,
    );
    if (requested && next.id === selectedId) synchronizedSelection.current = selectionRequest;
    rememberSelection(next);
    const x = next.index * interval;
    scrollX.set(x);
    scroller.current?.scrollTo({ x, animated: false });
  }, [interval, order, displayedPlaces, rememberSelection, scrollX, selectedId, selectionRequest]);

  const settle = useCallback(
    (x: number) => {
      const index = Math.max(0, Math.min(displayedPlaces.length - 1, Math.round(x / interval)));
      rememberSelection({ id: displayedPlaces[index]?.id ?? null, index });
    },
    [interval, displayedPlaces, rememberSelection],
  );
  const beginInteraction = useCallback(() => {
    clearSettleTimer();
    interacting.current = true;
  }, [clearSettleTimer]);
  const endInteraction = useCallback(
    (x: number) => {
      if (!interacting.current) return;
      clearSettleTimer();
      // Resolve against the cards actually scrolled before reconciling the latest live order.
      settle(x);
      interacting.current = false;
      setSnapshot(pending.current);
    },
    [clearSettleTimer, settle],
  );
  const endDrag = useCallback(() => {
    clearSettleTimer();
    // A drag released without momentum has no momentum-end event. A following momentum-start
    // cancels this fallback, so a live update cannot interrupt a fling or a native snap.
    settleTimer.current = setTimeout(() => endInteraction(scrollX.get()), 180);
  }, [clearSettleTimer, endInteraction, scrollX]);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.set(event.contentOffset.x);
    },
    onBeginDrag: () => {
      scheduleOnRN(beginInteraction);
    },
    onEndDrag: () => {
      scheduleOnRN(endDrag);
    },
    onMomentumBegin: () => {
      scheduleOnRN(beginInteraction);
    },
    onMomentumEnd: (event) => {
      scheduleOnRN(endInteraction, event.contentOffset.x);
    },
  });

  return (
    <View
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0) setMeasuredWidth((previous) => (previous === nextWidth ? previous : nextWidth));
      }}
    >
      <Animated.ScrollView
        ref={scroller}
        horizontal
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        contentContainerStyle={{ paddingHorizontal: side, paddingVertical: 12, gap: GAP }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (interacting.current) return;
          // Native content measurement can follow the layout effect on rotation or insertion.
          const x = selected.current.index * interval;
          scrollX.set(x);
          scroller.current?.scrollTo({ x, animated: false });
        }}
      >
        {displayedPlaces.map((poi, index) => (
          <CarouselPlace
            key={poi.id}
            poi={poi}
            index={index}
            width={cardWidth}
            interval={interval}
            scrollX={scrollX}
            reduced={reduced}
            position={position}
            navigate={navigate}
            disabled={disabled}
            onNavigate={() => onNavigate(poi)}
            onQueue={onQueue ? () => onQueue(poi) : undefined}
            queuePosition={queuedIds && queuedIds.includes(poi.id) ? queuedIds.indexOf(poi.id) + 1 : undefined}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function CarouselPlace({
  poi,
  index,
  width,
  interval,
  scrollX,
  reduced,
  position,
  navigate,
  disabled,
  onNavigate,
  onQueue,
  queuePosition,
}: {
  poi: Poi;
  index: number;
  width: number;
  interval: number;
  scrollX: SharedValue<number>;
  reduced: boolean;
  position: LatLng | null | undefined;
  navigate: boolean;
  disabled: boolean;
  onNavigate: () => void;
  onQueue: (() => void) | undefined;
  queuePosition: number | undefined;
}) {
  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * interval, index * interval, (index + 1) * interval];
    const x = scrollX.get();
    return {
      opacity: interpolate(x, input, [0.62, 1, 0.62], Extrapolation.CLAMP),
      transform: reduced
        ? []
        : [
            { translateY: interpolate(x, input, [10, 0, 10], Extrapolation.CLAMP) },
            { scale: interpolate(x, input, [0.88, 1, 0.88], Extrapolation.CLAMP) },
          ],
    };
  });
  const meters = position ? distanceMeters(position, poi.location) : undefined;
  const minutes = position
    ? Math.max(1, Math.round(haversineMatrix([position, poi.location], 'foot-walking').minutes[0]![1]!))
    : undefined;
  return (
    <Animated.View style={[{ width, alignSelf: 'flex-start' }, style]}>
      <PlaceCard
        poi={poi}
        width={width}
        distanceM={meters}
        minutes={minutes}
        navigate={navigate}
        disabled={disabled}
        onNavigate={onNavigate}
        onQueue={onQueue}
        queuePosition={queuePosition}
      />
    </Animated.View>
  );
}
