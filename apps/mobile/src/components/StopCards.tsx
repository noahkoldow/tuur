import { useEffect, useRef } from 'react';
import { Animated, Linking, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ImageRef, Interest, Poi } from '@tuur/shared';
import { formatKm } from '../format';
import { colors, radii, shadow } from '../theme';
import { INTEREST_ICON } from './icons';
import { ImageCredit } from './ImageCredit';
import { SnapCarousel, type SnapCarouselItem } from './SnapCarousel';
import { Text } from './Text';

const CARD_H = 250;

export const interestOf = (poi: Poi | undefined): Interest | undefined =>
  poi?.primaryInterest ?? poi?.interests[0];

/** First sentences of the best-matching Wikipedia extract (UI language, then English, then any). */
function extractOf(poi: Poi, lang: string): { text: string; url?: string } | undefined {
  const refs = poi.sources.wikipedia.filter((w) => w.extract);
  const ref = refs.find((w) => w.lang === lang) ?? refs.find((w) => w.lang === 'en') ?? refs[0];
  if (!ref?.extract) return undefined;
  const sentences = ref.extract.match(/[^.!?]+[.!?]+/g) ?? [ref.extract];
  let text = '';
  for (const s of sentences) {
    if (text && (text + s).length > 300) break;
    text += s;
  }
  return { text: text.trim(), ...(ref.url ? { url: ref.url } : {}) };
}

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
  lang,
}: {
  poi: Poi | undefined;
  name: string;
  distanceM?: number | undefined;
  keyFacts?: string[] | undefined;
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
  const images = poi?.imageRefs ?? [];
  const extract = poi ? extractOf(poi, lang) : undefined;
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
      node: <HeroCard name={name} interest={interest} image={images[0]} distance={distance} />,
    },
  ];
  if (extract)
    items.push({
      key: 'extract',
      label: t('cards.ahead'),
      node: (
        <PromptCard
          prompt={t('cards.ahead')}
          body={extract.text}
          footer={t('cards.source', { source: 'Wikipedia (CC BY-SA)' })}
          {...(extract.url ? { onFooter: () => void Linking.openURL(extract.url!) } : {})}
        />
      ),
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
  height: CARD_H,
  borderRadius: radii.lg,
  overflow: 'hidden' as const,
  backgroundColor: colors.surface.base,
  borderWidth: 1,
  borderColor: colors.border,
  ...shadow.card,
};

function HeroCard({
  name,
  interest,
  image,
  distance,
}: {
  name: string;
  interest?: Interest | undefined;
  image?: ImageRef | undefined;
  distance?: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <View style={cardStyle}>
      {image ? (
        <Image
          source={{ uri: image.thumbUrl ?? image.url }}
          style={{ flex: 1 }}
          contentFit="cover"
          transition={250}
          accessibilityIgnoresInvertColors
          accessibilityLabel={name}
        />
      ) : (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.brand.redTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons
            name={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
            size={64}
            color={colors.brand.red}
          />
        </View>
      )}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 14,
          gap: 6,
          backgroundColor: 'rgba(17,17,17,0.62)',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {interest ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radii.pill,
                backgroundColor: '#FFFFFF',
              }}
            >
              <MaterialCommunityIcons
                name={INTEREST_ICON[interest]}
                size={13}
                color={colors.brand.redPressed}
              />
              <Text variant="caption" style={{ color: colors.ink.primary, fontSize: 12, lineHeight: 16 }}>
                {t(`interests.${interest}`)}
              </Text>
            </View>
          ) : null}
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
      {image ? <CreditBadge image={image} /> : null}
    </View>
  );
}

function PhotoCard({ image, name }: { image: ImageRef; name: string }) {
  return (
    <View style={cardStyle}>
      <Image
        source={{ uri: image.thumbUrl ?? image.url }}
        style={{ flex: 1 }}
        contentFit="cover"
        transition={250}
        accessibilityIgnoresInvertColors
        accessibilityLabel={name}
      />
      <CreditBadge image={image} />
    </View>
  );
}

/** Commons attribution on top of a photo (author, license, links), required by the CC licenses. */
function CreditBadge({ image }: { image: ImageRef }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        maxWidth: '80%',
        paddingHorizontal: 8,
        borderRadius: radii.sm,
        backgroundColor: 'rgba(255,255,255,0.9)',
      }}
    >
      <ImageCredit image={image} />
    </View>
  );
}

function PromptCard({
  prompt,
  body,
  footer,
  onFooter,
  ai,
}: {
  prompt: string;
  body: string;
  footer?: string;
  onFooter?: () => void;
  ai?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[cardStyle, { padding: 18, gap: 10 }]}>
      <Text variant="label" style={{ color: colors.brand.redPressed }}>
        {prompt}
      </Text>
      <Text variant="body" numberOfLines={7} style={{ flex: 1, fontSize: 17, lineHeight: 25 }}>
        {body}
      </Text>
      {footer ? (
        <Text
          variant="caption"
          {...(onFooter ? { accessibilityRole: 'link' as const, onPress: onFooter } : {})}
          style={onFooter ? { textDecorationLine: 'underline' } : null}
        >
          {footer}
        </Text>
      ) : null}
      {ai ? <Text variant="caption">{t('player.aiGenerated')}</Text> : null}
    </View>
  );
}
