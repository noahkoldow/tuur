import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useReduceMotion } from '../motion';
import { sys } from '../theme';
import { Icon } from './Icon';
import { PhotoInfo, type PhotoTextSource } from './photo-info';
import type { PhotoAttribution } from './image-attribution';

/** One cached image surface for places and tour covers, including loading / offline fallbacks. */
export function PlacePhoto({
  image,
  name,
  icon = 'map-marker-radius',
  style,
  showInfo = true,
  summary,
}: {
  image?: ({ url: string; thumbUrl?: string | undefined } & PhotoAttribution) | undefined;
  name: string;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  /** Parent cards place this control beside their pressable surface for screen-reader access. */
  showInfo?: boolean;
  summary?: PhotoTextSource | undefined;
}) {
  const reduceMotion = useReduceMotion();
  const uri = image?.thumbUrl ?? image?.url;
  const [failedUri, setFailedUri] = useState<string>();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: sys.accentTint,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Icon name={icon} size={40} color={sys.accentText} />
      {uri && uri !== failedUri ? (
        <Image
          source={{ uri }}
          recyclingKey={uri}
          style={{ position: 'absolute', inset: 0 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={reduceMotion ? 0 : 180}
          accessibilityIgnoresInvertColors
          accessibilityLabel={name}
          onError={() => setFailedUri(uri)}
        />
      ) : null}
      {showInfo ? <PhotoInfo image={image} name={name} summary={summary} /> : null}
    </View>
  );
}
