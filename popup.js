document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('lock-toggle');
  const label = document.getElementById('status-label');

  // URL param lets Playwright tests inject a specific tabId without relying on
  // chrome.tabs.query, which returns the popup tab itself when navigated directly.
  const params = new URLSearchParams(location.search);
  const tabId = params.has('tabId')
    ? parseInt(params.get('tabId'), 10)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

  if (tabId == null) return;

  toggle.addEventListener('change', async () => {
    const { locked } = await chrome.runtime.sendMessage({ type: 'TOGGLE', tabId, lock: toggle.checked });
    render(locked);
  });

  const { locked } = await chrome.runtime.sendMessage({ type: 'GET_STATE', tabId });
  render(locked);

  function render(locked) {
    toggle.checked = locked;
    label.textContent = locked ? 'Locked' : 'Unlocked';
  }
});
