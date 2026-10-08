// App-ready copies of the owner's three ordered Tuu poses per voice.
// Uses sharp just like build-mascot-assets.mjs (resolve locally or via NODE_PATH).
// Originals remain untouched; all frames retain their shared canvas and transparency.
import { createRequire } from 'node:module';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const sharp = createRequire(import.meta.url)('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const scenes = ['01-hello', '02-map', '03-listen'];
// The numeric export suffix identifies the pose even when a replacement has a later timestamp.
const sourceIds = { Mara: [1, 4, 7], Jonas: [2, 5, 8], Linus: [3, 6, 9] };
let total = 0;
for (const voice of ['Mara', 'Jonas', 'Linus']) {
  const input = resolve(root, 'assets/mascot', voice);
  const available = (await readdir(input)).filter((name) => name.endsWith('.png'));
  const files = sourceIds[voice].map((id) => {
    const matches = available.filter((name) => Number(/-(\d+)\.png$/i.exec(name)?.[1]) === id);
    if (matches.length !== 1) throw new Error(`Expected one source ending in -${id}.png for ${voice}`);
    return matches[0];
  });
  const output = resolve(root, 'apps/mobile/assets/mascot/voices', voice.toLowerCase());
  await mkdir(output, { recursive: true });
  for (const [index, file] of files.entries()) {
    const target = resolve(output, `${scenes[index]}.png`);
    await sharp(resolve(input, file))
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
      .toFile(target);
    const { size } = await stat(target);
    total += size;
    console.log(`${voice}/${scenes[index]}.png <- ${file} (${size} bytes)`);
  }
}
console.log(`Nine voice poses: ${total} bytes total`);
