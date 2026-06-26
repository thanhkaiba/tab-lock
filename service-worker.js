import { contentModule } from './content.js';

const LockRegistry = (() => {
  const state = new Map();

  function renderIcon(tabId, locked) {
    const s = locked ? 'locked' : 'unlocked';
    chrome.action.setIcon({
      tabId,
      path: { 16: `icons/${s}-16.png`, 48: `icons/${s}-48.png`, 128: `icons/${s}-128.png` },
    });
    chrome.action.setTitle({ tabId, title: locked ? 'Tab Lock — Locked' : 'Tab Lock — Unlocked' });
  }

  function setState(tabId, locked) {
    state.set(tabId, locked);
    renderIcon(tabId, locked);
  }

  async function toggle(tabId, lock) {
    setState(tabId, lock);
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: contentModule,
        args: [lock ? 'lock' : 'unlock'],
      });
    } catch {
      // Silently ignore chrome:// pages and other restricted URLs
    }
  }

  function isLocked(tabId) {
    return state.get(tabId) ?? false;
  }

  function reset(tabId) {
    setState(tabId, false);
  }

  function remove(tabId) {
    state.delete(tabId);
  }

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    renderIcon(tabId, isLocked(tabId));
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' && isLocked(tabId)) {
      try {
        // Ping the content script: if the handler is still alive the page did a
        // SPA navigation and the lock should persist; if it's gone the page fully
        // reloaded and we must reset so SW state matches reality.
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => !!window.__tabLockHandler,
        });
        if (!result) setState(tabId, false);
      } catch {
        // Restricted URL or page gone — reset to be safe
        setState(tabId, false);
      }
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    state.delete(tabId);
  });

  return { toggle, isLocked };
})();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    sendResponse({ locked: LockRegistry.isLocked(message.tabId) });
  } else if (message.type === 'TOGGLE') {
    LockRegistry.toggle(message.tabId, message.lock).then(() => {
      sendResponse({ locked: LockRegistry.isLocked(message.tabId) });
    });
    return true; // keep channel open for async response
  }
});

// Stable seam for Playwright E2E tests
self.__tabLock = { toggle: LockRegistry.toggle, isLocked: LockRegistry.isLocked };
