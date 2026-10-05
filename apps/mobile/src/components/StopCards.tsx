import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ImageRef, Interest, Poi } from '@tuur/shared';
import { formatKm } from '../format';
import { colors, radii, shadow } from '../theme';
import { CategoryBadge } from './category-badge';
import { INTEREST_ICON } from './icons';
import { PlacePhoto } from './PlacePhoto';
import { PhotoInfo, type PhotoTextSource } from './photo-info';
import { placeSummary } from './placeDetails';
import { SnapCarousel, type SnapCarouselItem } from './SnapCarousel';
import { Text } from './Text';

const CARD_H = 218;
type CardImage = Omit<ImageRef, 'file'>;

export const interestOf = (poi: Poi | undefined): Interest | undefined =>
  poi?.primaryInterest ?? poi?.interests[0];

/**
 * Profile-style cards about the next stop that pop up while walking there: photo with name and category, a
 * "what awaits you" text from Wikipedia, more photos and, once narrated, the fact-checked key facts. Every image
 * carries its Commons attribution, every text its source.
 */
export function StopCards({
  poi,
  name,
  distanceM,
  keyFacts,
  images: narrationImages,
  lang,
}: {
  poi: Poi | undefined;
  name: string;
  distanceM?: number | undefined;
  keyFacts?: string[] | undefined;
  /** Narration photos also carry local file URLs for downloaded tours. */
  images?: CardImage[] | undefined;
  lang: string;
}) {
  const { t } = useTranslation();
  const pop = useRef(new Animated.Value(0)).current;
  const id = poi?.id ?? name;
  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }).start();
  }, [id, pop]);

  const interest = interestOf(poi);
  const images = narrationImages?.length ? narrationImages : (poi?.imageRefs ?? []);
  const extract = poi ? placeSummary(poi, lang) : undefined;
  const distance =
    distanceM === undefined
      ? undefined
      : distanceM < 25
        ? t('cards.here')
        : t('cards.away', {
            distance: distanceM >= 1000 ? `${formatKm(distanceM, lang)} km` : `${distanceM} m`,
          });

  const items: SnapCarouselItem[] = [
    {
      key: 'hero',
      label: name,
      node: (
        <HeroCard name={name} interest={interest} image={images[0]} distance={distance} summary={extract} />
      ),
    },
  ];
  if (extract)
    items.push({
      key: 'extract',
      label: t('cards.ahead'),
      node: <PromptCard prompt={t('cards.ahead')} body={extract.text} summary={extract} />,
    });
  images
    .slice(1, 3)
    .forEach((img, i) =>
      items.push({ key: `img-${i}`, label: name, node: <PhotoCard image={img} name={name} /> }),
    );
  if (keyFacts?.length)
    items.push({
      key: 'facts',
      label: t('cards.didYouKnow'),
      node: <PromptCard prompt={t('cards.didYouKnow')} body={keyFacts.slice(0, 3).join('\n\n')} ai />,
    });

  return (
    <Animated.View
      style={{
        opacity: pop,
        transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }],
      }}
    >
      <SnapCarousel peek={24} items={items} />
    </Animated.View>
  );
}

const cardStyle = {
  minHeight: CARD_H,
  borderRadius: radii.lg,
  overflow: 'hidden' as const,
  borderCurve: 'continuous' as const,
  backgroundColor: colors.surface.base,
  ...shadow.card,
};

function HeroCard({
  name,
  interest,
  image,
  distance,
  summary,
}: {
  name: string;
  interest?: Interest | undefined;
  image?: CardImage | undefined;
  distance?: string | undefined;
  summary?: PhotoTextSource | undefined;
}) {
  return (
    <View style={[cardStyle, { paddingTop: 64, justifyContent: 'flex-end' }]}>
      <PlacePhoto
        image={image}
        name={name}
        icon={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
        showInfo={false}
        style={{ position: 'absolute', inset: 0 }}
      />
      <View
        style={{
          padding: 14,
          gap: 6,
          backgroundColor: 'rgba(17,17,17,0.76)',
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {interest ? <CategoryBadge interest={interest} /> : null}
          {distance ? (
            <Text variant="caption" style={{ color: '#FFFFFF' }}>
              {distance}
            </Text>
          ) : null}
        </View>
        <Text variant="title" numberOfLines={2} style={{ color: '#FFFFFF' }}>
          {name}
        </Text>
      </View>
      <PhotoInfo image={image} name={name} summary={summary} />
    </View>
  );
}

function PhotoCard({ image, name }: { image: CardImage; name: string }) {
  return (
    <View style={[cardStyle, { height: CARD_H }]}>
      <PlacePhoto image={image} name={name} />
    </View>
  );
}

function PromptCard({
  prompt,
  body,
  summary,
  ai,
}: {
  prompt: string;
  body: string;
  summary?: PhotoTextSource | undefined;
  ai?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[cardStyle, { padding: 18, gap: 10 }]}>
      <Text
        variant="subheadline"
        style={{ color: colors.brand.redPressed, fontWeight: '600', paddingRight: summary ? 44 : 0 }}
      >
        {prompt}
      </Text>
      <Text variant="body" numberOfLines={7} style={{ flex: 1 }}>
        {body}
      </Text>
      {summary ? <PhotoInfo name={prompt} summary={summary} /> : null}
      {ai ? <Text variant="caption">{t('player.aiGenerated')}</Text> : null}
    </View>
  );
}
