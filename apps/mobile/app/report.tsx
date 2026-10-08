import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useBackend } from '../src/backend';
import type { ContentReportInput } from '../src/backend/types';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { ChoiceRows } from '../src/components/ListGroup';
import { ScrollScreen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { config } from '../src/config';
import { useContentReports } from '../src/state/content-reports';
import { metrics, sys } from '../src/theme';

export default function Report() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ offerId?: string }>();
  const offerId =
    typeof params.offerId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(params.offerId)
      ? params.offerId
      : undefined;
  const backend = useBackend();
  const requestId = useRef(randomUUID());
  const sending = useRef(false);
  const [text, setText] = useState('');
  const [reason, setReason] = useState<ContentReportInput['reason']>('offensive');
  const [reasonOpen, setReasonOpen] = useState(true);
  const [reportUid] = useState(backend.auth.current()?.uid);
  const [block, setBlock] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'sent'>('idle');
  const [contactFailed, setContactFailed] = useState(false);
  const send = async () => {
    if (sending.current || state === 'sent' || text.trim().length < 5) return;
    sending.current = true;
    setState('busy');
    try {
      if (!reportUid || backend.auth.current()?.uid !== reportUid) throw new Error('Account changed');
      await backend.reportContent({
        requestId: requestId.current,
        kind: offerId ? 'offer' : 'ad',
        ...(offerId ? { offerId } : {}),
        reason,
        text: text.trim(),
        blockPartner: Boolean(offerId && block),
      });
      useContentReports.getState().refresh();
      setState('sent');
      setText('');
    } catch {
      setState('error');
    } finally {
      sending.current = false;
    }
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={96}
    >
      <Stack.Screen options={{ headerShown: true, title: t(offerId ? 'safety.offer' : 'safety.ad') }} />
      <ScrollScreen keyboardShouldPersistTaps="handled">
        {state === 'sent' ? (
          <>
            <Banner tone="info" text={t(config.backend === 'demo' ? 'safety.demo' : 'safety.sent')} />
            <Button label={t('safety.done')} onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Text>{t('safety.hint')}</Text>
            <Text variant="headline">{t('safety.reason')}</Text>
            <ChoiceRows
              label={t('safety.reason')}
              choices={['offensive', 'age_inappropriate', 'misleading', 'other'].map((id) => ({
                id,
                label: t(`safety.${id}`),
              }))}
              selected={[reason]}
              onChange={(values) => {
                setReason(values[0] as ContentReportInput['reason']);
                setReasonOpen(false);
              }}
              open={reasonOpen}
              onToggle={() => setReasonOpen(!reasonOpen)}
            />
            <Text variant="headline">{t('safety.details')}</Text>
            <TextInput
              accessibilityLabel={t('safety.details')}
              value={text}
              onChangeText={setText}
              placeholder={t('safety.placeholder')}
              placeholderTextColor={sys.labelTertiary}
              editable={state !== 'busy'}
              maxLength={1000}
              multiline
              textAlignVertical="top"
              style={{
                minHeight: 130,
                padding: 12,
                borderRadius: metrics.radius.card,
                color: sys.label,
                backgroundColor: sys.elevated,
                fontSize: 16,
              }}
            />
            {offerId ? (
              <Button
                variant="secondary"
                label={`${block ? '✓ ' : ''}${t('safety.block')}`}
                disabled={state === 'busy'}
                onPress={() => setBlock(!block)}
              />
            ) : null}
            <Text variant="caption">{t('safety.privacy')}</Text>
            {config.backend === 'demo' ? <Banner tone="info" text={t('safety.demo')} /> : null}
            {state === 'error' ? <Banner tone="warning" text={t('safety.error')} /> : null}
            <Button
              label={t('safety.send')}
              disabled={state === 'busy' || text.trim().length < 5}
              onPress={() => void send()}
            />
          </>
        )}
        <View style={{ marginTop: 16 }}>
          <Text selectable variant="caption">
            {config.legal.supportEmail}
          </Text>
          {contactFailed ? <Banner tone="warning" text={t('business.contactFailed')} /> : null}
          <Button
            variant="secondary"
            label={t('safety.support')}
            onPress={() =>
              void Linking.openURL(
                `mailto:${config.legal.supportEmail}?subject=${encodeURIComponent(t('safety.title'))}`,
              ).catch(() => setContactFailed(true))
            }
          />
        </View>
      </ScrollScreen>
    </KeyboardAvoidingView>
  );
}
