import { useRef, useState } from 'react';
import { Linking, TextInput, View, type ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_TRACTION_PRICING as PRICING,
  PARTNER_CATEGORIES,
  PartnerApplicationSchema,
  unitPrices,
} from '@tuur/shared';
import { BackendError, useBackend } from '../src/backend';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { Checkbox } from '../src/components/Checkbox';
import { FloatingAction } from '../src/components/FloatingAction';
import { Icon } from '../src/components/Icon';
import { ChoiceRows, ListGroup, ListRow } from '../src/components/ListGroup';
import { Mascot } from '../src/components/Mascot';
import { ScrollScreen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { TuuSays } from '../src/components/TuuSays';
import { config } from '../src/config';
import { useSettings } from '../src/state/settings';
import { metrics, sys } from '../src/theme';

type Category = (typeof PARTNER_CATEGORIES)[number];

/**
 * Business page (D43): one scroll instead of a wizard. First what a place gets, shown on a mock card (Tuu, the place,
 * the honest "Partner" label, an offer), then the fair pricing, then a short application on the same page.
 * Reached via a low-key row at the end of the settings.
 */
export default function Business() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const lang = useSettings((s) => s.language);
  const [sent, setSent] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const formY = useRef(0);
  const [formInView, setFormInView] = useState(false);
  const [form, setForm] = useState({
    placeName: '',
    category: 'cafe' as Category,
    address: '',
    contactEmail: '',
    website: '',
    pitch: '',
  });
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const money = (minor: number) =>
    new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }).format(minor / 100);
  const cafe = unitPrices(PRICING, 'cafe');

  const candidate = { ...form, website: form.website.trim() || undefined, acceptedTerms: consent };
  const valid = PartnerApplicationSchema.safeParse(candidate).success;

  const submit = async () => {
    const parsed = PartnerApplicationSchema.safeParse(candidate);
    if (!parsed.success) return setError(t('business.failed'));
    setBusy(true);
    setError(undefined);
    try {
      await backend.auth.ensureSignedIn();
      await backend.submitPartnerApplication(parsed.data);
      setSent(true);
    } catch (e) {
      setError(
        e instanceof BackendError && e.code === 'rate_limited' ? t('business.limit') : t('business.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('business.entry'),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: sys.grouped as string },
        }}
      />
      <View style={{ flex: 1, backgroundColor: sys.grouped }}>
        <ScrollScreen
          scrollRef={scroller}
          scrollEventThrottle={64}
          onScroll={(e) => {
            const inView =
              e.nativeEvent.contentOffset.y + e.nativeEvent.layoutMeasurement.height * 0.6 > formY.current;
            setFormInView((cur) => (cur === inView ? cur : inView));
          }}
          contentContainerStyle={{ gap: 24, paddingBottom: insets.bottom + 170 }}
        >
          {sent ? (
            <View style={{ gap: 16, paddingTop: 16 }}>
              <Mascot pose="celebrate" size={140} style={{ alignSelf: 'center' }} />
              <Text variant="title1" accessibilityRole="header" align="center">
                {t('business.sentTitle')}
              </Text>
              <Text variant="body" color={sys.labelSecondary} align="center">
                {t('business.sentBody')}
              </Text>
              <Button
                variant="tinted"
                icon="external-link"
                label={t('business.portal')}
                onPress={() => void Linking.openURL(`${config.legal.webBaseUrl}/partner`)}
              />
            </View>
          ) : (
            <>
              <BusinessArt />
              <View style={{ gap: 8 }}>
                <Text variant="title1" accessibilityRole="header">
                  {t('business.heroTitle')}
                </Text>
                <Text variant="body" color={sys.labelSecondary}>
                  {t('business.heroBody')}
                </Text>
              </View>

              <ListGroup title={t('business.howTitle')}>
                <ListRow icon="map-pin" label={t('business.step1Point1')} />
                <ListRow icon="tag" label={t('business.step1Point2')} />
                <ListRow icon="qrcode" label={t('business.step1Point3')} />
              </ListGroup>

              <ListGroup title={t('business.priceTitle')} footer={t('business.noBase')}>
                <ListRow
                  label={t('business.perVisit')}
                  hint={t('business.perVisitHint')}
                  value={money(cafe.visitMinor)}
                />
                <ListRow label={t('business.perRedemption')} value={money(cafe.redemptionMinor)} />
                <ListRow
                  label={t('business.freeVisits', { count: PRICING.freeVisits })}
                  hint={t('business.freeVisitsHint')}
                  value={money(0)}
                />
                <ListRow
                  label={t('business.cap')}
                  hint={t('business.capHint', { amount: money(PRICING.minMonthlyCapMinor) })}
                />
              </ListGroup>

              <View style={{ gap: 12 }} onLayout={(e) => (formY.current = e.nativeEvent.layout.y)}>
                <Text variant="title2" accessibilityRole="header">
                  {t('business.applyTitle')}
                </Text>
                <TuuSays pose="present" text={t('business.applyHint')} />
                <Field label={t('business.placeName')} value={form.placeName} onChange={set('placeName')} />
                <ListGroup>
                  <ChoiceRows
                    icon="tag"
                    label={t('business.category')}
                    choices={PARTNER_CATEGORIES.map((c) => ({ id: c, label: t(`business.cat_${c}`) }))}
                    selected={[form.category]}
                    onChange={([c]) => c && setForm((f) => ({ ...f, category: c as Category }))}
                    open={categoryOpen}
                    onToggle={() => setCategoryOpen((o) => !o)}
                  />
                </ListGroup>
                <Field
                  label={t('business.address')}
                  value={form.address}
                  onChange={set('address')}
                  autoComplete="street-address"
                />
                <Field
                  label={t('business.email')}
                  value={form.contactEmail}
                  onChange={set('contactEmail')}
                  keyboardType="email-address"
                  autoComplete="email"
                />
                <Field
                  label={t('business.website')}
                  value={form.website}
                  onChange={set('website')}
                  keyboardType="url"
                />
                <Field
                  label={t('business.pitch')}
                  hint={t('business.pitchHint')}
                  value={form.pitch}
                  onChange={set('pitch')}
                  multiline
                />
                <Checkbox checked={consent} onChange={setConsent} label={t('business.consent')} />
                <Button
                  variant="ghost"
                  size="regular"
                  label={t('settings.terms')}
                  onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
                />
                {error ? <Banner tone="warning" text={error} /> : null}
              </View>
            </>
          )}
        </ScrollScreen>

        {sent ? null : (
          <FloatingAction>
            {formInView ? (
              <Button
                label={t('business.submit')}
                icon="send"
                loading={busy}
                disabled={!valid}
                onPress={() => void submit()}
              />
            ) : (
              <Button
                label={t('business.start')}
                icon="arrow-right"
                onPress={() => scroller.current?.scrollTo({ y: formY.current - 16, animated: true })}
              />
            )}
          </FloatingAction>
        )}
      </View>
    </>
  );
}

/** Mock of how a partner place appears in the app: Tuu presenting, the place, the honest label and an offer. */
function BusinessArt() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: 250,
        borderRadius: 32,
        borderCurve: 'continuous',
        backgroundColor: sys.accentTint,
        overflow: 'hidden',
        justifyContent: 'center',
        paddingHorizontal: 16,
      }}
    >
      <View
        style={{
          marginLeft: 70,
          borderRadius: metrics.radius.card,
          borderCurve: 'continuous',
          backgroundColor: sys.elevated,
          padding: 14,
          gap: 10,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: sys.accentTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="silverware-fork-knife" size={22} color={sys.accentText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="headline" numberOfLines={1}>
              {t('business.mockPlace')}
            </Text>
            <Text variant="footnote">{t('business.mockLabel')}</Text>
          </View>
          <Icon name="map-pin" size={20} color={sys.accent} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 10,
            borderRadius: 14,
            backgroundColor: sys.fill,
          }}
        >
          <Icon name="tag" size={18} color={sys.accentText} />
          <Text variant="subheadline" color={sys.label} style={{ flex: 1, fontWeight: '600' }}>
            {t('business.mockOffer')}
          </Text>
          <Icon name="qrcode" size={22} color={sys.labelSecondary} />
        </View>
      </View>
      <View style={{ position: 'absolute', left: -6, bottom: -4 }}>
        <Mascot pose="present" size={132} />
      </View>
    </View>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  multiline,
  keyboardType,
  autoComplete,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'email-address' | 'url';
  autoComplete?: 'email' | 'street-address';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="subheadline" style={{ fontWeight: '600', color: sys.label }}>
        {label}
      </Text>
      {hint ? <Text variant="footnote">{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        multiline={multiline}
        {...(keyboardType ? { keyboardType, autoCapitalize: 'none' as const } : {})}
        {...(autoComplete ? { autoComplete } : {})}
        style={{
          borderRadius: metrics.radius.row + 4,
          borderCurve: 'continuous',
          backgroundColor: sys.elevated,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 17,
          color: sys.label,
          minHeight: multiline ? 112 : 48,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}
