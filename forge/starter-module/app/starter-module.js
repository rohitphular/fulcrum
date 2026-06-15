'use strict';

// ─── state ────────────────────────────────────────────────────────────────────
let items      = [];
let editingId  = null;
let deletingId = null;

// ─── helpers ──────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (_) { return '—'; }
}

// ─── loading bar ──────────────────────────────────────────────────────────────
function showLoading() { el('loadingBar').classList.remove('hidden'); }
function hideLoading() { el('loadingBar').classList.add('hidden'); }

// ─── theme ────────────────────────────────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('forge_theme', theme);
  const btn = el('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☽';
}

// ─── message banner ───────────────────────────────────────────────────────────
function showMsg(text, type = 'info') {
  const b = el('msgBanner');
  el('msgText').innerHTML = text;
  el('msgIco').textContent = type === 'warn' ? '!' : '›';
  b.className = `banner ${type === 'warn' ? 'warn' : 'success'}`;
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(() => b.classList.add('hidden'), 4000);
}

// ─── PIN gate ─────────────────────────────────────────────────────────────────
function showPinGate() { el('pinOverlay').classList.remove('hidden'); el('pinInput').focus(); }
function hidePinGate() { el('pinOverlay').classList.add('hidden'); }

function pinError(msg) {
  el('pinError').textContent = msg;
  el('pinInput').classList.add('shake');
  el('pinInput').addEventListener('animationend', () => el('pinInput').classList.remove('shake'), { once: true });
}

async function fetchGeo() {
  try {
    const data = await fetch('https://ipapi.co/json/').then(r => r.json());
    return { ip: data.ip || 'unknown', city: data.city || '', country: data.country_name || '', ua: navigator.userAgent };
  } catch (_) {
    return { ip: 'unknown', city: '', country: '', ua: navigator.userAgent };
  }
}

async function submitPin() {
  const pin  = el('pinInput').value.trim();
  const totp = el('totpInput').value.trim();

  if (!pin)                   { pinError('Enter your PIN.'); el('pinInput').focus(); return; }
  if (!totp)                  { pinError('Enter your authenticator code.'); el('totpInput').focus(); return; }
  if (!/^\d{6}$/.test(totp)) { pinError('Code must be 6 digits.'); el('totpInput').focus(); return; }

  el('pinSubmit').disabled = true;
  el('pinError').textContent = 'Connecting…';

  const meta = await fetchGeo();
  SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin, meta });

  try {
    const res = await SheetsClient.verify(totp);
    if (res.ok) {
      sessionStorage.setItem('forge_pin', pin);
      hidePinGate();
      await loadItems();
    } else if (res.error === 'locked') {
      pinError('Access locked. Contact admin to unlock.');
    } else if (res.error === 'totp_invalid') {
      pinError('Wrong authenticator code. Try again.');
      el('totpInput').value = '';
      el('totpInput').focus();
      el('pinSubmit').disabled = false;
    } else {
      pinError('Wrong PIN. Try again.');
      el('pinInput').focus();
      el('pinSubmit').disabled = false;
    }
  } catch (_) {
    pinError('Connection failed. Check the Script URL in config.js.');
    el('pinSubmit').disabled = false;
  }
}

// ─── load data ────────────────────────────────────────────────────────────────
async function loadItems() {
  showLoading();
  try {
    const res = await SheetsClient.list();
    if (!res.ok) {
      if (res.error === 'locked') { sessionStorage.removeItem('forge_pin'); pinError('Access locked.'); showPinGate(); return; }
      if (res.error === 'auth')   { sessionStorage.removeItem('forge_pin'); showPinGate(); return; }
      showMsg('Failed to load items: ' + (res.error || 'unknown error'), 'warn');
      return;
    }
    items = res.data || [];
    renderTable();
  } catch (_) {
    el('tableBody').innerHTML = '<tr class="empty-row"><td colspan="5" style="color:var(--ember)">Connection error. Check your network.</td></tr>';
  } finally {
    hideLoading();
  }
}

// ─── form ─────────────────────────────────────────────────────────────────────
function resetForm() {
  editingId = null;
  el('itemForm').reset();
  el('formTitle').textContent = 'Add Item';
  el('submitBtn').textContent = 'Add Item';
  el('cancelEditBtn').classList.add('hidden');
  el('fieldNameWrap').classList.remove('error');
}

function startEdit(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  editingId = id;
  el('fieldName').value        = item.name        || '';
  el('fieldDescription').value = item.description || '';
  el('fieldStatus').value      = item.status      || 'active';
  el('formTitle').textContent  = 'Edit Item';
  el('submitBtn').textContent  = 'Update Item';
  el('cancelEditBtn').classList.remove('hidden');
  el('fieldNameWrap').classList.remove('error');
  el('fieldName').focus();
  el('fieldName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function handleSubmit(e) {
  e.preventDefault();

  const name        = el('fieldName').value.trim();
  const description = el('fieldDescription').value.trim();
  const status      = el('fieldStatus').value;

  if (!name) { el('fieldNameWrap').classList.add('error'); el('fieldName').focus(); return; }
  el('fieldNameWrap').classList.remove('error');

  el('submitBtn').disabled = true;
  el('formSpinner').classList.remove('hidden');

  try {
    const res = editingId
      ? await SheetsClient.update(editingId, { name, description, status })
      : await SheetsClient.create({ name, description, status });

    if (res.ok) {
      showMsg(editingId ? 'Item updated.' : 'Item added.');
      resetForm();
      await loadItems();
    } else {
      showMsg('Save failed: ' + (res.error || 'unknown error'), 'warn');
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
  } finally {
    el('submitBtn').disabled = false;
    el('formSpinner').classList.add('hidden');
  }
}

// ─── delete ───────────────────────────────────────────────────────────────────
function startDelete(id)  { deletingId = id; renderTable(); }
function cancelDelete()   { deletingId = null; renderTable(); }

async function confirmDelete() {
  const id = deletingId;
  deletingId = null;
  const btn = document.querySelector('[data-action="confirm-delete"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    const res = await SheetsClient.remove(id);
    if (res.ok) {
      showMsg('Item deleted.');
      await loadItems();
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown error'), 'warn');
      renderTable();
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    renderTable();
  }
}

// ─── render table ─────────────────────────────────────────────────────────────
function renderTable() {
  const tbody = el('tableBody');

  if (!items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No items yet — add one above.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const badge = `<span class="badge badge-${esc(item.status)}">${esc(item.status)}</span>`;
    const desc  = item.description ? esc(item.description) : '<span style="color:var(--muted)">—</span>';

    if (deletingId === item.id) {
      return `<tr>
        <td class="td-name">${esc(item.name)}</td>
        <td colspan="3"><span class="confirm-text">Delete &ldquo;<strong>${esc(item.name)}</strong>&rdquo;?</span></td>
        <td><div class="row-actions">
          <button class="btn-link danger" data-action="confirm-delete">Yes, delete</button>
          <button class="btn-link" data-action="cancel-delete">Cancel</button>
        </div></td>
      </tr>`;
    }

    return `<tr>
      <td class="td-name">${esc(item.name)}</td>
      <td class="td-desc">${desc}</td>
      <td>${badge}</td>
      <td class="td-mono">${fmtDate(item.created_at)}</td>
      <td><div class="row-actions">
        <button class="btn-link" data-action="edit" data-id="${esc(item.id)}">Edit</button>
        <button class="btn-link danger" data-action="delete" data-id="${esc(item.id)}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ─── events ───────────────────────────────────────────────────────────────────
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

// ─── init ─────────────────────────────────────────────────────────────────────
(function init() {
  if (window.__configMissing || !window.CONFIG?.SCRIPT_URL) {
    el('setupBanner').classList.remove('hidden');
    el('pinOverlay').classList.add('hidden');
    el('tableBody').innerHTML = '<tr class="empty-row"><td colspan="5">Waiting for config.js…</td></tr>';
    return;
  }

  const savedTheme = localStorage.getItem('forge_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);

  const pin = sessionStorage.getItem('forge_pin');
  if (pin) {
    SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin });
    loadItems();
  } else {
    showPinGate();
  }
})();
