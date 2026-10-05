import { Image as NativeImage, View, type ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Polyline } from 'react-native-svg';
import type { LatLng } from '@tuur/shared';
import { palette } from '@tuur/ui';
import { Text } from '../components/Text';
import type { TourRecord } from '../state/history';
import { metrics } from '../theme';
import wordmark from '../../assets/wordmark-red.png';
import type { ActivityPhoto } from './activity-photos';

export interface ActivityShareCardProps {
  record: TourRecord;
  line: LatLng[];
  title: string;
  date: string;
  facts: { label: string; value: string }[];
  photos: ActivityPhoto[];
  onPhotoLoad: (id: string) => void;
  onPhotoError: (id: string) => void;
}

/** The visible preview is also the exported image; photo controls stay outside this view. */
export function ActivityShareCard({
  record,
  line,
  title,
  date,
  facts,
  photos,
  onPhotoLoad,
  onPhotoError,
}: ActivityShareCardProps) {
  const { t } = useTranslation();
  const collage = photos.slice(0, 4);
  const photo = (item: ActivityPhoto, index: number) => (
    <Image
      key={item.id}
      source={{ uri: item.uri }}
      accessibilityLabel={t('summary.photoLabel', { number: index + 1 })}
      accessible
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: palette.light.fill,
        ...photoFrame(index, collage.length),
      }}
      contentFit="cover"
      cachePolicy="memory"
      transition={0}
      onDisplay={() => onPhotoLoad(item.id)}
      onError={() => onPhotoError(item.id)}
    />
  );

  return (
    <View
      style={{
        minHeight: 360,
        borderRadius: metrics.radius.card,
        borderCurve: 'continuous',
        padding: 20,
        backgroundColor: palette.light.background,
        gap: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <NativeImage
          source={wordmark}
          style={{ width: 70, height: 26 }}
          resizeMode="contain"
          accessibilityLabel="tuur"
        />
        <Text
          variant="footnote"
          color={palette.light.labelSecondary}
          style={{ flexBasis: 150, flexGrow: 1, flexShrink: 1 }}
        >
          {date}
        </Text>
      </View>

      {collage.length ? (
        <View
          style={{
            width: '100%',
            aspectRatio: 1.15,
            minHeight: 180,
            overflow: 'hidden',
            borderRadius: metrics.radius.row,
            borderCurve: 'continuous',
          }}
        >
          {collage.map(photo)}
        </View>
      ) : null}

      <View style={{ height: collage.length ? 104 : 220 }}>
        <WalkDrawing record={record} line={line} />
      </View>

      <Text variant="title1" color={palette.light.label}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {facts.map((fact) => (
          <View
            key={fact.label}
            accessible
            accessibilityLabel={`${fact.label}: ${fact.value}`}
            style={{ flexBasis: '42%', flexGrow: 1, minWidth: 104, gap: 2 }}
          >
            <Text variant="headline" color={palette.light.label} style={{ fontVariant: ['tabular-nums'] }}>
              {fact.value}
            </Text>
            <Text variant="caption" color={palette.light.labelSecondary}>
              {fact.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Keep every keyed image mounted as the collage changes, preserving its displayed/readiness state. */
function photoFrame(index: number, count: number): ImageStyle {
  if (count === 1) return {};
  if (count === 2) {
    return index === 0 ? { right: '50%', marginRight: 2 } : { left: '50%', marginLeft: 2 };
  }
  if (count === 3) {
    if (index === 0) return { right: '50%', marginRight: 2 };
    return {
      left: '50%',
      marginLeft: 2,
      ...(index === 1 ? { bottom: '50%', marginBottom: 2 } : { top: '50%', marginTop: 2 }),
    };
  }
  return {
    ...(index % 2 === 0 ? { right: '50%', marginRight: 2 } : { left: '50%', marginLeft: 2 }),
    ...(index < 2 ? { bottom: '50%', marginBottom: 2 } : { top: '50%', marginTop: 2 }),
  };
}

function WalkDrawing({ record, line }: { record: TourRecord; line: LatLng[] }) {
  const pts = [...line, ...record.stops.map((stop) => stop.location)];
  if (!pts.length) return null;
  const lats = pts.map((point) => point.lat);
  const lngs = pts.map((point) => point.lng);
  const [south, north, west, east] = [
    Math.min(...lats),
    Math.max(...lats),
    Math.min(...lngs),
    Math.max(...lngs),
  ];
  // Preserve the walk's shape: a degree of longitude becomes shorter toward the poles.
  const kx = Math.cos(((south + north) / 2) * (Math.PI / 180));
  const spanX = (east - west) * kx;
  const spanY = north - south;
  const scale = 88 / Math.max(spanX, spanY, 1e-6);
  const ox = (100 - spanX * scale) / 2;
  const oy = (100 - spanY * scale) / 2;
  const project = (point: LatLng) =>
    `${ox + (point.lng - west) * kx * scale},${oy + (north - point.lat) * scale}`;

  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" accessible={false}>
      {line.length > 1 ? (
        <Polyline
          points={line.map(project).join(' ')}
          fill="none"
          stroke={palette.light.accent}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {record.stops.map((stop) => {
        const [x, y] = project(stop.location).split(',').map(Number);
        return (
          <Circle
            key={stop.id}
            cx={x}
            cy={y}
            r={2.2}
            fill={palette.light.background}
            stroke={palette.light.accent}
            strokeWidth={1.4}
          />
        );
      })}
    </Svg>
  );
}
