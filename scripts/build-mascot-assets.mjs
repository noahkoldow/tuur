// Regenerates the app-ready mascot poses (apps/mobile/assets/mascot/tuu_*.png) from the owner's
// originals in assets/mascot (1254 px renders with transparent background; the originals are only read).
// Sources are named like the outputs (tuu_01_idle_front.png ...); the original export names ending in
// "-1.png" ... "-10.png" are accepted as a fallback.
// Usage: pnpm mascot (requires `sharp`: `npm i --no-save sharp`, or point NODE_PATH at a folder that has it).
//
// Steps: (1) drop the faint low-alpha specks the background removal left around the silhouette,
// (2) crop every pose with the SAME square box (union of all silhouettes) so Tuu keeps one scale and
// baseline across poses, (3) resize to 512 px and write a palette PNG (small, still smooth at 3x @ ~170 pt).
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(repo, 'assets', 'mascot');
const outDir = join(repo, 'apps', 'mobile', 'assets', 'mascot');
const SIZE = 512;
const ALPHA_FLOOR = 32; // alpha below this is treated as background (removes stray edge specks)
const PAD = 0.03; // padding around the union box, relative to its side

/** Pose number -> source/app asset name. */
const POSES = {
  1: 'tuu_01_idle_front',
  2: 'tuu_02_walk_forward',
  3: 'tuu_03_wave_hello',
  4: 'tuu_04_pointing_direction',
  5: 'tuu_05_listening',
  6: 'tuu_06_thinking',
  7: 'tuu_07_map_planning',
  8: 'tuu_08_presenting',
  9: 'tuu_09_excited_jump',
  10: 'tuu_10_sit_relaxed',
};

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir);
const sources = Object.entries(POSES).map(([key, name]) => {
  const n = Number(key);
  // `-1.png` must not match `-10.png`: the number is anchored between "-" and ".png".
  const file =
    files.find((f) => f.toLowerCase() === `${name}.png`) ??
    files.find((f) => Number(/-(\d+)\.png$/i.exec(f)?.[1]) === n);
  if (!file) throw new Error(`missing source for ${name} in ${srcDir}`);
  return { file, n };
});

/** Load RGBA pixels with the alpha floor applied, and the tight bounding box of the silhouette. */
async function load(file) {
  const { data, info } = await sharp(join(srcDir, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let [x0, y0, x1, y1] = [info.width, info.height, -1, -1];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4 + 3;
      if (data[i] < ALPHA_FLOOR) {
        data[i] = 0;
        continue;
      }
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return { data, info, box: { x0, y0, x1, y1 } };
}

const loaded = [];
for (const s of sources) loaded.push({ ...s, ...(await load(s.file)) });

const { width: W, height: H } = loaded[0].info;
const u = loaded.reduce(
  (a, { box: b }) => ({
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }),
  { x0: W, y0: H, x1: 0, y1: 0 },
);
const side = Math.min(Math.max(W, H), Math.round(Math.max(u.x1 - u.x0 + 1, u.y1 - u.y0 + 1) * (1 + 2 * PAD)));
const cx = (u.x0 + u.x1) / 2;
const cy = (u.y0 + u.y1) / 2;
const left = Math.max(0, Math.min(W - side, Math.round(cx - side / 2)));
const top = Math.max(0, Math.min(H - side, Math.round(cy - side / 2)));

let total = 0;
for (const { n, data, info } of loaded) {
  const target = join(outDir, `${POSES[n]}.png`);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE)
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toFile(target);
  total += statSync(target).size;
  console.log(`${POSES[n]}.png  ${(statSync(target).size / 1024).toFixed(1)} KB`);
}
console.log(`crop ${side}px @ (${left},${top}) -> ${SIZE}px, total ${(total / 1024).toFixed(1)} KB`);
