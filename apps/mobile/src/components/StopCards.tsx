import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ImageRef, Interest, Poi } from '@tuur/shared';
import { formatKm } from '../format';
import { colors, radii, shadow, sys } from '../theme';
import { CategoryBadge } from './category-badge';
import { Icon } from './Icon';
import { INTEREST_ICON } from './icons';
import { PlacePhoto } from './PlacePhoto';
import { PhotoInfo } from './photo-info';
import { foreignTextLanguage, placeInformation, placeSummary } from './placeDetails';
import { Text } from './Text';
import type { AccessInfo } from '../backend/types';
import { usePoiText } from '../hooks/usePoiText';
import { useLocalizedPoi } from '../hooks/useLocalizedPoi';
import { PlaceTextStatus } from './place-text-status';
import { FactSheetView } from './fact-sheet';
import { useFactSheet } from '../hooks/useFactSheet';

const HERO_H = 220;
const GALLERY_W = 168;
const GALLERY_H = 118;
const COLLAPSED_LINES = 6;
type CardImage = Omit<ImageRef, 'file'>;

export const interestOf = (poi: Poi | undefined): Interest | undefined =>
  poi?.primaryInterest ?? poi?.interests[0];

function languageName(code: string, ui: string): string {
  try {
    return new Intl.DisplayNames([ui], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * One structured card about the next stop: hero photo with name, category and distance, the source text with
 * "read more", fact-checked key facts, further photos and the credits. Every image carries its Commons
 * attribution, every text its source.
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
  const textPoi = useLocalizedPoi(textInfo.poi, lang);
  const factSheet = useFactSheet(textPoi, lang, access);
  const pop = useRef(new Animated.Value(0)).current;
  const id = poi?.id ?? name;
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    pop.setValue(0);
    setExpanded(false);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }).start();
  }, [id, pop]);

  const interest = interestOf(poi);
  const images = narrationImages?.length ? narrationImages : (poi?.imageRefs ?? []);
  const extract = textPoi ? placeSummary(textPoi, lang) : undefined;
  const information = textPoi ? placeInformation(textPoi, lang) : undefined;
  const foreign = textPoi ? foreignTextLanguage(textPoi, lang) : undefined;
  const body = information?.text ?? extract?.text;
  const facts = keyFacts?.slice(0, 4) ?? [];
  const gallery = images.slice(1);
  const distance =
    distanceM === undefined
      ? undefined
      : distanceM < 25
        ? t('cards.here')
        : t('cards.away', {
            distance: distanceM >= 1000 ? `${formatKm(distanceM, lang)} km` : `${distanceM} m`,
          });

  return (
    <Animated.View
      style={{
        opacity: pop,
        transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }],
      }}
    >
      <View style={card}>
        <View style={{ height: HERO_H, justifyContent: 'flex-end' }}>
          <PlacePhoto
            image={images[0]}
            name={name}
            icon={interest ? INTEREST_ICON[interest] : 'map-marker-radius'}
            showInfo={false}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View style={{ padding: 16, gap: 6, backgroundColor: 'rgba(17,17,17,0.68)' }}>
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
          <PhotoInfo image={images[0]} name={name} summary={information} textStatus={textInfo} />
        </View>

        <View style={{ padding: 16, gap: 18 }}>
          <Section title={t('cards.about')}>
            {factSheet.sheet ? <FactSheetView sheet={factSheet.sheet} ai={factSheet.ai} /> : null}
            {body && factSheet.sheet ? (
              <>
                <Text
                  variant="label"
                  style={{ color: sys.accentText, minHeight: 44, textAlignVertical: 'center' }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setExpanded((v) => !v)}
                >
                  {expanded ? t('factSheet.hideFullText') : t('factSheet.fullText')}
                </Text>
                {expanded ? <Text variant="body">{body}</Text> : null}
                {foreign ? (
                  <Text variant="caption">
                    {t('cards.originalLanguage', { language: languageName(foreign, lang) })}
                  </Text>
                ) : null}
              </>
            ) : body ? (
              <>
                <Text
                  variant="body"
                  numberOfLines={expanded ? undefined : COLLAPSED_LINES}
                  onTextLayout={(e) => {
                    if (!expanded) setOverflowing(e.nativeEvent.lines.length > COLLAPSED_LINES);
                  }}
                >
                  {body}
                </Text>
                {overflowing || expanded ? (
                  <Text
                    variant="label"
                    style={{ color: sys.accentText }}
                    accessibilityRole="button"
                    onPress={() => setExpanded((v) => !v)}
                  >
                    {expanded ? t('cards.readLess') : t('cards.readMore')}
                  </Text>
                ) : null}
                {foreign ? (
                  <Text variant="caption">
                    {t('cards.originalLanguage', { language: languageName(foreign, lang) })}
                  </Text>
                ) : null}
              </>
            ) : (
              <PlaceTextStatus {...textInfo} />
            )}
            {body && textInfo.error ? <PlaceTextStatus {...textInfo} /> : null}
          </Section>

          {facts.length ? (
            <Section title={t('cards.didYouKnow')}>
              {facts.map((fact, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: 10 }}>
                  <Icon name="info" size={18} color={sys.accentText} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {fact}
                  </Text>
                </View>
              ))}
              <Text variant="caption">{t('player.aiGenerated')}</Text>
            </Section>
          ) : null}

          {gallery.length ? (
            <Section title={t('cards.photos')}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}
                style={{ marginHorizontal: -16 }}
              >
                {gallery.map((img, i) => (
                  <View key={i} style={{ width: GALLERY_W, height: GALLERY_H }}>
                    <PlacePhoto
                      image={img}
                      name={name}
                      showInfo={false}
                      style={{ borderRadius: radii.md, overflow: 'hidden' }}
                    />
                    <PhotoInfo image={img} name={name} />
                  </View>
                ))}
              </ScrollView>
            </Section>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const card = {
  borderRadius: radii.lg,
  overflow: 'hidden' as const,
  borderCurve: 'continuous' as const,
  backgroundColor: colors.surface.base,
  ...shadow.card,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="headline">{title}</Text>
      {children}
    </View>
  );
}
