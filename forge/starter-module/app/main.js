/* global SheetsClient */
import { state } from './core/state.js';
import { el } from './core/utils.js';
import { showLoading, hideLoading, showMsg } from './core/ui.js';
import { showPinGate, hidePinGate, submitPin, readSession, clearSession } from './core/auth.js';
import { StarterAPI } from './core/api.js';
import { renderItems, resetForm, startEdit, startDelete, confirmDelete, cancelDelete, handleSubmit } from './sections/items.js';

async function loadItems() {
  showLoading();
  try {
    const res = await StarterAPI.list();
    if (!res.ok) {
      if (res.error === 'locked') { clearSession(); showPinGate(); return; }
      if (res.error === 'auth')   { clearSession(); showPinGate(); return; }
      showMsg('Failed to load items: ' + (res.error || 'unknown error'), 'warn');
      return;
    }
    state.items = res.data || [];
    renderItems();
  } catch (_) {
    el('tableBody').innerHTML = '<tr class="empty-row"><td colspan="5" style="color:var(--ember)">Connection error. Check your network.</td></tr>';
  } finally {
    hideLoading();
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sm_theme', theme);
  const btn = el('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☽';
}

document.addEventListener('sm:reload', loadItems);

el('tableBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'edit')           startEdit(id);
  if (action === 'delete')         startDelete(id);
  if (action === 'confirm-delete') confirmDelete();
  if (action === 'cancel-delete')  cancelDelete();
});

el('itemForm').addEventListener('submit', handleSubmit);
el('cancelEditBtn').addEventListener('click', resetForm);

el('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
});

el('pinSubmit').addEventListener('click', submitPin);
el('pinInput').addEventListener('keydown',  e => { if (e.key === 'Enter') { e.preventDefault(); el('totpInput').focus(); } });
el('totpInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

(function init() {
  if (window.__configMissing || !window.CONFIG?.SCRIPT_URL) {
    hidePinGate();
    el('setupBanner').classList.remove('hidden');
    el('tableBody').innerHTML = '<tr class="empty-row"><td colspan="5">Waiting for config.js…</td></tr>';
    return;
  }

  const savedTheme = localStorage.getItem('sm_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);

  const session = readSession();
  if (session) {
    SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin: session.pin });
    hidePinGate();
    loadItems();
  } else {
    showPinGate();
  }
})();
