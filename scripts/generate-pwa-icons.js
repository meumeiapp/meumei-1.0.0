import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, 'assets', 'meumei.png');
const publicDir = path.join(projectRoot, 'public');

if (!fs.existsSync(sourcePath)) {
  console.error('[pwa-icons] source not found:', sourcePath);
  process.exit(1);
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const writePng = async (size, filename) => {
  await sharp(sourcePath).resize(size, size).png().toFile(path.join(publicDir, filename));
};

const writeMaskable = async () => {
  const size = 512;
  const innerSize = Math.round(size * 0.7);
  const iconBuffer = await sharp(sourcePath).resize(innerSize, innerSize).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: iconBuffer, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512-maskable.png'));
};

const run = async () => {
  await writePng(192, 'pwa-192x192.png');
  await writePng(512, 'pwa-512x512.png');
  await writeMaskable();
  await writePng(180, 'apple-touch-icon.png');
  await writePng(32, 'favicon-32x32.png');
  console.info('[pwa-icons] generated icons in public/');
};

run().catch((error) => {
  console.error('[pwa-icons] failed', error);
  process.exit(1);
});
