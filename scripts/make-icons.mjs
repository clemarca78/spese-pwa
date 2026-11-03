// Genera le icone PNG della PWA da public/icon.svg:  node scripts/make-icons.mjs
import sharp from 'sharp';

for (const size of [192, 512]) {
  await sharp('public/icon.svg').resize(size, size).png().toFile(`public/icon-${size}.png`);
}
console.log('icone generate');
