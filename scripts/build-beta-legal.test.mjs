import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { BETA_ORIGIN, BETA_PROJECT, buildBetaLegal, validateBetaLegalEnv } from './build-beta-legal.mjs';

const fixture = () => ({
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: BETA_PROJECT,
  EXPO_PUBLIC_BETA_FIREBASE_PROJECT_ID: BETA_PROJECT,
  EXPO_PUBLIC_WEB_BASE_URL: BETA_ORIGIN,
  EXPO_PUBLIC_OPERATOR_NAME: 'Example & Test <Company>',
  EXPO_PUBLIC_OPERATOR_ADDRESS: 'Fixture Road 1\n12345 Test City',
  EXPO_PUBLIC_OPERATOR_EMAIL: 'support@example.test',
  EXPO_PUBLIC_OPERATOR_PRIVACY_EMAIL: 'privacy@example.test',
  EXPO_PUBLIC_OPERATOR_REPRESENTATIVE: 'Example Person',
  EXPO_PUBLIC_OPERATOR_SUPERVISORY_AUTHORITY: 'Example privacy authority',
});

function temporaryOutput(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tuur-legal-test-'));
  t.after(() => {
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('tuur-legal-test-')
    )
      throw new Error('Refusing to remove an unexpected test directory');
    rmSync(directory, { recursive: true, force: true });
  });
  return join(directory, 'site');
}

test('missing operator data fails before creating any publishable output', async (t) => {
  const outputDir = temporaryOutput(t);
  await assert.rejects(
    buildBetaLegal({ env: { ...fixture(), EXPO_PUBLIC_OPERATOR_ADDRESS: '' }, outputDir }),
    /Missing operator field: address/,
  );
  assert.equal(existsSync(outputDir), false);
  for (const key of ['NAME', 'ADDRESS', 'EMAIL', 'REPRESENTATIVE', 'PRIVACY_EMAIL', 'SUPERVISORY_AUTHORITY'])
    assert.ok(validateBetaLegalEnv({ ...fixture(), [`EXPO_PUBLIC_OPERATOR_${key}`]: '' }).length);
});

test('beta generator refuses another project, origin or unsafe email', () => {
  assert.deepEqual(validateBetaLegalEnv(fixture()), []);
  for (const key of [
    'GCLOUD_PROJECT',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_BETA_FIREBASE_PROJECT_ID',
  ])
    assert.ok(validateBetaLegalEnv({ ...fixture(), [key]: 'tuur-prod' }).length);
  assert.ok(validateBetaLegalEnv({ ...fixture(), EXPO_PUBLIC_WEB_BASE_URL: 'https://tuur.app' }).length);
  assert.ok(
    validateBetaLegalEnv({ ...fixture(), EXPO_PUBLIC_OPERATOR_EMAIL: 'x" onclick="alert(1)' }).length,
  );
});

test('legal-only hosting accepts a separate app/share origin without redirecting invites there', () => {
  assert.deepEqual(
    validateBetaLegalEnv({
      ...fixture(),
      EXPO_PUBLIC_WEB_BASE_URL: 'https://tuur.app',
      EXPO_PUBLIC_LEGAL_BASE_URL: BETA_ORIGIN,
    }),
    [],
  );
  assert.ok(
    validateBetaLegalEnv({ ...fixture(), EXPO_PUBLIC_LEGAL_BASE_URL: 'https://other.web.app' }).length,
  );
});

test('generates complete accessible bilingual documents from shared text with safe operator content', async (t) => {
  const outputDir = temporaryOutput(t);
  const result = await buildBetaLegal({ env: fixture(), outputDir });
  assert.equal(result.files.length, 13);
  for (const lang of ['de', 'en']) {
    for (const page of ['privacy', 'terms', 'imprint', 'support']) {
      const html = readFileSync(join(outputDir, `${lang === 'en' ? 'en/' : ''}${page}.html`), 'utf8');
      assert.ok(html.startsWith('<!doctype html>'));
      assert.ok(html.includes(`<html lang="${lang}">`));
      assert.equal((html.match(/<h1>/g) ?? []).length, 1);
      assert.ok(html.includes('href="#content"'));
      assert.ok(html.includes('id="content"'));
      assert.ok(html.includes('hreflang="de"'));
      assert.ok(html.includes('hreflang="en"'));
      assert.ok(!html.includes('operator data missing'));
      assert.ok(!/<script\b|<iframe\b|<form\b/i.test(html));
      if (page === 'imprint') {
        assert.ok(html.includes('Example &amp; Test &lt;Company&gt;'));
        assert.ok(html.includes('Fixture Road 1\n12345 Test City'));
      }
      for (const [, path] of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const file = path === '/site.css' ? 'site.css' : `${path.slice(1)}.html`;
        assert.ok(result.files.includes(file), `Link target must be generated: ${path}`);
      }
    }
  }
  const privacy = readFileSync(join(outputDir, 'en/privacy.html'), 'utf8');
  assert.ok(privacy.includes('OpenRouteService'));
  assert.ok(privacy.includes('Firebase'));
  const support = readFileSync(join(outputDir, 'support.html'), 'utf8');
  assert.ok(support.includes('href="mailto:support@example.test"'));
  assert.ok(support.includes('href="mailto:privacy@example.test"'));
});

test('Hosting configuration is restricted to static beta pages and rebuilds before deployment', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.beta-legal.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(config), ['hosting']);
  assert.equal(config.hosting.site, BETA_PROJECT);
  assert.equal(config.hosting.public, 'deploy/beta-legal');
  assert.deepEqual(config.hosting.predeploy, ['node scripts/build-beta-legal.mjs']);
  assert.equal(config.hosting.cleanUrls, true);
  assert.ok(
    config.hosting.redirects.some((rule) => rule.source === '/legal/:page' && rule.destination === '/:page'),
  );
});
