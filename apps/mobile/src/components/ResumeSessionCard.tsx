import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { clearSavedSession, resumeSavedSession, useSavedSession } from '../guide/session';
import { Button } from './Button';
import { Banner } from './Banner';
import { Text } from './Text';
import { sys, radii } from '../theme';

/** Recovery is a deliberate action; reopening the app never starts location tracking or speech by itself. */
export function ResumeSessionCard({ onResumed }: { onResumed: () => void }) {
  const checkpoint = useSavedSession();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!checkpoint) return null;
  const resume = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await resumeSavedSession();
      onResumed();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ padding: 16, gap: 10, borderRadius: radii.md, backgroundColor: sys.fill }}>
      <Text variant="headline" accessibilityRole="header">
        {t('recovery.title')}
      </Text>
      <Text variant="subheadline">{t('recovery.body')}</Text>
      {checkpoint.route[checkpoint.progress.index] ? (
        <Text variant="footnote">{checkpoint.route[checkpoint.progress.index]!.name}</Text>
      ) : null}
      {failed ? <Banner tone="error" text={t('recovery.failed')} /> : null}
      <Button label={t('recovery.resume')} icon="play" loading={busy} onPress={() => void resume()} />
      <Button
        label={t('recovery.discard')}
        variant="ghost"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void clearSavedSession()
            .catch(() => setFailed(true))
            .finally(() => setBusy(false));
        }}
      />
    </View>
  );
}
