import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
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
import { Button, Row } from '../src/components/Button';
import { Checkbox } from '../src/components/Checkbox';
import { FloatingAction } from '../src/components/FloatingAction';
import { Chip } from '../src/components/Chip';
import { BackButton } from '../src/components/HeaderButton';
import { ListGroup, ListRow } from '../src/components/ListGroup';
import { Mascot } from '../src/components/Mascot';
import { ScrollScreen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { config } from '../src/config';
import { useSettings } from '../src/state/settings';
import { metrics, sys } from '../src/theme';

type Step = 'intro' | 'pricing' | 'apply' | 'sent';
const STEPS: Step[] = ['intro', 'pricing', 'apply'];
type Category = (typeof PARTNER_CATEGORIES)[number];

/**
 * Business onboarding (owner feedback 2026-09-30, D43): three short steps - what partners get, how the
 * pay-per-traction pricing works, the application. Reached only via a low-key row at the end of the settings.
 */
export default function Business() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const lang = useSettings((s) => s.language);
  const [step, setStep] = useState<Step>('intro');
  const [form, setForm] = useState({
    placeName: '',
    category: 'cafe' as Category,
    address: '',
    contactEmail: '',
    website: '',
    pitch: '',
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const money = (minor: number) =>
    new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }).format(minor / 100);
  const cafe = unitPrices(PRICING, 'cafe');
  const idx = STEPS.indexOf(step);

  const candidate = {
    ...form,
    website: form.website.trim() || undefined,
    acceptedTerms: consent,
  };
  const valid = PartnerApplicationSchema.safeParse(candidate).success;

  const submit = async () => {
    const parsed = PartnerApplicationSchema.safeParse(candidate);
    if (!parsed.success) return setError(t('business.failed'));
    setBusy(true);
    setError(undefined);
    try {
      await backend.auth.ensureSignedIn();
      await backend.submitPartnerApplication(parsed.data);
      setStep('sent');
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
          title: step === 'sent' ? '' : t('business.entry'),
          headerBackVisible: false,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: sys.grouped as string },
          headerLeft: () => (
            <BackButton
              label={t('common.back')}
              onPress={() => (idx > 0 && step !== 'sent' ? setStep(STEPS[idx - 1]!) : router.back())}
            />
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: sys.grouped }}>
        <ScrollScreen contentContainerStyle={{ gap: 20, paddingBottom: insets.bottom + 120 }}>
          {step === 'intro' ? (
            <>
              <Mascot pose="present" size={112} style={{ alignSelf: 'center' }} />
              <Text variant="title1" accessibilityRole="header">
                {t('business.step1Title')}
              </Text>
              <ListGroup>
                <ListRow icon="map-pin" label={t('business.step1Point1')} />
                <ListRow icon="tag" label={t('business.step1Point2')} />
                <ListRow icon="qrcode" label={t('business.step1Point3')} />
              </ListGroup>
            </>
          ) : null}

          {step === 'pricing' ? (
            <>
              <Text variant="title1" accessibilityRole="header">
                {t('business.step2Title')}
              </Text>
              <ListGroup footer={t('business.noBase')}>
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
                  value={money(PRICING.minMonthlyCapMinor)}
                />
              </ListGroup>
            </>
          ) : null}

          {step === 'apply' ? (
            <>
              <Text variant="title1" accessibilityRole="header">
                {t('business.step3Title')}
              </Text>
              <Field label={t('business.placeName')} value={form.placeName} onChange={set('placeName')} />
              <View style={{ gap: 8 }}>
                <Text variant="subheadline" style={{ fontWeight: '600', color: sys.label }}>
                  {t('business.category')}
                </Text>
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  {PARTNER_CATEGORIES.map((c) => (
                    <Chip
                      key={c}
                      label={t(`business.cat_${c}`)}
                      selected={form.category === c}
                      onPress={() => setForm((f) => ({ ...f, category: c }))}
                    />
                  ))}
                </Row>
              </View>
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
            </>
          ) : null}

          {step === 'sent' ? (
            <View style={{ gap: 16, paddingTop: 24 }}>
              <Mascot pose="celebrate" size={120} />
              <Text variant="title1" accessibilityRole="header">
                {t('business.sentTitle')}
              </Text>
              <Text variant="body" color={sys.labelSecondary}>
                {t('business.sentBody')}
              </Text>
            </View>
          ) : null}
        </ScrollScreen>

        <FloatingAction>
          {step === 'intro' || step === 'pricing' ? (
            <Button
              label={t('common.continue')}
              icon="arrow-right"
              onPress={() => setStep(step === 'intro' ? 'pricing' : 'apply')}
            />
          ) : step === 'apply' ? (
            <Button
              label={t('business.submit')}
              icon="send"
              loading={busy}
              disabled={!valid}
              onPress={() => void submit()}
            />
          ) : (
            <>
              <Button
                variant="secondary"
                icon="external-link"
                label={t('business.portal')}
                onPress={() => void Linking.openURL(`${config.legal.webBaseUrl}/partner`)}
              />
              <Button label={t('common.done')} onPress={() => router.back()} />
            </>
          )}
        </FloatingAction>
      </View>
    </>
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
