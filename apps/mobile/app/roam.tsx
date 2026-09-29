import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../src/components/Banner';
import { Button, IconButton, Row } from '../src/components/Button';
import { Chip } from '../src/components/Chip';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { startRoamSession } from '../src/guide/session';
import { usePosition } from '../src/location/usePosition';
import { requestBackground } from '../src/location/real';
import { useBackend } from '../src/backend';
import { useSessionGate } from '../src/billing/useSessionGate';
import { useSettings, type NarrationFrequency } from '../src/state/settings';

/** Roam (spec 5.4): no route, just walk; tuur tells about what lies ahead. Frequency is adjustable. */
export default function Roam() {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { language, interests, frequency, simulator, set } = useSettings();
  const { position } = usePosition();
  const gate = useSessionGate('roam', position);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!position || !gate.require()) return;
    setBusy(true);
    try {
      if (!simulator && backend.kind === 'firebase') await requestBackground();
      await startRoamSession({
        lang: language,
        start: position,
        frequency,
        interests,
        simulate: simulator,
        ...(interests[0] ? { interest: interests[0] } : {}),
      });
      router.replace('/play');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
        <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} size={44} />
        <Text variant="title" accessibilityRole="header">
          {t('roam.title')}
        </Text>
        <View style={{ width: 44 }} />
      </Row>
      <View style={{ flex: 1, gap: 18, paddingVertical: 16 }}>
        <Text variant="body">{t('roam.intro')}</Text>
        <Text variant="heading">{t('roam.frequency')}</Text>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {(['low', 'normal', 'high'] as NarrationFrequency[]).map((f) => (
            <Chip
              key={f}
              label={t(`settings.frequency${f[0]!.toUpperCase()}${f.slice(1)}`)}
              selected={frequency === f}
              onPress={() => set({ frequency: f })}
            />
          ))}
        </Row>
        <Banner text={t('roam.hint')} icon="compass" />
      </View>
      <View style={{ paddingBottom: 16 }}>
        <Button
          label={t('roam.startRoam')}
          icon="compass"
          loading={busy}
          disabled={!position}
          onPress={() => void start()}
        />
      </View>
    </Screen>
  );
}
