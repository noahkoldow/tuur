import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '@tuur/ui';
import { SpinningMark } from '@/components/SpinningMark';

export default function Home() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
      <SpinningMark size={96} label={t('loading.exploring')} />
      <Text style={{ fontFamily: fonts.heading, fontSize: 28, color: colors.brand.red }}>tuur</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 16, color: colors.ink.secondary }}>
        {t('loading.exploring')}
      </Text>
    </View>
  );
}
