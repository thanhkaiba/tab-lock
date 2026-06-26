export function contentModule(action) {
  if (action === 'lock') {
    if (window.__tabLockHandler) return;

    window.__tabLockHandler = function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window === window.top) flashBorder();
    };

    document.addEventListener('keydown', window.__tabLockHandler, true);

    if (window === window.top) {
      injectBorder();
      document.activeElement?.blur();
    }
  } else {
    if (window.__tabLockHandler) {
      document.removeEventListener('keydown', window.__tabLockHandler, true);
      delete window.__tabLockHandler;
    }
    if (window === window.top) {
      const div = document.getElementById('tab-lock-border');
      if (div) div.remove();
    }
  }

  function injectBorder() {
    if (document.getElementById('tab-lock-border')) return;
    const div = document.createElement('div');
    div.id = 'tab-lock-border';
    div.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:2147483647;' +
      'box-shadow:inset 0 0 0 4px #ff3b30;transition:box-shadow 0.15s ease;';
    document.documentElement.appendChild(div);
  }

  function flashBorder() {
    const div = document.getElementById('tab-lock-border');
    if (!div) return;
    div.style.boxShadow = 'inset 0 0 0 7px #ff6b6b';
    setTimeout(() => {
      div.style.boxShadow = 'inset 0 0 0 4px #ff3b30';
    }, 150);
  }
}
