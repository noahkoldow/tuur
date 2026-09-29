import { GoogleGenAI, Type } from '@google/genai';
import {
  spokenName,
  TourConceptSchema,
  type TourConcept,
  type TourConceptInput,
  NarrationOutputSchema,
  splitParagraphs,
  paragraphCount,
  type FactVerdict,
  type Interest,
  type LengthTier,
  type NarrationOutput,
  type SourceBundle,
  type Usage,
} from '@tuur/shared';
import { INTERESTS } from '@tuur/shared';

export interface GroundingInfo {
  queries: number;
  /** HTML snippet Google requires to be displayed next to grounded content (Search Suggestions). */
  searchEntryPointHtml?: string;
  sources: { uri: string; title?: string }[];
}

export interface NarrationRequest {
  model: string;
  system: string;
  user: string;
  grounding: boolean;
  /** Structured inputs, used by the mock provider; real providers rely on the prompts. */
  bundle: SourceBundle;
  lang: string;
  tier: LengthTier;
}
export interface NarrationResult {
  output: NarrationOutput;
  usage: Usage;
  grounding?: GroundingInfo;
}

export interface LlmProvider {
  classifyInterests(
    items: { key: string; name: string; tags: Record<string, string>; instanceOf: string[] }[],
    model: string,
  ): Promise<{ interests: Record<string, Interest[]>; usage: Usage }>;
  generateNarration(req: NarrationRequest): Promise<NarrationResult>;
  checkFacts(req: {
    model: string;
    facts: string[];
    sources: string;
  }): Promise<{ verdicts: FactVerdict[]; usage: Usage }>;
  transition(req: {
    model: string;
    lang: string;
    from: string;
    to: string;
    walkMinutes: number;
    tourTitle?: string;
  }): Promise<{ text: string; usage: Usage }>;
  /** Narrative thread for a tour (title, teaser, intro, hand-overs, outro) from route + names (spec 4.3). */
  generateTourConcept(req: {
    model: string;
    system: string;
    user: string;
    input: TourConceptInput;
  }): Promise<{ output: TourConcept; usage: Usage }>;
}

const NARRATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    narration: { type: Type.STRING },
    paragraphs: { type: Type.ARRAY, items: { type: Type.STRING } },
    keyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
    sourcesUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['title', 'narration', 'paragraphs', 'keyFacts', 'sourcesUsed'],
};

const parseJson = (text: string | undefined): unknown => {
  if (!text) throw new Error('empty model response');
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '');
  return JSON.parse(cleaned);
};

/** Normalizes model output: paragraphs must be consistent with the narration and the requested count. */
export function normalizeNarration(raw: unknown, tier: LengthTier): NarrationOutput {
  const out = NarrationOutputSchema.parse(raw);
  let paragraphs = out.paragraphs.map((p) => p.trim()).filter(Boolean);
  const wanted = paragraphCount(tier);
  if (paragraphs.length === 0 || (wanted > 1 && paragraphs.length === 1))
    paragraphs = splitParagraphs(out.narration, wanted);
  return { ...out, narration: paragraphs.join(' '), paragraphs };
}

/** Gemini via @google/genai (server side only; key from Firebase secret). */
export class GeminiLlmProvider implements LlmProvider {
  private readonly ai: GoogleGenAI;
  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private usage(
    res: {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
      };
    },
    lite: boolean,
  ): Usage {
    const i = res.usageMetadata?.promptTokenCount ?? 0;
    const o = (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);
    return lite ? { liteInputTokens: i, liteOutputTokens: o } : { inputTokens: i, outputTokens: o };
  }

  async generateNarration(req: NarrationRequest): Promise<NarrationResult> {
    // Search grounding and JSON schema output cannot be combined on all models: with grounding we ask for JSON in the prompt.
    const res = await this.ai.models.generateContent({
      model: req.model,
      contents: req.grounding ? `${req.user}\n\nRespond with a single JSON object only.` : req.user,
      config: {
        systemInstruction: req.system,
        temperature: req.grounding ? 1.0 : 0.6,
        ...(req.grounding
          ? { tools: [{ googleSearch: {} }] }
          : { responseMimeType: 'application/json', responseSchema: NARRATION_SCHEMA }),
      },
    });
    const output = normalizeNarration(parseJson(res.text), req.tier);
    const gm = res.candidates?.[0]?.groundingMetadata;
    const grounding: GroundingInfo | undefined = req.grounding
      ? {
          queries: gm?.webSearchQueries?.length ?? 0,
          ...(gm?.searchEntryPoint?.renderedContent
            ? { searchEntryPointHtml: gm.searchEntryPoint.renderedContent }
            : {}),
          sources: (gm?.groundingChunks ?? []).flatMap((c) =>
            c.web?.uri ? [{ uri: c.web.uri, ...(c.web.title ? { title: c.web.title } : {}) }] : [],
          ),
        }
      : undefined;
    return { output, usage: this.usage(res, false), ...(grounding ? { grounding } : {}) };
  }

  async checkFacts(req: {
    model: string;
    facts: string[];
    sources: string;
  }): Promise<{ verdicts: FactVerdict[]; usage: Usage }> {
    const res = await this.ai.models.generateContent({
      model: req.model,
      contents: `SOURCES:\n${req.sources}\n\nCLAIMS (JSON array):\n${JSON.stringify(req.facts)}\n\nFor every claim decide whether it is explicitly supported by the SOURCES. A claim is supported only if the sources state it or it follows directly. Be strict.`,
      config: {
        systemInstruction: 'You are a strict fact checker. Answer only with JSON.',
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              fact: { type: Type.STRING },
              supported: { type: Type.BOOLEAN },
              evidence: { type: Type.STRING },
            },
            required: ['fact', 'supported'],
          },
        },
      },
    });
    const arr = parseJson(res.text);
    const verdicts = Array.isArray(arr)
      ? (arr as FactVerdict[]).filter((v) => typeof v?.fact === 'string' && typeof v?.supported === 'boolean')
      : [];
    return { verdicts, usage: this.usage(res, true) };
  }

  async classifyInterests(
    items: { key: string; name: string; tags: Record<string, string>; instanceOf: string[] }[],
    model: string,
  ) {
    const res = await this.ai.models.generateContent({
      model,
      contents: `Classify each place into 1-3 interests from: ${INTERESTS.join(', ')}. Places (JSON): ${JSON.stringify(items)}`,
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING },
              interests: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['key', 'interests'],
          },
        },
      },
    });
    const arr = parseJson(res.text);
    const interests: Record<string, Interest[]> = {};
    if (Array.isArray(arr)) {
      for (const r of arr as { key: string; interests: string[] }[]) {
        const valid = (r.interests ?? []).filter((i): i is Interest =>
          (INTERESTS as readonly string[]).includes(i),
        );
        if (r.key && valid.length) interests[r.key] = valid;
      }
    }
    return { interests, usage: this.usage(res, true) };
  }

  async generateTourConcept(req: { model: string; system: string; user: string; input: TourConceptInput }) {
    const res = await this.ai.models.generateContent({
      model: req.model,
      contents: req.user,
      config: {
        systemInstruction: req.system,
        temperature: 0.7,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            teaser: { type: Type.STRING },
            description: { type: Type.STRING },
            intro: { type: Type.STRING },
            transitions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fromPoiId: { type: Type.STRING },
                  toPoiId: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
                required: ['fromPoiId', 'toPoiId', 'text'],
              },
            },
            outro: { type: Type.STRING },
            suggestedOrder: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['title', 'teaser', 'description', 'intro', 'transitions', 'outro'],
        },
      },
    });
    return { output: TourConceptSchema.parse(parseJson(res.text)), usage: this.usage(res, false) };
  }

  async transition(req: {
    model: string;
    lang: string;
    from: string;
    to: string;
    walkMinutes: number;
    tourTitle?: string;
  }) {
    const res = await this.ai.models.generateContent({
      model: req.model,
      contents: `Write one or two short spoken sentences in language "${req.lang}" that guide a visitor from "${req.from}" to "${req.to}", about ${req.walkMinutes} minutes away${req.tourTitle ? ` on the tour "${req.tourTitle}"` : ''}. Use only this information, invent no facts, no lists, no parentheses.`,
      config: { temperature: 0.5, maxOutputTokens: 200 },
    });
    return { text: (res.text ?? '').trim(), usage: this.usage(res, true) };
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Deterministic offline provider: builds narrations only from the supplied sources, so it never hallucinates. */
export class MockLlmProvider implements LlmProvider {
  constructor(private readonly opts: { hallucinate?: boolean } = {}) {}

  async classifyInterests(items: { key: string }[]) {
    return {
      interests: Object.fromEntries(items.map((i) => [i.key, ['hidden_gems'] as Interest[]])),
      usage: {},
    };
  }

  async generateNarration(req: NarrationRequest): Promise<NarrationResult> {
    const sentences = req.bundle.wikipedia
      .flatMap((w) => w.extract.match(/[^.!?]+[.!?]/g) ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
    const factSentences = req.bundle.facts.map((f) => `${req.bundle.poiName}, ${f.label}: ${f.value}.`);
    const base = [...sentences, ...factSentences];
    const per = { short: 2, medium: 5, long: 10 }[req.tier];
    const chosen = base.slice(0, per);
    if (chosen.length === 0) chosen.push(`Das ist ${req.bundle.poiName}.`);
    const keyFacts = [...chosen];
    let narration = chosen.join(' ');
    if (this.opts.hallucinate) {
      keyFacts.push('Das Gebäude wurde im Jahr 1888 vollständig aus Gold errichtet.');
      narration += ' Das Gebäude wurde im Jahr 1888 vollständig aus Gold errichtet.';
    }
    const paragraphs = splitParagraphs(narration, paragraphCount(req.tier));
    return {
      output: {
        title: req.bundle.poiName,
        narration: paragraphs.join(' '),
        paragraphs,
        keyFacts,
        sourcesUsed: ['mock'],
      },
      usage: { inputTokens: Math.ceil(req.user.length / 4), outputTokens: Math.ceil(narration.length / 4) },
    };
  }

  async checkFacts(req: { facts: string[]; sources: string }) {
    const hay = norm(req.sources);
    return {
      verdicts: req.facts.map((fact) => ({
        fact,
        supported: hay.includes(norm(fact)) || hay.includes(norm(fact).replace(/[.!?]$/, '')),
      })),
      usage: { liteInputTokens: 10, liteOutputTokens: 10 },
    };
  }

  async generateTourConcept(req: { input: TourConceptInput }) {
    return { output: fallbackTourConcept(req.input), usage: { inputTokens: 200, outputTokens: 200 } };
  }

  async transition(req: { from: string; to: string; walkMinutes: number }) {
    return {
      text: `Weiter geht es von ${req.from} zu ${req.to}, ungefähr ${req.walkMinutes} Minuten zu Fuß.`,
      usage: { liteInputTokens: 20, liteOutputTokens: 20 },
    };
  }
}

const TEMPLATE_TITLES: Record<string, { de: string; en: string }> = {
  highlights60: { de: 'Highlights in 60 Minuten', en: 'Highlights in 60 minutes' },
  grand120: { de: 'Große Runde in 2 Stunden', en: 'Grand tour in 2 hours' },
  theme_history: { de: 'Geschichte erleben', en: 'Living history' },
  theme_architecture: { de: 'Architektur entdecken', en: 'Discover the architecture' },
  theme_art_culture: { de: 'Kunst und Kultur', en: 'Art and culture' },
  theme_culinary: { de: 'Kulinarischer Streifzug', en: 'Culinary stroll' },
  theme_nature: { de: 'Natur und Aussicht', en: 'Nature and views' },
};

/**
 * Deterministic, fact-free tour texts built from names and walking times only. Used by the mock provider and
 * as a safe fallback when the model output fails validation.
 */
export function fallbackTourConcept(i: TourConceptInput): TourConcept {
  const de = i.lang === 'de';
  const t = TEMPLATE_TITLES[i.templateId];
  const title = t ? (de ? t.de : t.en) : de ? `Tour durch ${i.placeName}` : `Tour of ${i.placeName}`;
  const first = spokenName(i.stops[0]?.name ?? i.placeName);
  const last = spokenName(i.stops[i.stops.length - 1]?.name ?? i.placeName);
  return {
    title,
    teaser: de
      ? `${i.stops.length} Stationen in etwa ${i.durationMinutes} Minuten.`
      : `${i.stops.length} stops in about ${i.durationMinutes} minutes.`,
    description: de
      ? `Diese Tour führt Sie von ${first} bis ${last}. Unterwegs erzählt tuur an jeder Station eine eigene Geschichte.`
      : `This tour leads you from ${first} to ${last}. Along the way tuur tells a story at every stop.`,
    intro: de
      ? `Willkommen in ${i.placeName}. Wir starten bei ${first}.`
      : `Welcome to ${i.placeName}. We start at ${first}.`,
    transitions: i.stops.slice(1).map((s, n) => ({
      fromPoiId: i.stops[n]!.id,
      toPoiId: s.id,
      text: de
        ? `Weiter geht es zu ${spokenName(s.name)}, etwa ${Math.max(1, Math.round(s.walkMinutesFromPrev))} Minuten zu Fuß.`
        : `Next is ${spokenName(s.name)}, about ${Math.max(1, Math.round(s.walkMinutesFromPrev))} minutes on foot.`,
    })),
    outro: de
      ? `Das war unsere Tour. Danke, dass Sie mit tuur unterwegs waren.`
      : `That was our tour. Thank you for exploring with tuur.`,
  };
}
