import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ImageRef, Interest, Poi } from '@tuur/shared';
import { formatKm } from '../format';
import { colors, radii, shadow } from '../theme';
import { CategoryBadge } from './category-badge';
import { FlipCard } from './flip-card';
import { Icon } from './Icon';
import { INTEREST_ICON } from './icons';
import { PlacePhoto } from './PlacePhoto';
import { PhotoInfo, type PhotoTextSource } from './photo-info';
import { placeInformation, placeSummary } from './placeDetails';
import { SnapCarousel, type SnapCarouselItem } from './SnapCarousel';
import { Text } from './Text';
import type { AccessInfo } from '../backend/types';
import { usePoiText } from '../hooks/usePoiText';
import { PlaceTextStatus, type PlaceTextStatusProps } from './place-text-status';

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
  access,
}: {
  poi: Poi | undefined;
  name: string;
  distanceM?: number | undefined;
  keyFacts?: string[] | undefined;
  /** Narration photos also carry local file URLs for downloaded tours. */
  images?: CardImage[] | undefined;
  lang: string;
  access?: AccessInfo | undefined;
}) {
  const { t } = useTranslation();
  const textInfo = usePoiText(poi, lang, true, access);
  const textPoi = textInfo.poi;
  const pop = useRef(new Animated.Value(0)).current;
  const id = poi?.id ?? name;
  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }).start();
  }, [id, pop]);

  const interest = interestOf(poi);
  const images = narrationImages?.length ? narrationImages : (poi?.imageRefs ?? []);
  const extract = textPoi ? placeSummary(textPoi, lang) : undefined;
  const information = textPoi ? placeInformation(textPoi, lang) : undefined;
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
        <HeroCard
          identity={id}
          name={name}
          interest={interest}
          image={images[0]}
          distance={distance}
          information={information}
          keyFacts={keyFacts}
          textStatus={textInfo}
        />
      ),
    },
  ];
  if (extract)
    items.push({
      key: 'extract',
      label: t('cards.ahead'),
      node: <PromptCard prompt={t('cards.ahead')} body={extract.text} summary={extract} />,
    });
  images.slice(1, 3).forEach((img, i) =>
    items.push({
      key: `img-${i}`,
      label: name,
      node: (
        <PhotoCard
          identity={id}
          image={img}
          name={name}
          interest={interest}
          distance={distance}
          information={information}
          keyFacts={keyFacts}
          textStatus={textInfo}
        />
      ),
    }),
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

interface StopCardInformation {
  identity: string;
  name: string;
  interest?: Interest | undefined;
  distance?: string | undefined;
  information?: PhotoTextSource | undefined;
  keyFacts?: string[] | undefined;
  textStatus?: PlaceTextStatusProps | undefined;
}

export function HeroCard({
  identity,
  name,
  interest,
  image,
  distance,
  information,
  keyFacts,
  textStatus,
}: StopCardInformation & {
  image?: CardImage | undefined;
}) {
  const { t } = useTranslation();
  return (
    <FlipCard
      identity={identity}
      style={cardStyle}
      frontStyle={{ minHeight: CARD_H, paddingTop: 64, justifyContent: 'flex-end' }}
      frontAccessibilityLabel={name}
      front={
        <>
          <PlacePhoto
            image={image}
            name={name}
            icon={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
            showInfo={false}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View style={{ padding: 14, gap: 6, backgroundColor: 'rgba(17,17,17,0.76)' }}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="book-open" size={14} color="#FFFFFF" />
              <Text variant="caption" color="#FFFFFF">
                {t('cards.showInfo')}
              </Text>
            </View>
          </View>
        </>
      }
      back={
        <StopDetails
          name={name}
          interest={interest}
          distance={distance}
          information={information}
          keyFacts={keyFacts}
          textStatus={textStatus}
        />
      }
      overlay={<PhotoInfo image={image} name={name} summary={information} textStatus={textStatus} />}
    />
  );
}

function PhotoCard({ image, identity, name, ...information }: StopCardInformation & { image: CardImage }) {
  return (
    <FlipCard
      identity={identity}
      style={cardStyle}
      frontStyle={{ height: CARD_H }}
      frontAccessibilityLabel={name}
      front={<PlacePhoto image={image} name={name} showInfo={false} />}
      back={<StopDetails name={name} {...information} />}
      overlay={
        <PhotoInfo
          image={image}
          name={name}
          summary={information.information}
          textStatus={information.textStatus}
        />
      }
    />
  );
}

function StopDetails({
  name,
  interest,
  distance,
  information,
  keyFacts,
  textStatus,
}: Omit<StopCardInformation, 'identity'>) {
  const { t } = useTranslation();
  return (
    <>
      <Text variant="headline" style={{ paddingRight: 44 }}>
        {name}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {interest ? <CategoryBadge interest={interest} /> : null}
        {distance ? <Text variant="caption">{distance}</Text> : null}
      </View>
      {keyFacts?.length ? (
        <>
          {keyFacts.slice(0, 3).map((fact, index) => (
            <Text key={index} variant="body">
              {fact}
            </Text>
          ))}
          <Text variant="caption">{t('player.aiGenerated')}</Text>
        </>
      ) : information ? (
        <Text variant="body">{information.text}</Text>
      ) : textStatus ? (
        <PlaceTextStatus {...textStatus} />
      ) : (
        <Text variant="body">{t('stopInfo.unavailable')}</Text>
      )}
      {information && textStatus?.error ? <PlaceTextStatus {...textStatus} /> : null}
    </>
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
