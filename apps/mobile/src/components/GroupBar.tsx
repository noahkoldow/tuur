import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { GROUP_MAX_SIZE } from '@tuur/shared';
import { BackendError, useBackend, type GroupInfo } from '../backend';
import { getBilling } from '../billing/entitlements';
import { inviteToGroup, type ActiveSession } from '../guide/session';
import { colors, radii } from '../theme';
import { Banner } from './Banner';
import { Button } from './Button';
import { Text } from './Text';

/** The link of the open group (kept per app run; the secret is never stored server-side). */
let lastUrl: string | undefined;

/**
 * Live group tour controls in the player (D47). Host: invite friends by link (free up to the group size), see who
 * joined, buy one more seat when full. Guest: see the group status; access ends with the group.
 */
export function GroupBar({ session }: { session: ActiveSession }) {
  const { t } = useTranslation();
  const backend = useBackend();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [busy, setBusy] = useState<'invite' | 'seat' | undefined>();
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | undefined>();
  const canHost =
    !session.guest && Boolean(session.tour) && (session.mode === 'tour' || session.mode === 'planned');

  useEffect(() => {
    if (!session.groupId) return setGroup(null);
    return backend.watchGroup(session.groupId, setGroup);
  }, [backend, session.groupId]);

  const invite = async () => {
    setBusy('invite');
    setMessage(undefined);
    try {
      const { url } =
        session.groupId && group?.status === 'live' ? { url: lastUrl ?? '' } : await inviteToGroup();
      if (url) lastUrl = url;
      await Share.share({ message: t('group.shareMessage', { url: lastUrl }) });
    } catch (e) {
      setMessage({
        tone: 'warning',
        text: e instanceof BackendError && e.code === 'network' ? t('errors.network') : t('group.failed'),
      });
    } finally {
      setBusy(undefined);
    }
  };

  const buySeat = async () => {
    if (!session.groupId) return;
    setBusy('seat');
    setMessage(undefined);
    try {
      const r = await getBilling().purchase('tuur_group_seat');
      if (r !== 'purchased') return;
      // the store webhook credits the seat asynchronously: retry for a few seconds
      for (let i = 0; i < 8; i++) {
        try {
          await backend.addGroupSeat(session.groupId);
          return setMessage({ tone: 'info', text: t('group.seatAdded') });
        } catch (e) {
          if (!(e instanceof BackendError) || e.reason !== 'no_seat_credit') throw e;
          await new Promise((res) => setTimeout(res, 1500));
        }
      }
      setMessage({ tone: 'info', text: t('group.seatPending') });
    } catch {
      setMessage({ tone: 'warning', text: t('group.failed') });
    } finally {
      setBusy(undefined);
    }
  };

  if (!canHost && !session.guest) return null;
  const full = group ? group.members >= group.capacity : false;
  return (
    <View style={{ gap: 10 }}>
      {group ? (
        <View
          accessible
          accessibilityLabel={t('group.status', { members: group.members, capacity: group.capacity })}
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: radii.md,
            backgroundColor: colors.surface.subtle,
          }}
        >
          <MaterialCommunityIcons name="account-group" size={22} color={colors.brand.redPressed} />
          <View style={{ flex: 1 }}>
            <Text variant="label">{group.status === 'live' ? t('group.live') : t('group.ended')}</Text>
            <Text variant="caption">
              {t('group.status', { members: group.members, capacity: group.capacity })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: group.capacity }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: i < group.members ? colors.brand.red : colors.border,
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      {session.guest && group?.status !== 'live' && group ? (
        <Banner tone="warning" text={t('group.guestEnded')} />
      ) : null}
      {canHost && (!group || group.status === 'live') ? (
        <Button
          variant="secondary"
          icon="user-plus"
          label={group ? t('group.inviteMore') : t('group.invite')}
          accessibilityHint={t('group.inviteHint')}
          loading={busy === 'invite'}
          disabled={full}
          onPress={() => void invite()}
        />
      ) : null}
      {canHost && group?.status === 'live' && full && group.capacity < GROUP_MAX_SIZE ? (
        <Button
          variant="ghost"
          icon="plus-circle"
          label={t('group.buySeat')}
          loading={busy === 'seat'}
          onPress={() => void buySeat()}
        />
      ) : null}
      {canHost && !group ? <Text variant="caption">{t('group.inviteHint')}</Text> : null}
      {message ? <Banner tone={message.tone} text={message.text} /> : null}
    </View>
  );
}
