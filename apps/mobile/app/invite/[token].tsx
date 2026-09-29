import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackendError, useBackend } from '../../src/backend';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { SpinningMark } from '../../src/components/SpinningMark';
import { Text } from '../../src/components/Text';

type State = { phase: 'working' } | { phase: 'done'; tourId: string } | { phase: 'error'; own: boolean };

/** Deep link target for https://tuur.app/invite/{token}: redeems the single-use invite and opens the tour. */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const [state, setState] = useState<State>({ phase: 'working' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await backend.auth.ensureSignedIn();
        const r = await backend.redeemInvite(token);
        if (!cancelled) setState({ phase: 'done', tourId: r.tourId });
      } catch (e) {
        const own = e instanceof BackendError && e.reason === 'own_invite';
        if (!cancelled) setState({ phase: 'error', own });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, token]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 20, alignItems: 'stretch' }}>
        <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
          {t('invite.title')}
        </Text>
        {state.phase === 'working' ? (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <SpinningMark size={72} label={t('invite.redeeming')} />
            <Text variant="bodySecondary">{t('invite.redeeming')}</Text>
          </View>
        ) : state.phase === 'done' ? (
          <>
            <Banner icon="check-circle" text={t('invite.success')} />
            <Button
              label={t('invite.openTour')}
              onPress={() => router.replace({ pathname: '/tour/[id]', params: { id: state.tourId } })}
            />
          </>
        ) : (
          <>
            <Banner tone="error" text={state.own ? t('invite.own') : t('invite.invalid')} />
            <Button variant="secondary" label={t('invite.home')} onPress={() => router.replace('/home')} />
          </>
        )}
      </View>
    </Screen>
  );
}
