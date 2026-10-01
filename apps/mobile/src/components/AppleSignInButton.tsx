import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HIT, colors, fonts, radii } from '../theme';
import { PressableScale } from './PressableScale';
import { SpinningMark } from './SpinningMark';
import { Text } from './Text';

/**
 * "Sign in with Apple" as Apple requires it (HIG / App Review 4.8): the system button on iOS, a black button with
 * the Apple logo elsewhere (demo preview). The label comes from the system on iOS.
 */
export function AppleSignInButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  if (Platform.OS === 'ios' && !busy)
    return (
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radii.lg}
        style={{ height: HIT + 4 }}
        onPress={onPress}
      />
    );
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: Boolean(busy) }}
      disabled={busy}
      onPress={onPress}
      style={{
        minHeight: HIT + 4,
        borderRadius: radii.lg,
        backgroundColor: '#000000',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {busy ? (
        <SpinningMark size={22} label={label} color="#FFFFFF" />
      ) : (
        <MaterialCommunityIcons name="apple" size={22} color="#FFFFFF" />
      )}
      <Text style={{ fontFamily: fonts.heading, fontSize: 17, color: colors.surface.base }}>{label}</Text>
    </PressableScale>
  );
}
