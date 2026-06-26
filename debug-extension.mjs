import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = __dirname;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-lock-debug-'));

console.log('Trying channel: msedge');
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'msedge',
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
  ],
});

context.on('serviceworker', (sw) => console.log('SW event:', sw.url()));

const page = await context.newPage();
await page.goto('https://example.com');
await new Promise(r => setTimeout(r, 3000));

console.log('Service workers:', context.serviceWorkers().map(sw => sw.url()));

const cdp = await context.newCDPSession(page);
const { targetInfos } = await cdp.send('Target.getTargets');
console.log('\nAll targets:');
targetInfos.forEach(t => console.log(` type=${t.type} url=${t.url}`));

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
