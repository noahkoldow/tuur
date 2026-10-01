import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { sys } from '../../../src/theme';

/** Each tab owns a stack so the tab bar stays visible while people drill in (tab-bars.md). */
export default function DownloadsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerTransparent: true,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerTintColor: sys.accentText as string,
        contentStyle: { backgroundColor: sys.grouped },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('downloads.title') }} />
    </Stack>
  );
}
