import { Platform, useColorScheme } from 'react-native';

/** The warm /voices web preview palette, also resolved for the native dark appearance. */
export function useVoicePromoPalette(neutral = false) {
  const scheme = useColorScheme();
  const dark = Platform.OS === 'ios' && scheme === 'dark';
  return {
    background: neutral ? (dark ? '#111113' : '#FFFFFF') : dark ? '#211E1A' : '#FBF7F0',
    ink: neutral ? (dark ? '#F5F5F7' : '#202024') : dark ? '#FAF3E8' : '#26221F',
    muted: neutral ? (dark ? '#B5B5BC' : '#63636C') : dark ? '#CABDAF' : '#766D65',
    subtle: neutral ? (dark ? '#A4A4AD' : '#6B6B75') : dark ? '#BCAB97' : '#89634F',
    accent: '#ED0516',
    accentText: dark ? '#FF9A9E' : '#B70A18',
    surface: neutral ? (dark ? '#242428' : '#F5F5F7') : dark ? '#302A24' : '#FFFDFA',
    border: neutral ? (dark ? '#3A3A41' : '#E5E5EA') : dark ? '#514437' : '#EAE3DB',
    selected: dark ? '#49262A' : '#FFF1EF',
    disabled: neutral ? (dark ? '#A4A4AD' : '#6B6B75') : dark ? '#9C8E80' : '#9E9286',
    track: neutral ? (dark ? '#3A3A41' : '#E5E5EA') : dark ? '#514437' : '#E7DDD1',
    halo: neutral ? (dark ? '#3D252B' : '#FFE5E8') : dark ? '#57402C' : '#F5E2CC',
    haloSoft: neutral ? (dark ? '#211A20' : '#FFF5F6') : dark ? '#362B21' : '#F9EDDB',
    park: dark ? '#3B4931' : '#DCE8D1',
    parkSoft: dark ? '#2B3223' : '#EAF0DF',
    route: dark ? '#C59B70' : '#D6AA78',
    ground: dark ? '#080705' : '#DAC5AF',
  };
}
