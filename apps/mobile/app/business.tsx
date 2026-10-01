import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { Button, IconButton, Row } from '../src/components/Button';
import { Checkbox } from '../src/components/Checkbox';
import { Chip } from '../src/components/Chip';
import { Mascot } from '../src/components/Mascot';
import { Text } from '../src/components/Text';
import { config } from '../src/config';
import { useSettings } from '../src/state/settings';
import { colors, radii } from '../src/theme';

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.surface.base, paddingTop: insets.top }}
    >
      <Row style={{ justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 16 }}>
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => (idx > 0 && step !== 'sent' ? setStep(STEPS[idx - 1]!) : router.back())}
          size={44}
        />
        {step !== 'sent' ? (
          <Row gap={6}>
            {STEPS.map((s, i) => (
              <View
                key={s}
                style={{
                  width: i === idx ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i <= idx ? colors.brand.red : colors.border,
                }}
              />
            ))}
          </Row>
        ) : null}
        <View style={{ width: 44 }} />
      </Row>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'intro' ? (
          <>
            <Mascot pose="present" size={112} />
            <Text variant="label" style={{ color: colors.brand.redPressed }}>
              {t('business.entry')}
            </Text>
            <Text variant="display" accessibilityRole="header">
              {t('business.step1Title')}
            </Text>
            <Point icon="map-marker-star-outline" text={t('business.step1Point1')} />
            <Point icon="tag-outline" text={t('business.step1Point2')} />
            <Point icon="qrcode" text={t('business.step1Point3')} />
          </>
        ) : null}

        {step === 'pricing' ? (
          <>
            <Text variant="display" accessibilityRole="header">
              {t('business.step2Title')}
            </Text>
            <PriceCard
              amount={money(cafe.visitMinor)}
              label={t('business.perVisit')}
              hint={t('business.perVisitHint')}
            />
            <PriceCard amount={money(cafe.redemptionMinor)} label={t('business.perRedemption')} />
            <PriceCard
              amount="0 €"
              label={t('business.freeVisits', { count: PRICING.freeVisits })}
              hint={t('business.freeVisitsHint')}
            />
            <PriceCard
              amount={money(PRICING.minMonthlyCapMinor)}
              label={t('business.cap')}
              hint={t('business.capHint', { amount: money(PRICING.minMonthlyCapMinor) })}
            />
            <Text variant="caption">{t('business.noBase')}</Text>
          </>
        ) : null}

        {step === 'apply' ? (
          <>
            <Text variant="display" accessibilityRole="header">
              {t('business.step3Title')}
            </Text>
            <Field label={t('business.placeName')} value={form.placeName} onChange={set('placeName')} />
            <View style={{ gap: 8 }}>
              <Text variant="label">{t('business.category')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PARTNER_CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    label={t(`business.cat_${c}`)}
                    selected={form.category === c}
                    onPress={() => setForm((f) => ({ ...f, category: c }))}
                  />
                ))}
              </View>
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
              label={t('settings.terms')}
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
            />
            {error ? <Banner tone="warning" text={error} /> : null}
          </>
        ) : null}

        {step === 'sent' ? (
          <View style={{ gap: 16, paddingTop: 24 }}>
            <Mascot pose="celebrate" size={120} />
            <Text variant="display" accessibilityRole="header">
              {t('business.sentTitle')}
            </Text>
            <Text variant="bodySecondary">{t('business.sentBody')}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 16, gap: 8 }}>
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
      </View>
    </KeyboardAvoidingView>
  );
}

function Point({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  text: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.brand.redTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={icon} size={22} color={colors.brand.redPressed} />
      </View>
      <Text variant="body" style={{ flex: 1, paddingTop: 8 }}>
        {text}
      </Text>
    </View>
  );
}

function PriceCard({ amount, label, hint }: { amount: string; label: string; hint?: string }) {
  return (
    <View style={{ padding: 16, borderRadius: radii.lg, backgroundColor: colors.surface.subtle, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text variant="title">{amount}</Text>
        <Text variant="label">{label}</Text>
      </View>
      {hint ? <Text variant="caption">{hint}</Text> : null}
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
      <Text variant="label">{label}</Text>
      {hint ? <Text variant="caption">{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        multiline={multiline}
        {...(keyboardType ? { keyboardType, autoCapitalize: 'none' as const } : {})}
        {...(autoComplete ? { autoComplete } : {})}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.sm,
          padding: 12,
          fontSize: 16,
          color: colors.ink.primary,
          minHeight: multiline ? 100 : 48,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}
