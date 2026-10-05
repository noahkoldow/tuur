import { localContextKind } from '../poi/localContext';
import { spokenName, type SourceBundle } from './prompt';
import { createTourScript, frameScriptParagraphs, type NarrationContext } from './script';
import type { NarrationOutput } from './types';

const observations: Record<string, [string, string, string]> = {
  de: [
    'Achte auf den Verlauf des Weges. Falls du ein Straßenschild siehst, lies den Namen einmal bewusst; aus dem Namen allein lässt sich seine Herkunft nicht sicher ableiten.',
    'Nimm dir einen Moment, um dich umzusehen. Was fällt dir an den Wegen und dem Alltag um dich herum auf?',
    'Nimm dir einen Moment für dieses kleine Detail. Was fällt dir auf, wenn du es in Ruhe betrachtest?',
  ],
  en: [
    'Notice the course of the path. If you see a street sign, take a moment to read its name; a name alone does not tell us its origin.',
    'Take a moment to look around. What do you notice about the paths and everyday life around you?',
    'Take a moment for this small detail. What catches your eye when you look at it slowly?',
  ],
  fr: [
    'Observe le tracé du chemin. Si tu vois une plaque de rue, prends le temps de lire son nom ; le nom seul ne nous indique pas son origine.',
    'Prends un moment pour regarder autour de toi. Que remarques-tu dans les chemins et la vie quotidienne ?',
    'Prends un moment pour ce petit détail. Que remarques-tu en le regardant tranquillement ?',
  ],
  es: [
    'Observa el trazado del camino. Si ves una placa de calle, lee su nombre con calma; el nombre por sí solo no nos dice su origen.',
    'Mira a tu alrededor un momento. ¿Qué notas en los caminos y la vida cotidiana?',
    'Dedica un momento a este pequeño detalle. ¿Qué descubres al mirarlo con calma?',
  ],
  it: [
    'Osserva il percorso della strada. Se vedi una targa stradale, leggi il nome con calma; dal solo nome non possiamo sapere la sua origine.',
    'Guardati intorno un momento. Che cosa noti nei percorsi e nella vita quotidiana?',
    'Dedica un momento a questo piccolo dettaglio. Che cosa noti osservandolo con calma?',
  ],
  ja: [
    '道の形に目を向けてみてください。通りの標識があれば、その名前を読んでみましょう。名前だけでは由来まではわかりません。',
    '少し周囲を見渡してみましょう。道や日々の暮らしについて、何が目に入りますか。',
    'この小さな特徴を、少しゆっくり見てみましょう。どんなことに気づきますか。',
  ],
  pt: [
    'Repara no traçado do caminho. Se vires uma placa de rua, lê o nome com calma; só o nome não nos diz a sua origem.',
    'Olha à tua volta por um momento. O que notas nos caminhos e na vida quotidiana?',
    'Dedica um momento a este pequeno detalhe. O que notas ao observá-lo com calma?',
  ],
  nl: [
    'Let op het verloop van de weg. Als je een straatnaambord ziet, lees de naam dan rustig; de naam alleen vertelt ons de oorsprong niet.',
    'Kijk even om je heen. Wat valt je op aan de wegen en het dagelijks leven?',
    'Neem even de tijd voor dit kleine detail. Wat valt je op als je rustig kijkt?',
  ],
};

/** Source-poor, real features support observation, never invented history or etymology. */
export function localObservation(
  bundle: SourceBundle,
  lang: string,
  context?: NarrationContext,
): NarrationOutput | undefined {
  const kind = localContextKind(bundle.osmTags);
  if (!kind || !bundle.poiName.trim()) return undefined;
  // Let the regular source-checked model tell the story when substantive sources exist.
  if (
    bundle.wikipedia.some((w) => w.extract.trim()) ||
    bundle.facts.length ||
    bundle.adminFacts.length ||
    bundle.partnerFacts?.length
  )
    return undefined;
  if (['description', 'inscription', 'name:etymology'].some((k) => (bundle.osmTags[k]?.length ?? 0) >= 40))
    return undefined;
  const name = spokenName(bundle.poiName, 200)
    .replace(/[*#_`]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  if (!name) return undefined;
  const lines = observations[lang] ?? observations.en!;
  const text = `${name}. ${lines[kind === 'street' ? 0 : kind === 'neighborhood' ? 1 : 2]}`;
  // This fallback bypasses model fact checking, so its framing must also come from authored,
  // fact-free templates. Never voice arbitrary client/tour opening or closing text as a fact.
  const safeContext = context?.script
    ? { ...context, script: createTourScript({ lang, interests: context.script.interests }) }
    : context;
  const paragraphs = frameScriptParagraphs([text], safeContext, lang);
  return { title: name, narration: paragraphs.join(' '), paragraphs, keyFacts: [], sourcesUsed: ['osm'] };
}
