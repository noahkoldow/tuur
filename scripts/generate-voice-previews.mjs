#!/usr/bin/env node
/**
 * Fixed, bundled voice introductions: six clips, never generated during playback.
 * Plan: node scripts/generate-voice-previews.mjs
 * Generate once: node scripts/generate-voice-previews.mjs --generate
 * Deliberately replace all six clips: node scripts/generate-voice-previews.mjs --regenerate
 * Verify without credentials/network: node scripts/generate-voice-previews.mjs --verify
 * Uses the isolated beta project's existing Gemini secret in memory, with one
 * request per clip. Does not upload audio or modify cloud configuration.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBetaProject, cloud, firestoreBase, projectId, projectNumber } from './lib/firebase-beta.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetDirectory = 'apps/mobile/assets/voice-previews';
const pendingDirectory = resolve(root, assetDirectory, '.pending-tuu');
const manifestPath = resolve(root, 'scripts/voice-previews.manifest.json');
const sampleRate = 24_000;
const minimumDurationMs = 10_000;
const maximumDurationMs = 24_000;
const personas = ['mara', 'jonas', 'lina'];
const languages = ['de', 'en'];
const texts = {
  de: 'Hey, ich bin Tuu. Komm, wir entdecken spannende Orte und die Geschichten dahinter – direkt auf deinen Infokarten. Du möchtest lieber zuhören? Mit einem Guthaben oder Premium bin ich auch als Audioguide dabei. Los geht’s!',
  en: 'Hey, I’m Tuu. Let’s explore the places around you and discover their stories, right on your info cards. Prefer to listen along the way? With a credit or Premium, I’ll be your audio guide. Come on, let’s go!',
};
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const filename = (persona, language) => `${assetDirectory}/${persona}-${language}.mp3`;

function decodeFirestore(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeFirestore);
  if ('mapValue' in value)
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, entry]) => [key, decodeFirestore(entry)]),
    );
  throw new Error('Unexpected Firestore configuration value');
}

async function loadRuntime() {
  // Reuse the application's real provider, encoder and voice validation without a
  // second implementation or generated source files. Dependencies resolve from Functions.
  const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { build } = requireFunctions('esbuild');
  const result = await build({
    stdin: {
      contents:
        "export { GeminiTtsProvider, Mp3AudioEncoder } from './functions/src/providers/tts.ts'; export { AiConfigSchema } from './packages/shared/src/config.ts'; export { pickVoiceSpec, parseVoiceSpec } from './packages/shared/src/narration/voices.ts';",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['@google/genai'],
    logLevel: 'silent',
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    requireFunctions,
    module,
    module.exports,
  );
  return module.exports;
}

async function verify({ requireCurrentTranscript = false } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.clips.length !== personas.length * languages.length)
    throw new Error('Expected six fixed voice clips');
  let earlierTranscript = false;
  for (const persona of personas) {
    for (const language of languages) {
      const clip = manifest.clips.find((entry) => entry.persona === persona && entry.language === language);
      if (!clip || clip.path !== filename(persona, language) || !clip.text?.trim())
        throw new Error(`Missing introduction: ${persona}/${language}`);
      if (clip.text !== texts[language]) {
        if (requireCurrentTranscript)
          throw new Error(
            `Earlier introduction retained: ${persona}/${language}; use --regenerate to replace it`,
          );
        earlierTranscript = true;
      }
      const data = await readFile(resolve(root, clip.path));
      if (
        data.subarray(0, 3).toString() !== 'ID3' ||
        !data.subarray(0, 256).includes(Buffer.from('AI_GENERATED'))
      )
        throw new Error(`Missing synthetic voice marker: ${clip.path}`);
      if (data.length !== clip.bytes || sha256(data) !== clip.sha256)
        throw new Error(`Audio checksum mismatch: ${clip.path}`);
      const tagSize =
        ((data[6] & 127) << 21) | ((data[7] & 127) << 14) | ((data[8] & 127) << 7) | (data[9] & 127);
      const offset = 10 + tagSize;
      if (data[offset] !== 255 || (data[offset + 1] & 224) !== 224)
        throw new Error(`Missing MP3 frames: ${clip.path}`);
      if (clip.durationMs < minimumDurationMs || clip.durationMs > maximumDurationMs)
        throw new Error(`Unexpected introduction duration: ${clip.path}`);
      console.log(`${clip.path}: ${(clip.durationMs / 1000).toFixed(2)} s, ${clip.bytes} bytes, verified`);
    }
  }
  if (earlierTranscript)
    console.log(
      'Earlier transcript retained and verified against its manifest; the new Tuu introduction is not generated yet.',
    );
}

async function generate(replace = false) {
  // Normal runs are idempotent. Replacement requires an explicit CLI action and
  // leaves the prior assets intact until all six new recordings are validated.
  if (!replace) {
    try {
      await readFile(manifestPath);
      await verify({ requireCurrentTranscript: true });
      console.log('Existing fixed clips verified; no paid generation requests made.');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const runtime = await loadRuntime();
  await assertBetaProject();
  const configDocument = await cloud('GET', `${firestoreBase}/config/ai`);
  const config = runtime.AiConfigSchema.parse(
    decodeFirestore({ mapValue: { fields: configDocument.fields } }),
  );
  if (config.models.tts !== 'gemini-3.8-flash-tts')
    throw new Error('Review the changed configured TTS model before generating clips');
  const cast = personas.map((id) => {
    const persona = config.voiceCast.find((entry) => entry.id === id);
    if (!persona) throw new Error(`Missing configured persona: ${id}`);
    const spec = runtime.pickVoiceSpec(persona, (provider) => provider === 'gemini');
    if (!spec) throw new Error(`Missing Gemini voice for persona: ${id}`);
    return { ...persona, voice: runtime.parseVoiceSpec(spec).name };
  });
  const secret = await cloud(
    'GET',
    `https://secretmanager.googleapis.com/v1/projects/${projectNumber}/secrets/GEMINI_API_KEY/versions/latest:access`,
  );
  const key = Buffer.from(secret.payload.data, 'base64').toString('utf8').trim();
  if (!key) throw new Error('The existing beta Gemini secret is empty');
  const provider = new runtime.GeminiTtsProvider(key);
  const encoder = new runtime.Mp3AudioEncoder();
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: projectId,
    purpose:
      'Tuu introduces discovering places and the optional paid audio guide, paired with a three-scene animation',
    provider: 'gemini',
    model: config.models.tts,
    sampleRate,
    channels: 1,
    bitrateKbps: 48,
    aiGenerated: true,
    acceptedDurationMs: { minimum: minimumDurationMs, maximum: maximumDurationMs },
    clips: [],
  };
  const recordings = [];
  for (const persona of cast) {
    for (const language of languages) {
      const text = texts[language];
      const baseStyle = `${persona.style} You are Tuu, a friendly companion welcoming one person to explore. Sound personal and conversational, with a light smile. Speak the whole introduction in 15 to 18 seconds, with short natural pauses after the greeting, after the info cards, and before the last invitation. Keep an easy flowing rhythm without a sales pitch. No music or sound effects. Pronounce Tuu as a single long 'too' sound. Read only the supplied words.`;
      const style = baseStyle;
      const pendingAudio = resolve(pendingDirectory, `${persona.id}-${language}.mp3`);
      const pendingMetadata = resolve(pendingDirectory, `${persona.id}-${language}.json`);
      try {
        const clip = JSON.parse(await readFile(pendingMetadata, 'utf8'));
        const data = await readFile(pendingAudio);
        if (
          clip.persona === persona.id &&
          clip.language === language &&
          clip.text === text &&
          clip.style === style &&
          clip.voice === persona.voice &&
          clip.model === config.models.tts &&
          clip.path === filename(persona.id, language) &&
          clip.durationMs >= minimumDurationMs &&
          clip.durationMs <= maximumDurationMs &&
          clip.bytes === data.length &&
          clip.sha256 === sha256(data)
        ) {
          recordings.push({ path: clip.path, data });
          manifest.clips.push(clip);
          console.log(`${clip.path}: reused verified pending recording; no generation request`);
          continue;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      let pcm;
      try {
        ({ pcm } = await provider.synthesize({
          text,
          lang: language === 'de' ? 'German' : 'English',
          voice: persona.voice,
          model: config.models.tts,
          style,
        }));
      } catch (error) {
        if (typeof error.status === 'number') console.log(`Provider HTTP status: ${error.status}`);
        const retryDelay = String(error.message ?? '').match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?s)"/);
        if (retryDelay) console.log(`Provider retry delay: ${retryDelay[1]}`);
        const quotaId = String(error.message ?? '').match(/"quotaId"\s*:\s*"([a-zA-Z0-9_./-]{1,160})"/);
        if (quotaId) console.log(`Provider quota: ${quotaId[1]}`);
        throw new Error(`Gemini generation failed for ${persona.id}/${language}; no automatic retry`);
      }
      const durationMs = Math.round((pcm.length / (2 * sampleRate)) * 1000);
      if (durationMs < minimumDurationMs || durationMs > maximumDurationMs)
        throw new Error(`Review unexpected duration for ${persona.id}/${language}: ${durationMs} ms`);
      const encoded = encoder.encode(pcm);
      const path = filename(persona.id, language);
      recordings.push({ path, data: encoded.data });
      const clip = {
        persona: persona.id,
        language,
        voice: persona.voice,
        model: config.models.tts,
        text,
        style,
        path,
        durationMs,
        bytes: encoded.data.length,
        sha256: sha256(encoded.data),
      };
      await mkdir(pendingDirectory, { recursive: true });
      await writeFile(pendingAudio, encoded.data);
      await writeFile(pendingMetadata, `${JSON.stringify(clip, null, 2)}\n`);
      manifest.clips.push(clip);
      console.log(`${path}: ${(durationMs / 1000).toFixed(2)} s, ${encoded.data.length} bytes`);
    }
  }
  for (const recording of recordings) {
    await mkdir(dirname(resolve(root, recording.path)), { recursive: true });
    await writeFile(resolve(root, recording.path), recording.data);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await verify({ requireCurrentTranscript: true });
  for (const clip of manifest.clips) {
    await rm(resolve(pendingDirectory, `${clip.persona}-${clip.language}.mp3`), { force: true });
    await rm(resolve(pendingDirectory, `${clip.persona}-${clip.language}.json`), { force: true });
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(
      JSON.stringify(
        {
          texts,
          paths: personas.flatMap((persona) => languages.map((language) => filename(persona, language))),
          generate: '--generate',
          replace: '--regenerate',
          verify: '--verify',
          maximumGenerationRequests: 6,
        },
        null,
        2,
      ),
    );
  } else if (args.length === 1 && args[0] === '--verify') await verify();
  else if (args.length === 1 && args[0] === '--generate') await generate();
  else if (args.length === 1 && args[0] === '--regenerate') await generate(true);
  else throw new Error('Use no arguments, --generate, --regenerate or --verify');
} catch (error) {
  // Never log provider responses, request headers or the secret payload.
  console.error(error.message);
  process.exitCode = 1;
}
