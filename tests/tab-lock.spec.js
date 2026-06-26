import { test as base, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..');

const TEST_HTML = `<!DOCTYPE html><html><body>
<input id="inp" type="text" placeholder="type here"/>
<iframe id="frame" src="/iframe"></iframe>
</body></html>`;

const IFRAME_HTML = `<!DOCTYPE html><html><body>
<input id="inner" type="text"/>
</body></html>`;

// ─── Custom fixtures ──────────────────────────────────────────────────────────

const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-lock-test-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'msedge',
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },

  serviceWorker: async ({ context }, use) => {
    // Set up the promise BEFORE navigating — SW fires on first page navigation
    const swPromise = new Promise((resolve) => {
      const existing = context.serviceWorkers();
      if (existing.length > 0) { resolve(existing[0]); return; }
      context.once('serviceworker', resolve);
    });
    // Trigger the SW by navigating a temp page to the test server
    const trigger = await context.newPage();
    await trigger.goto(`http://127.0.0.1:${serverPort}/`);
    const sw = await Promise.race([
      swPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Service worker not found after 15s')), 15000)
      ),
    ]);
    await trigger.close();
    await use(sw);
  },
});

// ─── HTTP test server ─────────────────────────────────────────────────────────

let testServer;
let serverPort;

test.beforeAll(async () => {
  await new Promise((resolve) => {
    testServer = http.createServer((req, res) => {
      if (req.url === '/iframe') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(IFRAME_HTML);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(TEST_HTML);
      }
    });
    testServer.listen(0, '127.0.0.1', () => {
      serverPort = testServer.address().port;
      resolve();
    });
  });
});

test.afterAll(async () => {
  await new Promise((resolve) => testServer.close(resolve));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function testUrl() {
  return `http://127.0.0.1:${serverPort}/`;
}

async function getTabId(sw, url) {
  return sw.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === url || t.url?.startsWith(url));
    return tab?.id ?? null;
  }, url);
}

async function lockTab(sw, tabId) {
  await sw.evaluate((tabId) => self.__tabLock.toggle(tabId, true), tabId);
}

async function unlockTab(sw, tabId) {
  await sw.evaluate((tabId) => self.__tabLock.toggle(tabId, false), tabId);
}

function popupUrl(sw, tabId) {
  const extensionId = new URL(sw.url()).hostname;
  return `chrome-extension://${extensionId}/popup.html?tabId=${tabId}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Tab Lock', () => {
  test('keyboard blocked after lock, restored after unlock', async ({ page, serviceWorker }) => {
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    const input = page.locator('#inp');
    await input.click();
    await page.keyboard.type('hello');
    await expect(input).toHaveValue('hello');

    await input.fill('');
    const tabId = await getTabId(serviceWorker, testUrl());
    expect(tabId).not.toBeNull();

    await lockTab(serviceWorker, tabId);
    await page.waitForTimeout(200);

    await input.click();
    await page.keyboard.type('world');
    await expect(input).toHaveValue('');

    await unlockTab(serviceWorker, tabId);
    await page.waitForTimeout(200);

    await input.click();
    await page.keyboard.type('back');
    await expect(input).toHaveValue('back');
  });

  test('red border present when locked, absent when unlocked', async ({ page, serviceWorker }) => {
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    await expect(page.locator('#tab-lock-border')).toHaveCount(0);

    const tabId = await getTabId(serviceWorker, testUrl());
    await lockTab(serviceWorker, tabId);
    await page.waitForTimeout(200);

    await expect(page.locator('#tab-lock-border')).toHaveCount(1);

    await unlockTab(serviceWorker, tabId);
    await page.waitForTimeout(200);

    await expect(page.locator('#tab-lock-border')).toHaveCount(0);
  });

  test('active element blurred on lock', async ({ page, serviceWorker }) => {
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    await page.locator('#inp').click();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('inp');

    const tabId = await getTabId(serviceWorker, testUrl());
    await lockTab(serviceWorker, tabId);
    await page.waitForTimeout(200);

    const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(tag).toBe('body');
  });

  test('icon tooltip reflects lock state', async ({ page, serviceWorker }) => {
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    const tabId = await getTabId(serviceWorker, testUrl());
    expect(tabId).not.toBeNull();

    expect(
      await serviceWorker.evaluate(async (id) => chrome.action.getTitle({ tabId: id }), tabId)
    ).toBe('Tab Lock — Unlocked');

    await lockTab(serviceWorker, tabId);
    expect(
      await serviceWorker.evaluate(async (id) => chrome.action.getTitle({ tabId: id }), tabId)
    ).toBe('Tab Lock — Locked');

    await unlockTab(serviceWorker, tabId);
    expect(
      await serviceWorker.evaluate(async (id) => chrome.action.getTitle({ tabId: id }), tabId)
    ).toBe('Tab Lock — Unlocked');
  });

  test('two tabs locked independently', async ({ context, serviceWorker }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await pageA.goto(`${testUrl()}?a=1`);
    await pageB.goto(`${testUrl()}?b=1`);
    await pageA.waitForLoadState('load');
    await pageB.waitForLoadState('load');

    const idA = await getTabId(serviceWorker, `${testUrl()}?a=1`);
    const idB = await getTabId(serviceWorker, `${testUrl()}?b=1`);
    expect(idA).not.toBeNull();
    expect(idB).not.toBeNull();

    await lockTab(serviceWorker, idA);
    await pageA.waitForTimeout(200);

    // Tab A: blocked
    await expect(pageA.locator('#tab-lock-border')).toHaveCount(1);
    await pageA.locator('#inp').click();
    await pageA.keyboard.type('nope');
    await expect(pageA.locator('#inp')).toHaveValue('');

    // Tab B: free
    await expect(pageB.locator('#tab-lock-border')).toHaveCount(0);
    await pageB.locator('#inp').click();
    await pageB.keyboard.type('yes');
    await expect(pageB.locator('#inp')).toHaveValue('yes');

    await pageA.close();
    await pageB.close();
  });

  test('lock resets on navigation', async ({ page, serviceWorker }) => {
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    const tabId = await getTabId(serviceWorker, testUrl());
    await lockTab(serviceWorker, tabId);
    await page.waitForTimeout(200);
    await expect(page.locator('#tab-lock-border')).toHaveCount(1);

    await page.goto('about:blank');
    await page.waitForTimeout(300);
    await page.goto(testUrl());
    await page.waitForLoadState('load');
    await page.waitForTimeout(200);

    await expect(page.locator('#tab-lock-border')).toHaveCount(0);
    const input = page.locator('#inp');
    await input.click();
    await page.keyboard.type('alive');
    await expect(input).toHaveValue('alive');
  });

  test('icon tooltip stays Locked after switching tabs and returning', async ({ context, serviceWorker }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await pageA.goto(`${testUrl()}?a=1`);
    await pageB.goto(`${testUrl()}?b=1`);
    await pageA.waitForLoadState('load');
    await pageB.waitForLoadState('load');

    const idA = await getTabId(serviceWorker, `${testUrl()}?a=1`);
    await lockTab(serviceWorker, idA);

    // Switch away to Tab B, then return to Tab A
    await pageB.bringToFront();
    await pageA.bringToFront();
    await pageA.waitForTimeout(200);

    expect(
      await serviceWorker.evaluate(async (id) => chrome.action.getTitle({ tabId: id }), idA)
    ).toBe('Tab Lock — Locked');

    await pageA.close();
    await pageB.close();
  });

  test('keyboard stays blocked after switching to another tab and returning', async ({ context, serviceWorker }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await pageA.goto(`${testUrl()}?a=1`);
    await pageB.goto(`${testUrl()}?b=1`);
    await pageA.waitForLoadState('load');
    await pageB.waitForLoadState('load');

    const idA = await getTabId(serviceWorker, `${testUrl()}?a=1`);
    await lockTab(serviceWorker, idA);
    await pageA.waitForTimeout(200);

    // Switch away to Tab B, then return to Tab A
    await pageB.bringToFront();
    await pageA.bringToFront();
    await pageA.waitForTimeout(200);

    const input = pageA.locator('#inp');
    await input.click();
    await pageA.keyboard.type('nope');
    await expect(input).toHaveValue('');

    await pageA.close();
    await pageB.close();
  });

  test('lock persists across SPA navigation (pushState)', async ({ page, serviceWorker }) => {
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    const tabId = await getTabId(serviceWorker, testUrl());
    await lockTab(serviceWorker, tabId);
    await page.waitForTimeout(200);

    // Simulate SPA navigation — same page, URL changes via pushState, no reload
    await page.evaluate(() => history.pushState({}, '', '/?spa=1'));
    await page.waitForTimeout(400);

    // Lock must still be active
    await expect(page.locator('#tab-lock-border')).toHaveCount(1);
    const input = page.locator('#inp');
    await input.click();
    await page.keyboard.type('nope');
    await expect(input).toHaveValue('');

    expect(
      await serviceWorker.evaluate(async (id) => chrome.action.getTitle({ tabId: id }), tabId)
    ).toBe('Tab Lock — Locked');
  });

  test('keyboard blocked inside iframe when tab is locked', async ({ page, serviceWorker }) => {
    await page.goto(testUrl());
    await page.waitForLoadState('load');
    await page.waitForTimeout(400);

    const tabId = await getTabId(serviceWorker, testUrl());
    await lockTab(serviceWorker, tabId);
    await page.waitForTimeout(300);

    const frameInput = page.frameLocator('#frame').locator('#inner');
    await frameInput.click();
    await page.keyboard.type('blocked');
    await expect(frameInput).toHaveValue('');
  });
});

// ─── Popup tests ──────────────────────────────────────────────────────────────

test.describe('Popup UI', () => {
  test('shows Unlocked state on an unlocked tab', async ({ context, serviceWorker }) => {
    const page = await context.newPage();
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    const tabId = await getTabId(serviceWorker, testUrl());
    expect(tabId).not.toBeNull();

    const popup = await context.newPage();
    await popup.goto(popupUrl(serviceWorker, tabId));
    await popup.waitForLoadState('domcontentloaded');

    await expect(popup.locator('#status-label')).toHaveText('Unlocked');
    await expect(popup.locator('#lock-toggle')).not.toBeChecked();

    await popup.close();
    await page.close();
  });

  test('shows Locked state on an already-locked tab', async ({ context, serviceWorker }) => {
    const page = await context.newPage();
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    const tabId = await getTabId(serviceWorker, testUrl());
    await lockTab(serviceWorker, tabId);

    const popup = await context.newPage();
    await popup.goto(popupUrl(serviceWorker, tabId));
    await popup.waitForLoadState('domcontentloaded');

    await expect(popup.locator('#status-label')).toHaveText('Locked');
    await expect(popup.locator('#lock-toggle')).toBeChecked();

    await popup.close();
    await page.close();
  });

  test('clicking toggle locks tab — label becomes Locked and keyboard blocked', async ({ context, serviceWorker }) => {
    const page = await context.newPage();
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    const tabId = await getTabId(serviceWorker, testUrl());
    expect(tabId).not.toBeNull();

    const popup = await context.newPage();
    await popup.goto(popupUrl(serviceWorker, tabId));
    await expect(popup.locator('#status-label')).toHaveText('Unlocked'); // wait for GET_STATE to settle

    await popup.locator('label.toggle').click();
    await expect(popup.locator('#status-label')).toHaveText('Locked');
    await expect(popup.locator('#lock-toggle')).toBeChecked();

    await page.waitForTimeout(200);
    const input = page.locator('#inp');
    await input.click();
    await page.keyboard.type('nope');
    await expect(input).toHaveValue('');

    await popup.close();
    await page.close();
  });

  test('clicking toggle unlocks tab — label becomes Unlocked and keyboard restored', async ({ context, serviceWorker }) => {
    const page = await context.newPage();
    await page.goto(testUrl());
    await page.waitForLoadState('load');

    const tabId = await getTabId(serviceWorker, testUrl());
    await lockTab(serviceWorker, tabId);

    const popup = await context.newPage();
    await popup.goto(popupUrl(serviceWorker, tabId));
    await expect(popup.locator('#status-label')).toHaveText('Locked'); // wait for GET_STATE to settle

    await popup.locator('label.toggle').click();
    await expect(popup.locator('#status-label')).toHaveText('Unlocked');
    await expect(popup.locator('#lock-toggle')).not.toBeChecked();

    await page.waitForTimeout(200);
    const input = page.locator('#inp');
    await input.click();
    await page.keyboard.type('back');
    await expect(input).toHaveValue('back');

    await popup.close();
    await page.close();
  });
});
