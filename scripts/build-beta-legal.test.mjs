import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  BETA_ORIGIN,
  BETA_PROJECT,
  betaNativeInviteUrl,
  buildBetaLegal,
  validateBetaLegalEnv,
} from './build-beta-legal.mjs';

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
  assert.equal(result.files.length, 17);
  assert.match(
    readFileSync(join(outputDir, 'app-ads.txt'), 'utf8'),
    /^google\.com, pub-5666991539216529, DIRECT, f08c47fec0942fa0/,
  );
  assert.ok(readFileSync(join(outputDir, 'robots.txt'), 'utf8').includes('Allow: /app-ads.txt'));
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

test('native links accept backend tokens and reject URL or markup injection', () => {
  const gift = 'aB09_-'.repeat(5) + 'ab';
  const group = `Ab0123456789.${'aB09_-'.repeat(7)}a`;
  assert.equal(betaNativeInviteUrl(`/invite/${gift}`), `tuur://invite/${gift}`);
  assert.equal(betaNativeInviteUrl(`/join/${group}`), `tuur://join/${group}`);
  for (const path of [
    null,
    '/join/',
    '/invite/short',
    `/invite/${gift}\n`,
    `/invite/${gift}/extra`,
    `/invite/${gift}?next=https://example.test`,
    `/invite/${gift}#fragment`,
    `/invite/${gift}%22`,
    `/invite/${gift}<script>alert(1)</script>`,
    `/invite/${gift}" onclick="alert(1)`,
    `/join/${group.replace('.', '%2e')}`,
    `/join/${group.replace('.', '/')}`,
    `/join/${group}%2Fextra`,
    `//example.test/invite/${gift}`,
    `https://example.test/invite/${gift}`,
    'javascript:alert(1)',
  ])
    assert.equal(betaNativeInviteUrl(path), null, `Reject ${path}`);
});

test('landing page only exposes a validated button and never redeems or redirects', async (t) => {
  const outputDir = temporaryOutput(t);
  const secret = 'server-only-secret-sentinel-do-not-publish';
  const result = await buildBetaLegal({ env: { ...fixture(), PRIVATE_API_KEY: secret }, outputDir });
  const script = readFileSync(join(outputDir, 'app-link.js'), 'utf8');
  const html = readFileSync(join(outputDir, 'app-link.html'), 'utf8');
  assert.ok(html.includes('<script src="/app-link.js" defer></script>'));
  assert.ok(html.includes('id="open-app" class="app-button" hidden'));
  assert.ok(html.includes('TestFlight'));
  assert.ok(!/http-equiv="refresh"|<iframe|<form|onclick=/i.test(html));
  const gift = 'a'.repeat(32);
  for (const [pathname, expected] of [
    [`/invite/${gift}`, `tuur://invite/${gift}`],
    ['/join/invalid', null],
  ]) {
    const open = { hidden: true };
    const invalid = { hidden: true };
    const window = Object.freeze({ location: Object.freeze({ pathname }) });
    // No network, storage, timers or navigation APIs are supplied to the generated script.
    runInNewContext(script, {
      window,
      document: { getElementById: (id) => ({ 'open-app': open, 'invalid-link': invalid })[id] },
    });
    assert.equal(open.href, expected ?? undefined);
    assert.equal(open.hidden, !expected);
    assert.equal(invalid.hidden, Boolean(expected));
  }
  for (const file of result.files)
    assert.ok(!readFileSync(join(outputDir, file), 'utf8').includes(secret), `No secrets in ${file}`);
  const association = JSON.parse(
    readFileSync(join(outputDir, '.well-known/apple-app-site-association'), 'utf8'),
  );
  assert.deepEqual(association.applinks, {
    apps: [],
    details: [{ appID: '4GXK973R2W.com.tuurapp', paths: ['/join/*', '/invite/*'] }],
  });
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
  assert.deepEqual(config.hosting.rewrites, [
    { source: '/join/**', destination: '/app-link.html' },
    { source: '/invite/**', destination: '/app-link.html' },
  ]);
  assert.ok(!config.hosting.ignore.some((pattern) => ['.*', '**/.*', '.well-known'].includes(pattern)));
  assert.ok(
    config.hosting.headers.some(
      (rule) =>
        rule.source === '/.well-known/apple-app-site-association' &&
        rule.headers.some((header) => header.key === 'Content-Type' && header.value === 'application/json'),
    ),
  );
  const csp = config.hosting.headers
    .flatMap((rule) => rule.headers)
    .find((header) => header.key === 'Content-Security-Policy').value;
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(!csp.includes('unsafe-inline'));
});
