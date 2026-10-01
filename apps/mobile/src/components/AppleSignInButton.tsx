import { Platform, useColorScheme } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { HIT } from '../theme';
import { Icon } from './Icon';
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
  const dark = useColorScheme() === 'dark';
  if (Platform.OS === 'ios' && !busy)
    return (
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          dark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={25}
        style={{ height: 50 }}
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
        minHeight: Math.max(HIT, 50),
        borderRadius: 25,
        backgroundColor: dark ? '#FFFFFF' : '#000000',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {busy ? (
        <SpinningMark size={22} label={label} color={dark ? '#000000' : '#FFFFFF'} />
      ) : (
        <Icon name="apple" size={22} color={dark ? '#000000' : '#FFFFFF'} />
      )}
      <Text variant="headline" color={dark ? '#000000' : '#FFFFFF'}>
        {label}
      </Text>
    </PressableScale>
  );
}
