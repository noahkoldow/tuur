import { describe, expect, it } from 'vitest';
import {
  FactSheetSchema,
  FACT_SHEET_LIMITS,
  cleanFactText,
  fallbackFactSheet,
  factSheetPrompt,
  normalizeFactSheet,
  shortenAt,
  structuredFacts,
  verifyFactSheet,
} from './factSheet';

const TEXT =
  'Die Siegessäule ist ein Denkmal in Berlin. Sie wurde 1873 zur Erinnerung an die Kriege errichtet. ' +
  'Die Säule ist bekannt für ihre Aussicht auf den Tiergarten. Sie besteht aus Sandstein und Bronze. ' +
  'Besucher können die Plattform gegen Eintritt besichtigen.';

describe('fact sheet', () => {
  it('cleans markup and wiki syntax', () => {
    expect(cleanFactText('<b>A</b> [[B|bee]] {{x}} [1] https://x.de *c*')).toBe('A bee c');
  });
  it('shortens without cutting mid-word', () => {
    const out = shortenAt('Lorem ipsum dolor sit amet consectetur adipiscing elit', 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith('…')).toBe(true);
    expect(shortenAt('Short.', 30)).toBe('Short.');
  });
  it('builds a structured fallback with sections and valid schema', () => {
    const sheet = fallbackFactSheet({
      text: TEXT,
      lang: 'de',
      osmTags: { start_date: '1873', opening_hours: 'Mo-Su 09:30-18:30', fee: 'yes' },
    })!;
    expect(FactSheetSchema.safeParse(sheet).success).toBe(true);
    expect(sheet.summary).toContain('Denkmal');
    const kinds = sheet.sections.map((s) => s.kind);
    expect(kinds).toEqual(expect.arrayContaining(['history', 'worth', 'visit']));
    expect(sheet.facts.map((f) => f.key)).toEqual(expect.arrayContaining(['built', 'openingHours', 'fee']));
    for (const s of sheet.sections)
      expect(s.items.length).toBeLessThanOrEqual(FACT_SHEET_LIMITS.itemsPerSection);
  });
  it('returns undefined without text', () => {
    expect(fallbackFactSheet({ text: '  ' })).toBeUndefined();
  });
  it('maps wikidata facts and ignores unknown labels', () => {
    const facts = structuredFacts({
      wikidata: [
        { label: 'architect', value: 'Heinrich Strack' },
        { label: 'population', value: '5' },
      ],
    });
    expect(facts).toEqual([{ key: 'architect', value: 'Heinrich Strack' }]);
  });
  it('normalizes loose model output: limits, duplicates, unknown keys', () => {
    const sheet = normalizeFactSheet({
      summary: `**${'Wort '.repeat(80)}**`,
      facts: [
        { key: 'built', value: '1873' },
        { key: 'built', value: '1900' },
        { key: 'bogus', value: 'x' },
      ],
      sections: [
        { kind: 'history', items: ['A.', 'A.', 'B.', 'C.', 'D.', 'E.'] },
        { kind: 'nope', items: ['x'] },
      ],
    })!;
    expect(FactSheetSchema.safeParse(sheet).success).toBe(true);
    expect(sheet.facts).toEqual([{ key: 'built', value: '1873' }]);
    expect(sheet.sections).toEqual([{ kind: 'history', items: ['A.', 'B.', 'C.', 'D.'] }]);
    expect(normalizeFactSheet({ summary: '  ' })).toBeUndefined();
    expect(normalizeFactSheet('x')).toBeUndefined();
  });
  it('drops items with numbers missing in the sources and rejects an unsupported summary', () => {
    const sheet = normalizeFactSheet({
      summary: 'Gebaut 1873.',
      facts: [{ key: 'built', value: '1999' }],
      sections: [{ kind: 'history', items: ['Eröffnet 1873.', 'Umbau 1950.'] }],
    })!;
    const verified = verifyFactSheet(sheet, 'errichtet 1873')!;
    expect(verified.facts).toEqual([]);
    expect(verified.sections[0]!.items).toEqual(['Eröffnet 1873.']);
    expect(verifyFactSheet({ ...sheet, summary: 'Gebaut 1750.' }, 'errichtet 1873')).toBeUndefined();
  });
  it('prompt carries sources and no model name', () => {
    const p = factSheetPrompt({ name: 'X', lang: 'de', sources: 'S' });
    expect(p.system).toContain('German');
    expect(p.user).toContain('SOURCES:\nS');
  });
});
