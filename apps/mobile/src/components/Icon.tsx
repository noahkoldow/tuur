import { Platform, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

/**
 * Icon names are the Feather / Material Community names the screens already use. On iOS each one resolves to its SF
 * Symbol (icons.md, sf-symbols.md: symbols align with the system font and scale with Dynamic Type); other platforms
 * render the vector glyph of the same name.
 */
const SF: Record<string, string> = {
  // navigation and chrome
  home: 'house',
  'arrow-left': 'chevron.left',
  'arrow-right': 'arrow.right',
  'chevron-down': 'chevron.down',
  'chevron-up': 'chevron.up',
  'chevron-right': 'chevron.right',
  x: 'xmark',
  'more-horizontal': 'ellipsis',
  coffee: 'cup.and.saucer',
  check: 'checkmark',
  plus: 'plus',
  'check-circle': 'checkmark.circle.fill',
  'plus-circle': 'plus.circle.fill',
  settings: 'gearshape',
  sliders: 'slider.horizontal.3',
  info: 'info.circle',
  'external-link': 'arrow.up.right.square',
  'log-in': 'rectangle.portrait.and.arrow.right',
  // actions
  share: 'square.and.arrow.up',
  'share-2': 'square.and.arrow.up',
  'trash-2': 'trash',
  download: 'arrow.down.circle',
  send: 'paperplane.fill',
  flag: 'flag.fill',
  'edit-3': 'square.and.pencil',
  lock: 'lock.fill',
  unlock: 'lock.open.fill',
  // media
  play: 'play.fill',
  pause: 'pause.fill',
  stop: 'stop.fill',
  'play-circle': 'play.circle.fill',
  'skip-forward': 'forward.end.fill',
  'skip-back': 'backward.end.fill',
  headphones: 'headphones',
  'volume-x': 'speaker.slash.fill',
  mic: 'mic.fill',
  // places and routes
  compass: 'safari',
  navigation: 'location.fill',
  'navigation-variant': 'location.north.fill',
  truck: 'box.truck.fill',
  'map-pin': 'mappin.and.ellipse',
  map: 'map',
  'git-branch': 'arrow.triangle.branch',
  'map-marker-radius': 'mappin.and.ellipse',
  'map-marker-distance': 'ruler',
  'map-marker-check-outline': 'mappin.circle',
  'map-marker-star-outline': 'star.circle',
  // people and settings content
  user: 'person.crop.circle',
  users: 'person.2.fill',
  'user-plus': 'person.badge.plus',
  award: 'rosette',
  heart: 'heart.fill',
  globe: 'globe',
  type: 'textformat.size',
  tag: 'tag',
  'tag-outline': 'tag',
  smartphone: 'iphone',
  phone: 'phone.fill',
  shield: 'hand.raised.fill',
  qrcode: 'qrcode',
  'file-text': 'doc.text',
  'book-open': 'book',
  'message-circle': 'bubble.left',
  'rotate-ccw': 'arrow.counterclockwise',
  activity: 'waveform.path.ecg',
  cpu: 'cpu',
  // notices
  'alert-triangle': 'exclamationmark.triangle.fill',
  'alert-circle': 'exclamationmark.circle.fill',
  'alert-octagon': 'exclamationmark.octagon.fill',
  // interests
  castle: 'building.columns',
  bank: 'building.2',
  'silverware-fork-knife': 'fork.knife',
  palette: 'paintpalette',
  tree: 'leaf.fill',
  'diamond-stone': 'sparkles',
  circle: 'circle',
  apple: 'apple.logo',
  'glass-cocktail': 'wineglass',
  shopping: 'bag',
  // travel modes
  'human-handsdown': 'figure.stand',
  walk: 'figure.walk',
  bike: 'bicycle',
  car: 'car.fill',
  timer: 'timer',
  'timer-outline': 'timer',
  speedometer: 'speedometer',
  fire: 'flame.fill',
};

export interface IconProps {
  name: string;
  size?: number;
  color?: ColorValue;
  /** Symbol weight on iOS; matches the weight of adjacent text. */
  weight?: SymbolViewProps['weight'];
  style?: StyleProp<ViewStyle>;
}

function vector(name: string, size: number, color: ColorValue | undefined) {
  const tint = (color ?? '#000') as string;
  return name in Feather.glyphMap ? (
    <Feather name={name as keyof typeof Feather.glyphMap} size={size} color={tint} />
  ) : (
    <MaterialCommunityIcons
      name={name as keyof typeof MaterialCommunityIcons.glyphMap}
      size={size}
      color={tint}
    />
  );
}

/** Decorative by default: the control or row that holds it carries the accessibility label. */
export function Icon({ name, size = 22, color, weight = 'medium', style }: IconProps) {
  const sf = SF[name];
  if (Platform.OS !== 'ios' || !sf) return vector(name, size, color);
  return (
    <SymbolView
      name={sf as SymbolViewProps['name']}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
      accessible={false}
    />
  );
}
