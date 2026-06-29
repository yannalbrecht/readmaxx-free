// Rasterizes assets/icon.svg into the PNG icons the PWA + iOS need.
// Run: node scripts/gen-icons.mjs   (requires: npm i -D sharp)
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = join(root, 'assets', 'icon.svg');
const out = join(root, 'icons');
await mkdir(out, { recursive: true });

// Standard (transparent corners baked into the rounded SVG) icons.
const sizes = [120, 152, 167, 180, 192, 256, 384, 512, 1024];
for (const s of sizes) {
  await sharp(svg).resize(s, s).png().toFile(join(out, `icon-${s}.png`));
}
// apple-touch-icon must be a flat 180 square (iOS adds its own mask/corners).
await sharp(svg).resize(180, 180).flatten({ background: '#0e0a1c' }).png()
  .toFile(join(out, 'apple-touch-icon.png'));

// Maskable: extra safe-zone padding so Android adaptive masks don't clip art.
const pad = Math.round(512 * 0.12);
await sharp(svg).resize(512 - pad * 2, 512 - pad * 2)
  .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#0e0a1c' })
  .png().toFile(join(out, 'maskable-512.png'));

console.log('icons generated ->', out);
