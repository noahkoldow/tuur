import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Share, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GROUP_MAX_SIZE } from '@tuur/shared';
import { BackendError, useBackend, type GroupInfo } from '../backend';
import { getBilling, useEntitlementStore } from '../billing/entitlements';
import { GroupSeatCheckout, type SeatCheckoutResult } from '../billing/groupSeatCheckout';
import type { Offer } from '../billing/types';
import { useAuth } from '../auth/session';
import { inviteToGroup, type ActiveSession } from '../guide/session';
import { metrics, sys } from '../theme';
import { Icon } from './Icon';
import { Banner } from './Banner';
import { Button } from './Button';
import { Text } from './Text';
import { Checkbox } from './Checkbox';

/** The link of the open group (kept per app run; the secret is never stored server-side). */
let lastUrl: string | undefined;

/**
 * Live group tour controls in the player (D47). Host: invite friends by link (free up to the group size), see who
 * joined, buy one more seat when full. Guest: see the group status; access ends with the group.
 */
export function GroupBar({ session, offline = false }: { session: ActiveSession; offline?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const backend = useBackend();
  const { user } = useAuth();
  const uid = user?.uid;
  const seatBalance = useEntitlementStore((s) => s.wallet.seatBalance ?? 0);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [busy, setBusy] = useState<'invite' | 'seat' | undefined>();
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | undefined>();
  const [seatOffer, setSeatOffer] = useState<Offer>();
  const [priceStatus, setPriceStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [priceAttempt, setPriceAttempt] = useState(0);
  const [consent, setConsent] = useState(false);
  const [seatPending, setSeatPending] = useState(false);
  const canHost =
    !session.guest && Boolean(session.tour) && (session.mode === 'tour' || session.mode === 'planned');
  const full = group ? group.members >= group.capacity : false;
  const canAddSeat = canHost && group?.status === 'live' && full && group.capacity < GROUP_MAX_SIZE;
  const demo = backend.kind === 'demo';
  const checkout = useMemo(
    () =>
      uid
        ? new GroupSeatCheckout({
            uid,
            storage: AsyncStorage,
            newId: randomUUID,
            isCurrentAccount: () => backend.auth.current()?.uid === uid,
            availableCredits: () => useEntitlementStore.getState().wallet.seatBalance ?? 0,
            redeem: (groupId, requestId) => backend.addGroupSeat(groupId, requestId),
            recordConsent: () =>
              demo ? Promise.resolve() : backend.recordPurchaseConsent('tuur_group_seat'),
            purchase: () => getBilling().purchase('tuur_group_seat'),
          })
        : undefined,
    [backend, demo, uid],
  );

  const showSeatResult = useCallback(
    (result: SeatCheckoutResult) => {
      if (backend.auth.current()?.uid !== uid) return;
      setSeatPending(checkout?.pending ?? false);
      if (result === 'delivered') {
        setConsent(false);
        setMessage({ tone: 'info', text: t('group.seatAdded') });
      } else if (result === 'waiting') {
        setConsent(false);
        setMessage({ tone: 'info', text: t('group.seatPending') });
      } else if (result === 'unavailable') {
        setMessage({ tone: 'warning', text: t('group.seatRetained') });
      } else if (result === 'consent') {
        setMessage({ tone: 'warning', text: t('paywall.consentNeeded') });
      }
    },
    [backend, checkout, t, uid],
  );

  const recoverSeat = useCallback(async () => {
    if (!checkout || offline || !canHost) return;
    try {
      showSeatResult(await checkout.recover());
    } catch {
      if (backend.auth.current()?.uid !== uid) return;
      setSeatPending(checkout.pending);
      setMessage({ tone: 'warning', text: t(checkout.pending ? 'group.seatRetryHint' : 'group.failed') });
    }
  }, [backend, canHost, checkout, offline, showSeatResult, t, uid]);

  // Reconcile persisted purchases on mount, after the webhook changes the wallet and on foregrounding.
  useEffect(() => {
    void recoverSeat();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recoverSeat();
    });
    return () => listener.remove();
  }, [recoverSeat, seatBalance]);
  useEffect(() => {
    if (!seatPending || offline) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void recoverSeat();
    }, 15_000);
    return () => clearInterval(timer);
  }, [offline, recoverSeat, seatPending]);

  useEffect(() => {
    if (!canAddSeat || offline) return;
    let active = true;
    setPriceStatus('loading');
    void getBilling()
      .offers()
      .then((offers) => {
        if (!active) return;
        const offer = offers.find((o) => o.id === 'tuur_group_seat');
        setSeatOffer(offer);
        setPriceStatus(offer ? 'ready' : 'error');
      })
      .catch(() => {
        if (active) setPriceStatus('error');
      });
    return () => {
      active = false;
    };
  }, [canAddSeat, offline, priceAttempt]);

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
    if (!session.groupId || !checkout) return;
    setBusy('seat');
    setMessage(undefined);
    try {
      showSeatResult(await checkout.start(session.groupId, (demo || consent) && Boolean(seatOffer)));
    } catch {
      setSeatPending(checkout.pending);
      setMessage({ tone: 'warning', text: t(checkout.pending ? 'group.seatRetryHint' : 'group.failed') });
    } finally {
      setBusy(undefined);
    }
  };

  if (!canHost && !session.guest) return null;
  if (offline && canHost) return <Text variant="caption">{t('group.offlineHint')}</Text>;
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
            borderRadius: metrics.radius.card,
            borderCurve: 'continuous',
            backgroundColor: sys.elevated,
          }}
        >
          <Icon name="users" size={22} color={sys.labelSecondary} />
          <View style={{ flex: 1 }}>
            <Text variant="headline">{group.status === 'live' ? t('group.live') : t('group.ended')}</Text>
            <Text variant="footnote">
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
                  backgroundColor: i < group.members ? sys.accent : sys.fill,
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
          disabled={full || Boolean(busy)}
          onPress={() => void invite()}
        />
      ) : null}
      {seatPending ? (
        <Button
          variant="secondary"
          label={t('group.checkPurchase')}
          disabled={Boolean(busy)}
          onPress={() => void recoverSeat()}
        />
      ) : canAddSeat ? (
        <View style={{ gap: 8 }}>
          <Text variant="footnote">{t('group.seatTerms')}</Text>
          {seatBalance > 0 ? (
            <Text variant="footnote">{t('group.seatBalance', { count: seatBalance })}</Text>
          ) : null}
          {!demo && seatBalance === 0 && seatOffer ? (
            <Checkbox checked={consent} onChange={setConsent} label={t('paywall.withdrawal')} />
          ) : null}
          <Button
            variant="secondary"
            icon="plus-circle"
            label={
              seatBalance > 0
                ? t('group.useSeatCredit')
                : seatOffer
                  ? t('group.buySeatPrice', { price: seatOffer.priceString })
                  : t(priceStatus === 'error' ? 'paywall.offersUnavailable' : 'common.loading')
            }
            loading={busy === 'seat'}
            disabled={Boolean(busy) || !checkout || (seatBalance === 0 && priceStatus !== 'ready')}
            onPress={() => void buySeat()}
          />
          {priceStatus === 'error' && seatBalance === 0 ? (
            <>
              <Text variant="footnote">{t('paywall.offersUnavailable')}</Text>
              <Button
                variant="ghost"
                label={t('common.retry')}
                onPress={() => setPriceAttempt((n) => n + 1)}
              />
            </>
          ) : null}
          <Button
            variant="ghost"
            size="regular"
            label={t('paywall.terms')}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
          />
        </View>
      ) : null}
      {canHost && !group ? <Text variant="caption">{t('group.inviteHint')}</Text> : null}
      {message ? <Banner tone={message.tone} text={message.text} /> : null}
    </View>
  );
}
