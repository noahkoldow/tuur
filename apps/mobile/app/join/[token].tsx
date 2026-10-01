import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackendError, useBackend, type GroupInfo } from '../../src/backend';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Mascot } from '../../src/components/Mascot';
import { Screen } from '../../src/components/Screen';
import { SpinningMark } from '../../src/components/SpinningMark';
import { Text } from '../../src/components/Text';
import { startTourSession } from '../../src/guide/session';
import { useSettings } from '../../src/state/settings';

type State =
  | { phase: 'working' }
  | { phase: 'ready'; group: GroupInfo }
  | { phase: 'error'; reason: 'full' | 'ended' | 'own_group' | 'network' | 'invalid' };

/**
 * Deep link target for https://tuur.app/join/{groupId.secret} (D47): joins the host's live group and starts the same
 * tour without paying. Needs a connection; the server checks the membership on every narration.
 */
export default function JoinGroupScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { language, interests, simulator } = useSettings();
  const [state, setState] = useState<State>({ phase: 'working' });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await backend.auth.ensureSignedIn();
        const r = await backend.joinGroup(token);
        if (!cancelled) setState({ phase: 'ready', group: r.group });
      } catch (e) {
        const reason =
          e instanceof BackendError && e.code === 'network'
            ? 'network'
            : e instanceof BackendError &&
                (e.reason === 'full' || e.reason === 'ended' || e.reason === 'own_group')
              ? e.reason
              : 'invalid';
        if (!cancelled) setState({ phase: 'error', reason });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, token]);

  const start = async (group: GroupInfo) => {
    setStarting(true);
    try {
      await startTourSession({
        tour: group.tour,
        lang: language,
        planned: group.mode === 'planned',
        groupId: group.id,
        guest: true,
        simulate: simulator,
        ...(interests[0] ? { interest: interests[0] } : {}),
      });
      router.replace('/play');
    } catch {
      setState({ phase: 'error', reason: 'network' });
    } finally {
      setStarting(false);
    }
  };

  const title = (g: GroupInfo) =>
    g.tour.texts[language]?.title ?? Object.values(g.tour.texts)[0]?.title ?? '';

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 }}>
        {state.phase === 'working' ? (
          <>
            <SpinningMark size={72} label={t('group.joining')} />
            <Text variant="heading" align="center">
              {t('group.joining')}
            </Text>
          </>
        ) : state.phase === 'ready' ? (
          <>
            <Mascot pose="wave" size={140} />
            <Text variant="title" align="center">
              {t('group.welcome')}
            </Text>
            {title(state.group) ? (
              <Text variant="heading" align="center">
                {title(state.group)}
              </Text>
            ) : null}
            <Text variant="bodySecondary" align="center">
              {t('group.welcomeBody', { members: state.group.members, capacity: state.group.capacity })}
            </Text>
          </>
        ) : (
          <>
            <Mascot pose="think" size={120} />
            <Banner
              tone="warning"
              text={
                state.reason === 'full'
                  ? t('group.full')
                  : state.reason === 'ended'
                    ? t('group.joinEnded')
                    : state.reason === 'own_group'
                      ? t('group.ownGroup')
                      : state.reason === 'network'
                        ? t('group.onlineOnly')
                        : t('group.invalid')
              }
            />
          </>
        )}
      </View>
      <View style={{ gap: 10, paddingBottom: 16 }}>
        {state.phase === 'ready' ? (
          <Button
            label={t('group.startTogether')}
            icon="play"
            loading={starting}
            onPress={() => void start(state.group)}
          />
        ) : null}
        {state.phase !== 'working' ? (
          <Button variant="ghost" label={t('common.close')} onPress={() => router.replace('/home')} />
        ) : null}
      </View>
    </Screen>
  );
}
