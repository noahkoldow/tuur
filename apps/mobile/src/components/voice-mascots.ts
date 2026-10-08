import type { ImageSourcePropType } from 'react-native';
import type { PreviewVoice } from '../audio/voice-previews';

/** Scene order: hello, exploring with a map, listening. `lina` is Linus's persisted voice ID. */
export const voiceMascots = {
  mara: [
    require('../../assets/mascot/voices/mara/01-hello.png'),
    require('../../assets/mascot/voices/mara/02-map.png'),
    require('../../assets/mascot/voices/mara/03-listen.png'),
  ],
  jonas: [
    require('../../assets/mascot/voices/jonas/01-hello.png'),
    require('../../assets/mascot/voices/jonas/02-map.png'),
    require('../../assets/mascot/voices/jonas/03-listen.png'),
  ],
  lina: [
    require('../../assets/mascot/voices/linus/01-hello.png'),
    require('../../assets/mascot/voices/linus/02-map.png'),
    require('../../assets/mascot/voices/linus/03-listen.png'),
  ],
} satisfies Record<PreviewVoice, [ImageSourcePropType, ImageSourcePropType, ImageSourcePropType]>;
