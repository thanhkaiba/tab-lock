import sharp from 'sharp';
import { mkdir } from 'fs/promises';

await mkdir('icons', { recursive: true });

const lockedSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="6" y="16" width="52" height="32" rx="5" fill="#DC2626" stroke="#B91C1C" stroke-width="1"/>
  <rect x="11" y="22" width="6" height="5" rx="1" fill="#B91C1C"/>
  <rect x="20" y="22" width="6" height="5" rx="1" fill="#B91C1C"/>
  <rect x="29" y="22" width="6" height="5" rx="1" fill="#B91C1C"/>
  <rect x="38" y="22" width="6" height="5" rx="1" fill="#B91C1C"/>
  <rect x="13" y="30" width="6" height="5" rx="1" fill="#B91C1C"/>
  <rect x="22" y="30" width="6" height="5" rx="1" fill="#B91C1C"/>
  <rect x="31" y="30" width="6" height="5" rx="1" fill="#B91C1C"/>
  <rect x="40" y="30" width="6" height="5" rx="1" fill="#B91C1C"/>
  <rect x="17" y="38" width="30" height="5" rx="2" fill="#B91C1C"/>
  <circle cx="32" cy="32" r="20" fill="none" stroke="white" stroke-width="4"/>
  <line x1="18" y1="18" x2="46" y2="46" stroke="white" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const unlockedSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="6" y="16" width="52" height="32" rx="5" fill="#16A34A" stroke="#15803D" stroke-width="1"/>
  <rect x="11" y="22" width="6" height="5" rx="1" fill="#15803D"/>
  <rect x="20" y="22" width="6" height="5" rx="1" fill="#15803D"/>
  <rect x="29" y="22" width="6" height="5" rx="1" fill="#15803D"/>
  <rect x="38" y="22" width="6" height="5" rx="1" fill="#15803D"/>
  <rect x="13" y="30" width="6" height="5" rx="1" fill="#15803D"/>
  <rect x="22" y="30" width="6" height="5" rx="1" fill="#15803D"/>
  <rect x="31" y="30" width="6" height="5" rx="1" fill="#15803D"/>
  <rect x="40" y="30" width="6" height="5" rx="1" fill="#15803D"/>
  <rect x="17" y="38" width="30" height="5" rx="2" fill="#15803D"/>
</svg>`;

const sizes = [16, 48, 128];

for (const size of sizes) {
  await sharp(Buffer.from(lockedSvg)).resize(size, size).png().toFile(`icons/locked-${size}.png`);
  await sharp(Buffer.from(unlockedSvg)).resize(size, size).png().toFile(`icons/unlocked-${size}.png`);
  console.log(`Generated ${size}px icons`);
}

console.log('Done — icons/ is ready.');
