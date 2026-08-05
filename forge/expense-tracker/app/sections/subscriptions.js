import { state } from '../core/state.js';
import { el, esc, getSymbol, toBase, openContextMenu, closeContextMenu } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { ExpenseAPI } from '../core/api.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQUENCIES = [
  { value: 'weekly',    label: 'Weekly'    },
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual',    label: 'Annual'    },
];

const DOW_LABELS = [
  { value: '1', label: 'Monday'    },
  { value: '2', label: 'Tuesday'   },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday'  },
  { value: '5', label: 'Friday'    },
  { value: '6', label: 'Saturday'  },
  { value: '7', label: 'Sunday'    },
];

// ── Category helpers ──────────────────────────────────────────────────────────

const TX_TYPES = [
  { value: 'money-out',      label: 'Money out'      },
  { value: 'money-in',       label: 'Money in'       },
  { value: 'money-transfer', label: 'Money transfer' },
];

function _txTypeOpts(selectedVal = '') {
  return `<option value="">— select —</option>` +
    TX_TYPES.map(t => {
      const sel = selectedVal === t.value ? 'selected' : '';
      return `<option value="${esc(t.value)}" ${sel}>${esc(t.label)}</option>`;
    }).join('');
}

function _majorOpts(txType, selectedVal = '') {
  if (!txType) return `<option value="">— select type first —</option>`;
  const cats = state.categories.filter(c =>
    c.is_subscription_eligible === true && c.transaction_type === txType
  );
  const seen = new Map();
  cats.forEach(c => {
    if (!seen.has(c.major_category)) {
      const active = cats.some(x => x.major_category === c.major_category && x.is_active === true);
      seen.set(c.major_category, active);
    }
  });
  return `<option value="">— select —</option>` +
    [...seen.entries()].map(([label, active]) => {
      const sel = selectedVal === label ? 'selected' : '';
      return active
        ? `<option value="${esc(label)}" ${sel}>${esc(label)}</option>`
        : `<option value="${esc(label)}" ${sel} disabled style="color:var(--muted)">${esc(label)} (archived)</option>`;
    }).join('');
}

function _minorOpts(txType, major, selectedVal = '') {
  if (!major) return `<option value="">— select major first —</option>`;
  const cats = state.categories.filter(c =>
    c.is_subscription_eligible === true && c.transaction_type === txType && c.major_category === major
  );
  return `<option value="">— select —</option>` +
    cats.map(c => {
      const sel = selectedVal === c.minor_category ? 'selected' : '';
      return c.is_active === true
        ? `<option value="${esc(c.minor_category)}" ${sel}>${esc(c.minor_category)}</option>`
        : `<option value="${esc(c.minor_category)}" ${sel} disabled style="color:var(--muted)">${esc(c.minor_category)} (archived)</option>`;
    }).join('');
}

// ── Monthly-cost estimate ─────────────────────────────────────────────────────

function _toMonthly(amount, frequency) {
  const n = parseFloat(amount) || 0;
  if (frequency === 'weekly')    return n * 4.33;
  if (frequency === 'monthly')   return n;
  if (frequency === 'quarterly') return n / 3;
  if (frequency === 'annual')    return n / 12;
  return n;
}

// ── Day field HTML ─────────────────────────────────────────────────────────────

function _dayFieldHtml(frequency, dayVal = '') {
  if (frequency === 'weekly') {
    const opts = DOW_LABELS.map(d =>
      `<option value="${esc(d.value)}" ${String(dayVal) === d.value ? 'selected' : ''}>${esc(d.label)}</option>`
    ).join('');
    return `<label for="subDayOfWeek">Day of week</label><select id="subDayOfWeek">${opts}</select>`;
  }
  return `<label for="subDayOfMonth">Day of month</label>
    <input type="number" id="subDayOfMonth" min="1" max="31" step="1" value="${esc(String(dayVal || '1'))}">`;
}

// ── Form HTML ─────────────────────────────────────────────────────────────────

function _renderForm(sub = null) {
  const p      = state.subPrefill || {};
  const isEdit = sub !== null;

  const nameVal        = isEdit ? (sub.name             || '') : (p.name              || '');
  const cpVal          = isEdit ? (sub.counterparty_name || '') : (p.counterparty_name || '');
  const amountVal      = isEdit ? (sub.amount            || '') : (p.amount            || '');
  const currencyVal    = isEdit ? (sub.currency          || '') : (p.currency          || '');
  const freqVal        = isEdit ? (sub.frequency         || 'monthly') : (p.frequency || 'monthly');
  const srcAccVal      = isEdit ? (sub.source_account    || '') : (p.source_account   || '');
  const txTypeVal      = isEdit ? (sub.transaction_type  || '') : (p.transaction_type || '');
  const majorVal       = isEdit ? (sub.major_category    || '') : (p.major_category   || '');
  const minorVal       = isEdit ? (sub.minor_category    || '') : (p.minor_category   || '');
  const tagsVal        = isEdit ? (String(sub.tags       || '').replace(/;/g, ', ')) : (String(p.tags || '').replace(/;/g, ', '));
  const notesVal       = isEdit ? (sub.notes             || '') : '';
  const dayVal         = isEdit ? (sub.day_of_week || sub.day_of_month || '') : '';

  const freqOpts = FREQUENCIES.map(f =>
    `<option value="${esc(f.value)}" ${freqVal === f.value ? 'selected' : ''}>${esc(f.label)}</option>`
  ).join('');

  // Active accounts for source account dropdown
  const activeAccounts = state.accounts.filter(a => a.is_active === true);
  const accOpts = `<option value="">— select —</option>` +
    activeAccounts.map(a =>
      `<option value="${esc(a.id)}" ${a.id === srcAccVal ? 'selected' : ''}>${esc(a.name)} (${esc(a.currency)})</option>`
    ).join('');

  // Currency options — use unique currencies from active accounts plus current value
  const ccySet = new Set(activeAccounts.map(a => a.currency));
  if (currencyVal) ccySet.add(currencyVal);
  const ccyOpts = [...ccySet].map(c =>
    `<option value="${esc(c)}" ${c === currencyVal ? 'selected' : ''}>${esc(c)}</option>`
  ).join('');

  const header = isEdit ? `Editing: ${esc(sub.name)}` : 'New subscription';

  return `
  <div class="card" style="margin-bottom:20px">
    <div class="cat-form-header">${header}</div>
    <div class="form-grid form-grid-4">
      <div class="field form-grid-span-4">
        <label for="subName">Name *</label>
        <input type="text" id="subName" value="${esc(nameVal)}" placeholder="Netflix, Spotify, …">
      </div>
      <div class="field form-grid-span-4">
        <label for="subCounterparty">Counterparty name</label>
        <input type="text" id="subCounterparty" value="${esc(cpVal)}" placeholder="Netflix Inc.">
      </div>
      <div class="field">
        <label for="subAmount">Amount *</label>
        <input type="number" id="subAmount" min="0.01" step="0.01" placeholder="0.00" value="${esc(String(amountVal))}">
      </div>
      <div class="field">
        <label for="subCurrency">Currency *</label>
        <select id="subCurrency">${ccyOpts}</select>
      </div>
      <div class="field form-grid-span-2">
        <label for="subFrequency">Frequency *</label>
        <select id="subFrequency">${freqOpts}</select>
      </div>
      <div class="field form-grid-span-2" id="subDayWrap">
        ${_dayFieldHtml(freqVal, dayVal)}
      </div>
      <div class="field form-grid-span-2">
        <label for="subSourceAccount">Source account</label>
        <select id="subSourceAccount">${accOpts}</select>
      </div>
      <div class="field form-grid-span-2">
        <label for="subTxType">Transaction type</label>
        <select id="subTxType">${_txTypeOpts(txTypeVal)}</select>
      </div>
      <div class="field form-grid-span-2">
        <label for="subMajor">Major category</label>
        <select id="subMajor">${_majorOpts(txTypeVal, majorVal)}</select>
      </div>
      <div class="field form-grid-span-2">
        <label for="subMinor">Minor category</label>
        <select id="subMinor">${_minorOpts(txTypeVal, majorVal, minorVal)}</select>
      </div>
      <div class="field form-grid-span-4">
        <label for="subTags">Tags</label>
        <input type="text" id="subTags" value="${esc(tagsVal)}" placeholder="streaming, entertainment">
      </div>
      <div class="field form-grid-span-4">
        <label for="subNotes">Notes</label>
        <input type="text" id="subNotes" value="${esc(notesVal)}" placeholder="Optional note">
      </div>
      ${isEdit ? `
      <div class="field form-grid-span-4">
        <label class="field-check">
          <input type="checkbox" id="subIsActive" ${sub.is_active ? 'checked' : ''}> Active
        </label>
      </div>` : ''}
    </div>
    <div class="form-actions">
      <button class="btn btn-primary btn-sm" data-action="sub-save">Save</button>
      <button class="btn btn-secondary btn-sm" data-action="sub-cancel">Cancel</button>
    </div>
    <div class="pin-error" id="subFormError"></div>
  </div>`;
}

// ── Stats cards ───────────────────────────────────────────────────────────────

function _renderStats() {
  const subs   = state.subscriptions;
  const total  = subs.length;
  const active = subs.filter(s => s.is_active).length;
  const estMonthly = subs
    .filter(s => s.is_active)
    .reduce((sum, s) => {
      const monthly = _toMonthly(s.amount, s.frequency);
      return sum + toBase(monthly, s.currency, null);
    }, 0);

  const sym = getSymbol(state.quoteCurrency);

  return `
    <div class="summary-grid" style="margin-bottom:20px">
      <div class="summary-card">
        <div class="summary-card-label">Total</div>
        <div class="summary-card-value">${total}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Active</div>
        <div class="summary-card-value">${active}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Est. monthly cost</div>
        <div class="summary-card-value">${sym}${estMonthly.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      </div>
    </div>
    <p class="field-hint" style="margin-bottom:12px">Amounts converted to ${esc(state.quoteCurrency)}. Quarterly ÷ 3, Annual ÷ 12, Weekly × 4.33.</p>`;
}

// ── Card list ─────────────────────────────────────────────────────────────────

function _freqLabel(f) {
  return FREQUENCIES.find(x => x.value === f)?.label || f || '—';
}

function _renderSubCard(sub) {
  const row = sub._row;

  if (state.subDeleteRow === row) {
    return `
      <div class="sub-card">
        <span class="confirm-text">Delete <strong>${esc(sub.name)}</strong>?</span>
        <div class="row-actions" style="margin-top:6px">
          <button class="btn-link danger" data-action="sub-confirm-delete" data-row="${row}">Yes, delete</button>
          <button class="btn-link" data-action="sub-cancel-delete">Cancel</button>
        </div>
      </div>`;
  }

  const sym         = getSymbol(sub.currency);
  const amtFmt      = `${sym}${parseFloat(sub.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const freqLabel   = _freqLabel(sub.frequency);
  const badgeCls    = sub.is_active ? 'badge-in' : 'badge';
  const badgeTxt    = sub.is_active ? 'Active' : 'Paused';
  const inactiveCls = sub.is_active ? '' : ' sub-card-inactive';

  const accName  = state.accountMap[sub.source_account]?.name || '';
  const minorCat = sub.minor_category || '';
  const cpLabel  = sub.counterparty_name ? ` · ${sub.counterparty_name}` : '';
  const metaLine = [accName, minorCat].filter(Boolean).join(' · ') + cpLabel;

  const nextLine = sub.is_active && sub.next_payment_date
    ? `<div class="sub-card-next">Next: ${esc(sub.next_payment_date)}</div>`
    : '';

  return `
    <div class="sub-card${inactiveCls}">
      <div class="sub-card-top">
        <div class="sub-card-name-wrap">
          <span class="sub-card-name">${esc(sub.name)}</span>
          <span class="badge ${badgeCls}" style="font-size:var(--text-xs)">${badgeTxt}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="sub-card-amt">${esc(amtFmt)}/${esc(freqLabel.toLowerCase())}</div>
          <button class="tx-menu-trigger" data-action="sub-menu" data-row="${row}" title="Actions">⋯</button>
        </div>
      </div>
      ${nextLine}
      ${metaLine ? `<div class="sub-card-meta">${esc(metaLine)}</div>` : ''}
    </div>`;
}

function _renderCards() {
  const subs = state.subscriptions;
  if (!subs.length) {
    return `<div class="empty-state"><strong>No subscriptions yet</strong>Add your first recurring subscription above.</div>`;
  }

  // Group by major_category; ungrouped subs fall into 'Uncategorised' at the end
  const groupMap = new Map();
  subs.forEach(s => {
    const key = s.major_category || 'Uncategorised';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(s);
  });

  const sym = getSymbol(state.quoteCurrency);

  return [...groupMap.entries()].map(([groupName, groupSubs]) => {
    const monthlyTotal = groupSubs
      .filter(s => s.is_active)
      .reduce((sum, s) => sum + toBase(_toMonthly(s.amount, s.frequency), s.currency, null), 0);
    const totalFmt = monthlyTotal > 0
      ? `${sym}${monthlyTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo`
      : '';

    return `
      <div class="sub-group">
        <div class="sub-group-header">
          <span class="sub-group-name">${esc(groupName)}</span>
          ${totalFmt ? `<span class="sub-group-total">${esc(totalFmt)}</span>` : ''}
        </div>
        <div class="sub-list">${groupSubs.map(_renderSubCard).join('')}</div>
      </div>`;
  }).join('');
}

let _subMenuKey = null;

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderSubscriptions() {
  closeContextMenu();
  _subMenuKey = null;
  const content    = el('subscriptionsContent');
  const anyOpen    = state.subAddOpen || state.subEditRow !== null;
  const addBtnText = anyOpen ? '× Close' : '+ Add';

  content.innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Subscriptions</h2></div>
      <button class="btn btn-primary btn-sm" id="subAddBtn">${addBtnText}</button>
    </div>
    ${anyOpen ? _renderForm(state.subEditRow !== null
      ? state.subscriptions.find(s => s._row === state.subEditRow) || null
      : null) : ''}
    ${_renderStats()}
    ${_renderCards()}
  `;

  _attachEvents();
}

// ── Event attachment ──────────────────────────────────────────────────────────

let _eventsAbort = null;

function _attachEvents() {
  if (_eventsAbort) _eventsAbort.abort();
  _eventsAbort = new AbortController();
  const { signal } = _eventsAbort;

  const content = el('subscriptionsContent');
  if (!content) return;

  el('subAddBtn')?.addEventListener('click', () => {
    if (state.subAddOpen || state.subEditRow !== null) {
      state.subAddOpen  = false;
      state.subEditRow  = null;
      state.subPrefill  = null;
    } else {
      state.subAddOpen  = true;
      state.subEditRow  = null;
    }
    renderSubscriptions();
  }, { signal });

  // Frequency change → re-render just the day field wrapper
  el('subFrequency')?.addEventListener('change', () => {
    const freq = el('subFrequency').value;
    const wrap = el('subDayWrap');
    if (wrap) wrap.innerHTML = _dayFieldHtml(freq, '');
  }, { signal });

  // Transaction type cascade → major → minor
  el('subTxType')?.addEventListener('change', () => {
    const txType  = el('subTxType').value;
    const majorEl = el('subMajor');
    const minorEl = el('subMinor');
    if (majorEl) majorEl.innerHTML = _majorOpts(txType, '');
    if (minorEl) minorEl.innerHTML = _minorOpts(txType, '', '');
  }, { signal });

  el('subMajor')?.addEventListener('change', () => {
    const txType  = el('subTxType')?.value || '';
    const major   = el('subMajor').value;
    const minorEl = el('subMinor');
    if (minorEl) minorEl.innerHTML = _minorOpts(txType, major, '');
  }, { signal });

  content.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row !== undefined ? Number(btn.dataset.row) : null;

    if (action === 'sub-cancel') {
      state.subAddOpen = false;
      state.subEditRow = null;
      state.subPrefill = null;
      renderSubscriptions();
    }
    if (action === 'sub-save') {
      if (state.subEditRow !== null) _saveEdit(state.subEditRow);
      else _saveAdd();
    }
    if (action === 'sub-menu') {
      if (_subMenuKey === row) {
        closeContextMenu();
        _subMenuKey = null;
        return;
      }
      _subMenuKey = row;
      const sub = state.subscriptions.find(s => s._row === row);
      const pauseLabel = sub?.is_active ? 'Pause' : 'Resume';
      openContextMenu(btn, [
        { key: 'edit',   label: 'Edit'              },
        { key: 'toggle', label: pauseLabel           },
        { key: 'delete', label: 'Delete', cls: 'danger' },
      ], key => {
        _subMenuKey = null;
        if (key === 'edit')   { state.subEditRow = row; state.subAddOpen = false; state.subPrefill = null; renderSubscriptions(); }
        if (key === 'toggle') { _toggle(row); }
        if (key === 'delete') { state.subDeleteRow = row; renderSubscriptions(); }
      });
    }
    if (action === 'sub-cancel-delete')  { state.subDeleteRow = null; renderSubscriptions(); }
    if (action === 'sub-confirm-delete') { _confirmDelete(row); }
  }, { signal });
}

// ── Form collection helper ────────────────────────────────────────────────────

function _collectForm() {
  const freq = el('subFrequency')?.value || 'monthly';
  const dayOfWeek  = freq === 'weekly'  ? (el('subDayOfWeek')?.value  || '') : '';
  const dayOfMonth = freq !== 'weekly'  ? (el('subDayOfMonth')?.value || '') : '';

  return {
    name:              (el('subName')?.value          || '').trim(),
    counterparty_name: (el('subCounterparty')?.value  || '').trim(),
    amount:            parseFloat(el('subAmount')?.value || '0'),
    currency:          el('subCurrency')?.value        || '',
    frequency:         freq,
    day_of_week:       dayOfWeek,
    day_of_month:      dayOfMonth,
    source_account:    el('subSourceAccount')?.value   || '',
    transaction_type:  el('subTxType')?.value          || '',
    major_category:    el('subMajor')?.value           || '',
    minor_category:    el('subMinor')?.value           || '',
    tags:              (el('subTags')?.value           || '').trim(),
    notes:             (el('subNotes')?.value          || '').trim(),
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

async function _saveAdd() {
  const errEl = el('subFormError');
  if (errEl) errEl.textContent = '';

  const body = _collectForm();

  if (!body.name) {
    if (errEl) errEl.textContent = 'Name is required.';
    return;
  }
  if (!body.amount || body.amount <= 0) {
    if (errEl) errEl.textContent = 'Enter a positive amount.';
    return;
  }
  if (!body.currency) {
    if (errEl) errEl.textContent = 'Currency is required.';
    return;
  }

  // FE duplicate check by name
  const norm = body.name.toLowerCase();
  const nameDupe = state.subscriptions.find(s => (s.name || '').toLowerCase() === norm);
  if (nameDupe) {
    if (errEl) errEl.textContent = `A subscription named "${nameDupe.name}" already exists.`;
    return;
  }

  showLoading();
  try {
    const res = await ExpenseAPI.createSubscription({ ...body, is_active: true });
    if (res.ok) {
      showMsg('Subscription added.');
      state.subAddOpen = false;
      state.subPrefill = null;
      document.dispatchEvent(new CustomEvent('subscriptions:reload'));
    } else if (res.error === 'duplicate_subscription') {
      if (errEl) errEl.textContent = 'A subscription with this name already exists.';
    } else {
      if (errEl) errEl.textContent = 'Error: ' + (res.error || 'unknown');
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
  } finally {
    hideLoading();
  }
}

async function _saveEdit(row) {
  const errEl = el('subFormError');
  if (errEl) errEl.textContent = '';

  const body = _collectForm();

  if (!body.name) {
    if (errEl) errEl.textContent = 'Name is required.';
    return;
  }
  if (!body.amount || body.amount <= 0) {
    if (errEl) errEl.textContent = 'Enter a positive amount.';
    return;
  }
  if (!body.currency) {
    if (errEl) errEl.textContent = 'Currency is required.';
    return;
  }

  const isActive = el('subIsActive')?.checked ?? true;

  showLoading();
  try {
    const res = await ExpenseAPI.updateSubscription({ ...body, row_num: row, is_active: isActive });
    if (res.ok) {
      showMsg('Subscription updated.');
      state.subEditRow = null;
      document.dispatchEvent(new CustomEvent('subscriptions:reload'));
    } else {
      if (errEl) errEl.textContent = 'Error: ' + (res.error || 'unknown');
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
  } finally {
    hideLoading();
  }
}

async function _toggle(row) {
  const sub = state.subscriptions.find(s => s._row === row);
  if (!sub) return;
  const newActive = !sub.is_active;
  showLoading();
  try {
    const res = await ExpenseAPI.updateSubscription({
      row_num:   row,
      name:      sub.name,
      is_active: newActive,
    });
    if (res.ok) {
      showMsg(newActive ? 'Subscription resumed.' : 'Subscription paused.');
      document.dispatchEvent(new CustomEvent('subscriptions:reload'));
    } else {
      showMsg('Update failed: ' + (res.error || 'unknown'), 'warn');
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
  } finally {
    hideLoading();
  }
}

async function _confirmDelete(row) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteSubscription({ row_num: row });
    if (res.ok) {
      showMsg('Subscription deleted.');
      state.subDeleteRow = null;
      document.dispatchEvent(new CustomEvent('subscriptions:reload'));
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      state.subDeleteRow = null;
      renderSubscriptions();
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
    state.subDeleteRow = null;
    renderSubscriptions();
  } finally {
    hideLoading();
  }
}
