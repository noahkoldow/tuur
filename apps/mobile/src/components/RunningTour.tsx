import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveSession } from '../guide/session';
import { useSettings } from '../state/settings';
import { MiniPlayer } from './MiniPlayer';

/** Running-tour indicator for every tab (tab-bars.md: show persistent state everywhere): the mini player, or nothing. */
export function RunningTour() {
  const { t } = useTranslation();
  const router = useRouter();
  const lang = useSettings((s) => s.language);
  const session = useActiveSession();
  if (!session) return null;
  const title =
    session.tour?.texts[lang]?.title ??
    (session.mode === 'roam'
      ? t('roam.title')
      : session.mode === 'fork'
        ? t('fork.title')
        : t('home.continueTour'));
  return <MiniPlayer session={session} title={title} onOpen={() => router.push('/play')} />;
}
