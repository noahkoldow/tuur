import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
export const BETA_PROJECT = 'tuur-beta-noehxpo';
export const BETA_ORIGIN = `https://${BETA_PROJECT}.web.app`;
const defaultOutput = join(root, 'deploy/beta-legal');
const pages = ['support', 'privacy', 'terms', 'imprint'];
const copy = {
  de: {
    support: 'Hilfe & Kontakt',
    privacy: 'Datenschutz',
    terms: 'Nutzungsbedingungen',
    imprint: 'Impressum',
    navigation: 'Rechtliches und Support',
    languages: 'Sprache',
    skip: 'Zum Inhalt',
    version: 'Stand',
    intro: 'Support und rechtliche Informationen für die tuur-App.',
    contact: 'Kontakt',
    contactText:
      'Bei Fragen zur App oder Problemen mit deiner TestFlight-Version erreichst du uns per E-Mail.',
    bug: 'Ein Problem melden',
    bugText:
      'Nenne die App-Version, dein iPhone-Modell, die iOS-Version und die Schritte, bei denen das Problem auftritt. Bitte sende keine Passwörter oder SMS-Bestätigungscodes.',
    account: 'Konto und Datenschutz',
    accountText:
      'Du kannst deine Daten in der App unter Einstellungen exportieren und dein Konto dort löschen. Wenn du keinen Zugriff mehr auf die App hast, kontaktiere uns über die Datenschutzadresse.',
    privacyContact: 'Datenschutzkontakt',
    website: 'Diese Informationsseite',
    websiteText:
      'Diese statische Informationsseite verwendet keine Analyse, Werbung, Cookies oder Browser-Speicherung. Die Angaben zur Anmeldung und Sprachauswahl im Partnerportal in der Datenschutzerklärung beziehen sich auf das Portal, nicht auf diese Seite.',
    notFound: 'Seite nicht gefunden',
    back: 'Weiter zu Hilfe & Kontakt',
  },
  en: {
    support: 'Help & contact',
    privacy: 'Privacy',
    terms: 'Terms of use',
    imprint: 'Imprint',
    navigation: 'Legal and support',
    languages: 'Language',
    skip: 'Skip to content',
    version: 'Effective date',
    intro: 'Support and legal information for the tuur app.',
    contact: 'Contact',
    contactText: 'For questions about the app or problems with your TestFlight version, contact us by email.',
    bug: 'Report a problem',
    bugText:
      'Include the app version, iPhone model, iOS version and the steps that led to the problem. Please do not send passwords or SMS verification codes.',
    account: 'Account and privacy',
    accountText:
      'You can export your data and delete your account in the app under Settings. If you can no longer access the app, contact us at the privacy email address.',
    privacyContact: 'Privacy contact',
    website: 'This information site',
    websiteText:
      'This static information site uses no analytics, advertising, cookies or browser storage. The privacy policy’s descriptions of sign-in and language preferences in the partner portal concern that portal, not this site.',
    notFound: 'Page not found',
    back: 'Go to help & contact',
  },
};

const css = `:root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#242424;background:#faf9f6;line-height:1.65}*{box-sizing:border-box}body{margin:0}a{color:#aa0a19;text-underline-offset:.2em;overflow-wrap:anywhere}a:hover{text-decoration-thickness:2px}a:focus-visible{outline:3px solid #aa0a19;outline-offset:5px;border-radius:2px}.wrap{max-width:52rem;margin:auto;padding:1.25rem clamp(1rem,4vw,2.5rem)}header{border-bottom:1px solid #d9d6d1}.top{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}.brand{font-size:1.75rem;letter-spacing:-.05em;font-weight:800;color:inherit;text-decoration:none}nav{display:flex;gap:.3rem 1.1rem;flex-wrap:wrap}nav a{display:inline-block;padding:.45rem 0}nav a[aria-current=page]{font-weight:700;text-decoration-thickness:2px}.languages{font-size:.95rem}.languages a{min-width:2.5rem;text-align:center}main{padding-top:2.5rem!important;padding-bottom:4rem!important}h1{font-size:clamp(2rem,7vw,2.75rem);line-height:1.2;letter-spacing:-.035em;margin:.35rem 0 1rem}h2{font-size:1.3rem;line-height:1.4;margin:2.25rem 0 .7rem}p{margin:.6rem 0 1rem;overflow-wrap:anywhere;white-space:pre-line}.eyebrow,.meta,footer{color:#62605c}.eyebrow{font-size:.9rem;margin:0}.meta{font-size:.95rem}footer{border-top:1px solid #d9d6d1;font-size:.9rem}.skip{position:fixed;left:1rem;top:-10rem;background:#fff;padding:.6rem 1rem;z-index:1}.skip:focus{top:1rem}@media(prefers-color-scheme:dark){:root{color:#f4f2ef;background:#181817}a{color:#ff8a91}.eyebrow,.meta,footer{color:#bbb8b2}header,footer{border-color:#47443e}.skip{background:#181817}a:focus-visible{outline-color:#ff8a91}}@media print{header,footer,.skip{display:none}:root{color:#000;background:#fff}main{max-width:none!important;padding:0!important}a{color:inherit}h2{break-after:avoid}p{orphans:3;widows:3}}\n`;

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
const pagePath = (page, lang) => `${lang === 'en' ? '/en' : ''}/${page}`;
const emailLink = (address) => `<a href="mailto:${escapeHtml(address)}">${escapeHtml(address)}</a>`;

/** Only the token formats issued by the backend may become a native URL. */
export function betaNativeInviteUrl(pathname) {
  if (typeof pathname !== 'string') return null;
  const match = /^\/(join|invite)\/([A-Za-z0-9_.-]+)$/.exec(pathname);
  if (!match || match[0] !== pathname) return null;
  const [, kind, token] = match;
  const valid =
    kind === 'join'
      ? /^[A-Za-z0-9]{10,40}\.[A-Za-z0-9_-]{32,64}$/.test(token)
      : /^[A-Za-z0-9_-]{32}$/.test(token);
  return valid ? `tuur://${kind}/${token}` : null;
}

function appLinkPage() {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Einladung · tuur</title><link rel="stylesheet" href="/site.css"><script src="/app-link.js" defer></script></head>
<body><a class="skip" href="#content">Zum Inhalt</a><header><div class="wrap"><a class="brand" href="/support">tuur</a></div></header>
<main id="content" class="wrap" tabindex="-1"><h1>Deine Einladung zu tuur</h1><p lang="en">Your invitation to tuur</p><p>Öffne diese Einladung mit der tuur-App. Wenn tuur noch nicht installiert ist, installiere die App über deine TestFlight-Einladung und kehre anschließend zu diesem Link zurück.</p><p lang="en">Open this invitation in the tuur app. If tuur is not installed yet, install it using your TestFlight invitation, then return to this link.</p><p><a id="open-app" class="app-button" hidden>In tuur öffnen / <span lang="en">Open in tuur</span></a></p><p id="invalid-link" hidden>Dieser Einladungslink ist ungültig. Bitte lass dir einen neuen Link senden. <span lang="en">This invitation link is invalid. Please request a new link.</span></p><noscript><p>Aktiviere JavaScript, um die Einladung in tuur zu öffnen. <span lang="en">Enable JavaScript to open the invitation in tuur.</span></p></noscript><p><a href="/support">Hilfe &amp; Kontakt</a> · <a href="/en/support" lang="en">Help &amp; contact</a></p></main></body></html>\n`;
}

// No requests, storage, automatic redirects or redemption: the app checks access after a deliberate tap.
const appLinkScript = `${betaNativeInviteUrl.toString()}
const nativeUrl = betaNativeInviteUrl(window.location.pathname);
if (nativeUrl) {
  const link = document.getElementById('open-app');
  link.href = nativeUrl;
  link.hidden = false;
} else {
  document.getElementById('invalid-link').hidden = false;
}
`;

export function operatorFromEnv(env) {
  const value = (name) => (env[`EXPO_PUBLIC_OPERATOR_${name}`] ?? env[`OPERATOR_${name}`])?.trim();
  return {
    name: value('NAME'),
    address: value('ADDRESS'),
    email: value('EMAIL'),
    phone: value('PHONE'),
    register: value('REGISTER'),
    vatId: value('VAT_ID'),
    representative: value('REPRESENTATIVE'),
    privacyEmail: value('PRIVACY_EMAIL'),
    authority: value('SUPERVISORY_AUTHORITY'),
    webBaseUrl: BETA_ORIGIN,
  };
}

export function validateBetaLegalEnv(env) {
  const operator = operatorFromEnv(env);
  const missing = ['name', 'address', 'email', 'representative', 'privacyEmail', 'authority'].filter(
    (key) => !operator[key],
  );
  const errors = missing.map((key) => `Missing operator field: ${key}`);
  for (const key of ['email', 'privacyEmail']) {
    if (operator[key] && !/^[^\s<>"'@]+@[^\s<>"'@]+\.[^\s<>"'@]+$/.test(operator[key]))
      errors.push(`Invalid operator email field: ${key}`);
  }
  for (const key of [
    'GCLOUD_PROJECT',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_BETA_FIREBASE_PROJECT_ID',
  ]) {
    if (env[key] && env[key] !== BETA_PROJECT) errors.push(`${key} must identify ${BETA_PROJECT}`);
  }
  const legalBase = env.EXPO_PUBLIC_LEGAL_BASE_URL ?? env.EXPO_PUBLIC_WEB_BASE_URL;
  if (legalBase !== undefined && legalBase.replace(/\/$/, '') !== BETA_ORIGIN)
    errors.push(`EXPO_PUBLIC_LEGAL_BASE_URL (or legacy EXPO_PUBLIC_WEB_BASE_URL) must be ${BETA_ORIGIN}`);
  return errors;
}

async function legalBuilders() {
  const { build } = require('esbuild');
  const result = await build({
    entryPoints: [join(root, 'packages/shared/src/legal/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

function renderPage({ page, lang, title, body, version }) {
  const t = copy[lang];
  const current = pagePath(page, lang);
  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><meta name="description" content="${escapeHtml(t.intro)}"><title>${escapeHtml(title)} · tuur</title><link rel="stylesheet" href="/site.css"><link rel="canonical" href="${BETA_ORIGIN}${current}"><link rel="alternate" hreflang="de" href="${BETA_ORIGIN}${pagePath(page, 'de')}"><link rel="alternate" hreflang="en" href="${BETA_ORIGIN}${pagePath(page, 'en')}"></head>
<body><a class="skip" href="#content">${t.skip}</a>
<header><div class="wrap"><div class="top"><a class="brand" href="${pagePath('support', lang)}" aria-label="tuur ${escapeHtml(t.support)}">tuur</a><nav class="languages" aria-label="${t.languages}">${['de', 'en'].map((locale) => `<a href="${pagePath(page, locale)}" lang="${locale}" hreflang="${locale}"${locale === lang ? ' aria-current="page"' : ''}>${locale === 'de' ? 'Deutsch' : 'English'}</a>`).join('')}</nav></div><nav aria-label="${t.navigation}">${pages.map((id) => `<a href="${pagePath(id, lang)}"${page === id ? ' aria-current="page"' : ''}>${t[id]}</a>`).join('')}</nav></div></header>
<main id="content" class="wrap" tabindex="-1"><p class="eyebrow">${t.navigation}</p><h1>${escapeHtml(title)}</h1>${version ? `<p class="meta">${t.version}: <time datetime="${version}">${version}</time></p>` : ''}${body}</main>
<footer><div class="wrap">tuur · ${t.navigation}</div></footer></body></html>\n`;
}

function supportBody(operator, lang) {
  const t = copy[lang];
  return `<p>${t.intro}</p><section><h2>${t.contact}</h2><p>${t.contactText}</p><p>${emailLink(operator.email)}</p></section><section><h2>${t.bug}</h2><p>${t.bugText}</p></section><section><h2>${t.account}</h2><p>${t.accountText}</p><p>${t.privacyContact}: ${emailLink(operator.privacyEmail)}</p><p><a href="${pagePath('privacy', lang)}">${t.privacy}</a></p></section><section><h2>${t.website}</h2><p>${t.websiteText}</p></section>`;
}

/** Validate all content before writing any publishable output. No placeholder mode. */
export async function buildBetaLegal({ env, outputDir = defaultOutput }) {
  const errors = validateBetaLegalEnv(env);
  if (errors.length) throw new Error(`Beta legal pages are not ready:\n- ${errors.join('\n- ')}`);
  const operator = operatorFromEnv(env);
  const { getLegalDocument, hasMissing } = await legalBuilders();
  // Public seller ID from the configured AdMob account, never Google's demo publisher.
  const appAds = readFileSync(join(root, 'apps/web/public/app-ads.txt'), 'utf8');
  if (!/^google\.com, pub-(?!3940256099942544)\d{16}, DIRECT, f08c47fec0942fa0\r?\n?$/.test(appAds))
    throw new Error('The public AdMob seller declaration is invalid');
  const files = new Map([
    [
      'site.css',
      `${css}.app-button{display:inline-block;border:2px solid currentColor;border-radius:.75rem;padding:.8rem 1.2rem;font-weight:700;text-decoration:none}.app-button[hidden]{display:none}\n`,
    ],
    ['robots.txt', 'User-agent: *\nAllow: /app-ads.txt\nDisallow: /\n'],
    ['app-ads.txt', appAds],
    ['app-link.html', appLinkPage()],
    ['app-link.js', appLinkScript],
    [
      '.well-known/apple-app-site-association',
      `${JSON.stringify({
        applinks: {
          apps: [],
          details: [{ appID: '4GXK973R2W.com.tuurapp', paths: ['/join/*', '/invite/*'] }],
        },
      })}\n`,
    ],
  ]);
  for (const lang of ['de', 'en']) {
    for (const page of pages) {
      const doc = page === 'support' ? undefined : getLegalDocument(page, lang, operator);
      if (doc && hasMissing(doc)) throw new Error(`Missing operator data in ${lang}/${page}`);
      const body = doc
        ? doc.sections
            .map(
              (section) =>
                `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`,
            )
            .join('')
        : supportBody(operator, lang);
      const html = renderPage({
        page,
        lang,
        title: doc?.title ?? copy[lang].support,
        version: doc?.version,
        body,
      });
      files.set(`${lang === 'en' ? 'en/' : ''}${page}.html`, html);
      if (page === 'support') files.set(`${lang === 'en' ? 'en/' : ''}index.html`, html);
    }
  }
  files.set(
    '404.html',
    renderPage({
      page: 'support',
      lang: 'de',
      title: copy.de.notFound,
      body: `<p><a href="/support">${copy.de.back}</a></p><p lang="en">${copy.en.notFound}. <a href="/en/support">${copy.en.back}</a></p>`,
    }),
  );
  mkdirSync(outputDir, { recursive: true });
  for (const [name, html] of files) {
    const file = join(outputDir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html, 'utf8');
  }
  return { outputDir, files: [...files.keys()] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const envFile = join(root, 'apps/mobile/beta/.env.local');
    const env = { ...parseEnv(readFileSync(envFile, 'utf8')), ...process.env };
    const result = await buildBetaLegal({ env });
    console.log(`Built ${result.files.length} static beta legal/support files in deploy/beta-legal.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
