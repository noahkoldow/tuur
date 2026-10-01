#!/usr/bin/env node
// Unit economics for tuur (see docs/UNIT_ECONOMICS.md). Plain Node, no dependencies:  node scripts/unit-economics.mjs
// All inputs are listed in A (assumptions) and P (prices). Prices verified 2026-09-30 unless marked otherwise.

const A = {
  usdPerEur: 1.15, // ECB reference ~1.154 (15.09.2026)
  charsPerAudioMin: 1000, // German: 150 words/min (prompt.ts, tts.ts) x ~6.7 chars incl. spaces
  charsPerToken: 4, // Gemini text tokens, German prose [Annahme]
  // One narration generation (functions/src/narration/service.ts): Flash generation + Flash-Lite fact check.
  genInputTokens: 5000, // system prompt + up to 3 Wikipedia extracts a 5000 chars (narrationSources.ts) + Wikidata/OSM
  genJsonOverheadTokens: 250, // title, keyFacts, sourcesUsed
  genThinkingTokens: 1000, // thinking not configured -> default thinking, billed as output [Annahme]
  textDuplication: 2, // schema returns `narration` AND `paragraphs[]` -> text is output twice
  fcInputTokens: 5200,
  fcOutputTokens: 600, // verdicts + thinking
  attempts: 1.2, // up to 2 attempts; assume 20 % need the retry
  // Transition (Flash-Lite, 1-2 sentences, own TTS) and crossroads teaser (Flash-Lite, text only)
  transition: { inTok: 150, outTok: 250, audioMin: 0.25 },
  teaser: { inTok: 1500, outTok: 250 },
  // Infrastructure per tour hour
  mp3Kbps: 48,
  mapTileRequestsPerHour: 150, // MapLibre with on-device tile cache [Annahme]
  firestoreReadsPerHour: 600, // POI tile queries, narration docs, entitlements [Annahme]
  functionsUsdPerHour: 0.001, // invocations + CPU for ~20 calls [Annahme]
};

const P = {
  // Gemini API (ai.google.dev/gemini-api/docs/pricing), USD per 1M tokens. Intro prices until 31.12.2026.
  flash: { in: 0.75, out: 3.75 }, // gemini-3.8-flash
  flash2027: { in: 1.5, out: 7.5 },
  lite: { in: 0.3, out: 2.5 }, // gemini-3.5-flash-lite
  // TTS in USD per audio minute
  tts: {
    'OpenAI gpt-4o-mini-tts': 0.015, // OpenAI estimate ~1.5 ct/min ($0.60 in / $12 out per 1M tokens)
    'Gemini 3.8 Flash TTS': (25 * 60 * 9) / 1e6 + (400 * 0.5) / 1e6, // 25 audio tok/s, $9/1M out, ~400 in-tokens/min
    'Gemini 3.8 Flash-Lite TTS': (25 * 60 * 6) / 1e6 + (400 * 0.5) / 1e6,
    'ElevenLabs v3': (0.08 * A.charsPerAudioMin) / 1000, // $0.08 per 1k chars
  },
  tts2027: {
    'OpenAI gpt-4o-mini-tts': 0.015,
    'Gemini 3.8 Flash TTS': (25 * 60 * 18) / 1e6 + (400 * 1) / 1e6,
    'Gemini 3.8 Flash-Lite TTS': (25 * 60 * 12) / 1e6 + (400 * 1) / 1e6,
    'ElevenLabs v3': 0.08,
  },
  storageEgressPerGb: 0.12, // Firebase Cloud Storage download
  firestorePer100kReads: 0.06, // [unverifiziert] region dependent
  mapTilerPer1kRequests: 0.15, // MapTiler Flex overage ($30/month incl. 500k requests)
  routingPerHour: 0, // openrouteservice Standard plan free (quota 500 matrix + 2000 directions/day)
};

// Tour-hour profiles derived from the code (see doc section 2).
const MODES = {
  'Route (geplant/Standardtour)': { narr: 5, audioMinPerNarr: 3, transitions: 4, teasers: 0 },
  Weggabelung: { narr: 5, audioMinPerNarr: 3, transitions: 4, teasers: 10 },
  'Streifzug wenig': { narr: 8, audioMinPerNarr: 2, transitions: 0, teasers: 0 },
  'Streifzug normal': { narr: 15, audioMinPerNarr: 1.5, transitions: 0, teasers: 0 },
  'Streifzug viel': { narr: 25, audioMinPerNarr: 1.2, transitions: 0, teasers: 0 },
};

const tok = (n, price) => (n / 1e6) * price;

/** LLM cost of one narration of `audioMin` minutes (incl. fact check and retries). */
function narrationTextUsd(audioMin, flash = P.flash) {
  const textTokens = (audioMin * A.charsPerAudioMin) / A.charsPerToken;
  const out = textTokens * A.textDuplication + A.genJsonOverheadTokens + A.genThinkingTokens;
  const gen = tok(A.genInputTokens, flash.in) + tok(out, flash.out);
  const fc = tok(A.fcInputTokens, P.lite.in) + tok(A.fcOutputTokens, P.lite.out);
  return (gen + fc) * A.attempts;
}

/** Cost of one tour hour. hit = cache hit rate (0..1) for text AND audio. */
export function hourCost(mode, voice, hit, { y2027 = false } = {}) {
  const m = MODES[mode];
  const flash = y2027 ? P.flash2027 : P.flash;
  const ttsMin = (y2027 ? P.tts2027 : P.tts)[voice];
  const audioMin = m.narr * m.audioMinPerNarr + m.transitions * A.transition.audioMin;
  const miss = 1 - hit;
  const llm =
    miss *
    (m.narr * narrationTextUsd(m.audioMinPerNarr, flash) +
      m.transitions * (tok(A.transition.inTok, P.lite.in) + tok(A.transition.outTok, P.lite.out)) +
      m.teasers * (tok(A.teaser.inTok, P.lite.in) + tok(A.teaser.outTok, P.lite.out)));
  const tts = miss * audioMin * ttsMin;
  const egress = ((audioMin * 60 * A.mp3Kbps * 1000) / 8 / 1e9) * P.storageEgressPerGb;
  const infra =
    egress +
    (A.firestoreReadsPerHour / 1e5) * P.firestorePer100kReads +
    A.functionsUsdPerHour +
    (A.mapTileRequestsPerHour / 1000) * P.mapTilerPer1kRequests +
    P.routingPerHour;
  return { audioMin, narrations: m.narr, llm, tts, infra, total: llm + tts + infra };
}

/** Voice switch: audio re-render only (text is shared across voices). */
export const voiceSwitchUsd = (audioMin, voice) => audioMin * P.tts[voice];

// Revenue per purchase in EUR (prices incl. 19 % VAT; Apple/Google commission on the net price).
export function netRevenue(grossEur, storeFee = 0.15, rcFee = 0.01) {
  const net = grossEur / 1.19;
  return net * (1 - storeFee) - grossEur * rcFee;
}

const f = (x, d = 3) => x.toFixed(d);
const eur = (usd) => usd / A.usdPerEur;

function main() {
  const voices = Object.keys(P.tts);
  console.log('TTS USD per audio minute (2026 / from 2027):');
  for (const v of voices) console.log(`  ${v.padEnd(28)} ${f(P.tts[v], 4)} / ${f(P.tts2027[v], 4)}`);
  for (const min of [0.5, 1.5, 3])
    console.log(
      `LLM per narration ${min} min: ${f(narrationTextUsd(min), 4)} USD (2027: ${f(narrationTextUsd(min, P.flash2027), 4)})`,
    );

  console.log('\nCost per tour hour in USD (cold 0 % / warm 70 % / popular 95 %), OpenAI voice:');
  for (const mode of Object.keys(MODES)) {
    const c = [0, 0.7, 0.95].map((h) => hourCost(mode, 'OpenAI gpt-4o-mini-tts', h));
    console.log(
      `  ${mode.padEnd(30)} audio ${f(c[0].audioMin, 1)} min | cold ${f(c[0].total)} (LLM ${f(c[0].llm)}, TTS ${f(c[0].tts)}, infra ${f(c[0].infra)}) | warm ${f(c[1].total)} | popular ${f(c[2].total)}`,
    );
  }
  console.log('\nCold tour hour by voice (Route / Streifzug normal), USD 2026 | 2027:');
  for (const v of voices) {
    const r = hourCost('Route (geplant/Standardtour)', v, 0).total;
    const s = hourCost('Streifzug normal', v, 0).total;
    const r7 = hourCost('Route (geplant/Standardtour)', v, 0, { y2027: true }).total;
    const s7 = hourCost('Streifzug normal', v, 0, { y2027: true }).total;
    console.log(`  ${v.padEnd(28)} ${f(r)} / ${f(s)} | ${f(r7)} / ${f(s7)}`);
  }
  console.log('\nVoice switch (audio only), USD per tour hour Route / Streifzug normal:');
  for (const v of voices)
    console.log(
      `  ${v.padEnd(28)} ${f(voiceSwitchUsd(hourCost('Route (geplant/Standardtour)', v, 0).audioMin, v))} / ${f(voiceSwitchUsd(hourCost('Streifzug normal', v, 0).audioMin, v))}`,
    );

  const credit = netRevenue(1.99);
  const sub = netRevenue(4.99);
  console.log(
    `\nNet revenue EUR: credit 1.99 -> ${f(credit, 2)} (30 % store: ${f(netRevenue(1.99, 0.3), 2)})`,
  );
  console.log(
    `  sub 4.99 -> ${f(sub, 2)} (30 %: ${f(netRevenue(4.99, 0.3), 2)}); 5.99 -> ${f(netRevenue(5.99), 2)}; yearly 39.99 -> ${f(netRevenue(39.99), 2)}`,
  );

  // Blended hour: 50 % route, 50 % roam normal.
  const blend = (voice, hit, o) =>
    0.5 * hourCost('Route (geplant/Standardtour)', voice, hit, o).total +
    0.5 * hourCost('Streifzug normal', voice, hit, o).total;
  console.log('\nSubscriber margin EUR/month at 4.99 (mix 50 % route / 50 % roam normal, OpenAI):');
  for (const [name, h] of [
    ['light', 2],
    ['median', 5],
    ['heavy', 15],
    ['extreme', 40],
  ]) {
    const row = [0, 0.7, 0.95].map((hit) => sub - eur(blend('OpenAI gpt-4o-mini-tts', hit) * h));
    console.log(
      `  ${name.padEnd(8)} ${String(h).padStart(2)} h: cold ${f(row[0], 2)} | warm ${f(row[1], 2)} | popular ${f(row[2], 2)}`,
    );
  }
  console.log('Break-even hours per month (sub 4.99 / credit 1.99):');
  for (const [label, voice, hit, mode] of [
    ['Route cold OpenAI', 'OpenAI gpt-4o-mini-tts', 0, 'Route (geplant/Standardtour)'],
    ['Roam normal cold OpenAI', 'OpenAI gpt-4o-mini-tts', 0, 'Streifzug normal'],
    ['Roam viel cold OpenAI', 'OpenAI gpt-4o-mini-tts', 0, 'Streifzug viel'],
    ['Roam normal cold Flash-Lite TTS', 'Gemini 3.8 Flash-Lite TTS', 0, 'Streifzug normal'],
    ['Roam normal warm OpenAI', 'OpenAI gpt-4o-mini-tts', 0.7, 'Streifzug normal'],
    ['Roam normal cold ElevenLabs', 'ElevenLabs v3', 0, 'Streifzug normal'],
  ]) {
    const c = eur(hourCost(mode, voice, hit).total);
    console.log(`  ${label.padEnd(34)} ${f(sub / c, 1)} h / ${f(credit / c, 1)} h`);
  }

  // Free tier: ads per free tour hour.
  const ecpm = { rewardedLow: 5, rewardedHigh: 15, interLow: 3, interHigh: 10 };
  const adLow = (1 * ecpm.rewardedLow + 2 * ecpm.interLow) / 1000;
  const adHigh = (1 * ecpm.rewardedHigh + 2 * ecpm.interHigh) / 1000;
  const r = (h) => hourCost('Route (geplant/Standardtour)', 'OpenAI gpt-4o-mini-tts', h).total;
  console.log(
    `\nFree tour hour: ad revenue ${f(adLow)}-${f(adHigh)} USD vs cost cold ${f(r(0))} / warm ${f(r(0.7))} / popular ${f(r(0.95))}`,
  );
  console.log(
    `Partner: 0.3 visits/h x 0.40 EUR + 0.03 redemptions x 0.80 EUR = ${f(0.3 * 0.4 + 0.03 * 0.8, 3)} EUR per tour hour`,
  );

  // Daily budget cap (USD 3, AI only = LLM + TTS).
  console.log('\nUSD 3/day cap -> cold tour hours per day (AI cost only):');
  for (const v of voices)
    for (const mode of ['Route (geplant/Standardtour)', 'Streifzug normal']) {
      const c = hourCost(mode, v, 0);
      console.log(`  ${v.padEnd(28)} ${mode.padEnd(30)} ${f(3 / (c.llm + c.tts), 1)} h`);
    }
  const dl =
    5 * (narrationTextUsd(0.5) + narrationTextUsd(1.5) + narrationTextUsd(3)) +
    5 * 5 * P.tts['OpenAI gpt-4o-mini-tts'];
  console.log(`Offline download of a cold 5-stop tour (all 3 tiers): ${f(dl)} USD`);

  // Sensitivities on the median subscriber (5 h/month, mix, 50 % cache, OpenAI).
  const base = () => sub - eur(blend('OpenAI gpt-4o-mini-tts', 0.5) * 5);
  console.log(`\nSensitivity (median subscriber 5 h, cache 50 %, OpenAI): base margin ${f(base(), 2)} EUR`);
  const save = { ...P.tts };
  P.tts['OpenAI gpt-4o-mini-tts'] *= 2;
  console.log(`  TTS price x2: ${f(base(), 2)}`);
  P.tts['OpenAI gpt-4o-mini-tts'] = save['OpenAI gpt-4o-mini-tts'];
  console.log(`  cache 20 %: ${f(sub - eur(blend('OpenAI gpt-4o-mini-tts', 0.2) * 5), 2)}`);
  console.log(`  cache 0 %: ${f(sub - eur(blend('OpenAI gpt-4o-mini-tts', 0) * 5), 2)}`);
  console.log(
    `  2027 Gemini text prices: ${f(sub - eur(blend('OpenAI gpt-4o-mini-tts', 0.5, { y2027: true }) * 5), 2)}`,
  );
  console.log(`  15 h instead of 5 h: ${f(sub - eur(blend('OpenAI gpt-4o-mini-tts', 0.5) * 15), 2)}`);
  console.log(
    `  store fee 30 %: ${f(netRevenue(4.99, 0.3) - eur(blend('OpenAI gpt-4o-mini-tts', 0.5) * 5), 2)}`,
  );
  console.log(`  price 5.99: ${f(netRevenue(5.99) - eur(blend('OpenAI gpt-4o-mini-tts', 0.5) * 5), 2)}`);
  console.log(`  voice Flash-Lite TTS: ${f(sub - eur(blend('Gemini 3.8 Flash-Lite TTS', 0.5) * 5), 2)}`);
  console.log(`  voice ElevenLabs v3: ${f(sub - eur(blend('ElevenLabs v3', 0.5) * 5), 2)}`);
  const thk = A.genThinkingTokens;
  A.genThinkingTokens = 3000;
  console.log(`  thinking 3000 tokens: ${f(base(), 2)}`);
  A.genThinkingTokens = thk;
  console.log(`  EUR/USD 1.00: ${f(sub - blend('OpenAI gpt-4o-mini-tts', 0.5) * 5, 2)}`);
}

main();
