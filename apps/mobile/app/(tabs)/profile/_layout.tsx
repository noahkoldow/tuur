import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { sys } from '../../../src/theme';

/** Profile tab: large-title root, Settings pushed on the same stack with the standard back button. */
export default function ProfileLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: sys.accentText as string,
        contentStyle: { backgroundColor: sys.grouped },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('profile.title'), headerLargeTitle: true, headerLargeTitleShadowVisible: false }}
      />
      <Stack.Screen
        name="settings"
        options={{ title: t('settings.title'), headerLargeTitle: true, headerLargeTitleShadowVisible: false }}
      />
    </Stack>
  );
}
