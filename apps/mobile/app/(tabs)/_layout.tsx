import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { BRAND_RED } from '../../src/theme';

/**
 * Top-level navigation is the system tab bar (tab-bars.md): three sections with single-word labels and filled SF
 * Symbols. On iOS 26 it is the floating Liquid Glass bar. Brand red appears only on the selected tab.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <NativeTabs tintColor={BRAND_RED}>
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Icon sf={{ default: 'safari', selected: 'safari.fill' }} md="explore" />
        <NativeTabs.Trigger.Label>{t('tabs.explore')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="downloads">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'arrow.down.circle', selected: 'arrow.down.circle.fill' }}
          md="download"
        />
        <NativeTabs.Trigger.Label>{t('tabs.offline')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="person"
        />
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
