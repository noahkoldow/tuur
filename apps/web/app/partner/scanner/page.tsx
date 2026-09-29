'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { callFn, type CallError } from '@/lib/firebase';
import { useT, type TKey } from '@/lib/i18n';
import { usePartner } from '@/lib/partnerData';
import { extractToken } from '@/lib/scan';
import { Button, Card, Field, Input, Loading, Notice } from '@/components/ui';

type Result = { tone: 'success' | 'error'; text: string };
type Detector = { detect(v: CanvasImageSource): Promise<{ rawValue: string }[]> };

/**
 * Partner scanner (PWA friendly): camera + BarcodeDetector (jsQR fallback), or manual entry. A scan is only a lookup:
 * the server verifies signature, expiry, single use and limits and returns the result for both sides.
 */
export default function ScannerPage() {
  const { t } = useT();
  const partner = usePartner();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const busy = useRef(false);
  const [on, setOn] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<Result | undefined>();
  const [cameraError, setCameraError] = useState(false);

  const redeem = useCallback(
    async (raw: string) => {
      const token = extractToken(raw);
      if (!token) return setResult({ tone: 'error', text: t('scanner.reason.invalid') });
      try {
        const r = await callFn<{ token: string }, { offerTitle: string }>('redeemToken', { token });
        setResult({ tone: 'success', text: t('scanner.ok', { offer: r.offerTitle }) });
        navigator.vibrate?.(120);
      } catch (e) {
        const reason = (e as CallError).reason ?? 'invalid';
        const key = `scanner.reason.${reason}` as TKey;
        setResult({ tone: 'error', text: t(key) === key ? t('common.error') : t(key) });
        navigator.vibrate?.([60, 60, 60]);
      }
    },
    [t],
  );

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    setOn(false);
  }, []);
  useEffect(() => stop, [stop]);

  const start = async () => {
    setCameraError(false);
    setResult(undefined);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.current = s;
      setOn(true);
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      });
    } catch {
      setCameraError(true);
    }
  };

  useEffect(() => {
    if (!on) return;
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
      .BarcodeDetector;
    const detector = BD ? new BD({ formats: ['qr_code'] }) : undefined;
    const canvas = document.createElement('canvas');
    let raf = 0;
    let last = 0;
    const tick = async (ts: number) => {
      raf = requestAnimationFrame((n) => void tick(n));
      const v = video.current;
      if (!v || v.readyState < 2 || busy.current || ts - last < 200) return;
      last = ts;
      let text: string | undefined;
      if (detector) text = (await detector.detect(v).catch(() => []))[0]?.rawValue;
      else {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        text = jsQR(img.data, img.width, img.height)?.data;
      }
      if (!text || !extractToken(text)) return;
      busy.current = true;
      await redeem(text);
      setTimeout(() => (busy.current = false), 2500); // do not scan the same code twice in a row
    };
    raf = requestAnimationFrame((n) => void tick(n));
    return () => cancelAnimationFrame(raf);
  }, [on, redeem]);

  if (partner === undefined) return <Loading label={t('common.loading')} />;

  return (
    <div className="stack">
      <h1>{t('scanner.title')}</h1>
      <p className="muted">{t('scanner.hint')}</p>
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      {cameraError ? <Notice tone="warning">{t('scanner.noCamera')}</Notice> : null}
      <Card>
        {on ? (
          <div className="stack">
            <video ref={video} className="video" playsInline muted aria-label={t('scanner.title')} />
            <Button variant="secondary" onClick={stop}>
              {t('scanner.stop')}
            </Button>
          </div>
        ) : (
          <Button onClick={() => void start()}>{t('scanner.start')}</Button>
        )}
      </Card>
      <Card title={t('scanner.manual')}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void redeem(manual);
          }}
        >
          <Field label={t('scanner.manual')}>
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <div>
            <Button type="submit" disabled={manual.length < 20}>
              {t('scanner.submit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
