import { SpinningMark } from '@/components/SpinningMark';

export default function Home() {
  return (
    <main className="hero">
      <SpinningMark size={88} label="tuur erkundet diese Gegend…" />
      <img src="/brand/tuur-wordmark-red.svg" alt="tuur" width={220} />
      <p>Dein KI-Audio-Stadtguide. Partnerportal und Admin folgen.</p>
    </main>
  );
}
