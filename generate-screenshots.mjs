import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { mkdir } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '.');

await mkdir('store-assets', { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-lock-screenshot-'));

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'msedge',
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
    '--window-size=1280,900',
  ],
  viewport: { width: 1280, height: 800 },
});

// Set up SW listener before first navigation
const swPromise = new Promise((resolve) => {
  const existing = context.serviceWorkers();
  if (existing.length > 0) { resolve(existing[0]); return; }
  context.once('serviceworker', resolve);
});

async function getTabId(url) {
  return sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => t.url?.startsWith(url));
    return tab?.id ?? null;
  }, url);
}

async function lockTab(tabId) {
  await sw.evaluate(tabId => self.__tabLock.toggle(tabId, true), tabId);
}

async function unlockTab(tabId) {
  await sw.evaluate(tabId => self.__tabLock.toggle(tabId, false), tabId);
}

// --- Screenshot 1: google.com unlocked ---
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('https://www.google.com');
await page.waitForLoadState('load');

const sw = await swPromise;

await page.waitForTimeout(2000);
await page.screenshot({ path: 'store-assets/01-google-unlocked.png' });
console.log('1/5 google unlocked ✓');

// --- Screenshot 2: google.com locked ---
const googleTabId = await getTabId('https://www.google.com');
await lockTab(googleTabId);
await page.waitForTimeout(500);
await page.screenshot({ path: 'store-assets/02-google-locked.png' });
console.log('2/5 google locked ✓');
await unlockTab(googleTabId);

// --- Screenshot 3: youtube.com locked ---
await page.goto('https://www.youtube.com');
await page.waitForLoadState('load');
await page.waitForTimeout(3000);
const ytTabId = await getTabId('https://www.youtube.com');
await lockTab(ytTabId);
await page.waitForTimeout(500);
await page.screenshot({ path: 'store-assets/03-youtube-locked.png' });
console.log('3/5 youtube locked ✓');
await unlockTab(ytTabId);

// --- Screenshot 4: popup unlocked ---
const extensionId = new URL(sw.url()).hostname;
const popupPage = await context.newPage();
await popupPage.setViewportSize({ width: 640, height: 400 });
await popupPage.goto(`chrome-extension://${extensionId}/popup.html?tabId=${ytTabId}`);
await popupPage.waitForLoadState('domcontentloaded');
await popupPage.waitForTimeout(400);
await popupPage.evaluate(() => {
  document.body.style.cssText += 'zoom:3; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; background:#f0f0f0;';
});
await popupPage.screenshot({ path: 'store-assets/04-popup-unlocked.png' });
console.log('4/5 popup unlocked ✓');

// --- Screenshot 5: popup locked ---
await lockTab(ytTabId);
await popupPage.goto(`chrome-extension://${extensionId}/popup.html?tabId=${ytTabId}`);
await popupPage.waitForLoadState('domcontentloaded');
await popupPage.waitForTimeout(400);
await popupPage.evaluate(() => {
  document.body.style.cssText += 'zoom:3; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; background:#f0f0f0;';
});
await popupPage.screenshot({ path: 'store-assets/05-popup-locked.png' });
console.log('5/5 popup locked ✓');

await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });

console.log('\nDone — store-assets/ is ready.');
