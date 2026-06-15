import { state, VALID_TX_TYPES } from '../core/state.js';
import { el, esc, fmtDate, fmtNative, fmtBase, todayISO, exportData } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { filteredTx } from '../core/daterange.js';
import { ExpenseAPI } from '../core/api.js';

let addFormOpen    = false;
let filterOpen     = false;
let editId         = null;   // null = add mode; tx.id string = edit mode
let editTx         = null;   // full tx object being edited
let deleteDialogTx = null;   // tx shown in the admin-contact dialog

export function renderTransactions() {
  const txEl = el('transactionsContent');
  const rows = filteredTx();

  const validRows = rows.filter(tx =>  tx.id && tx.date && VALID_TX_TYPES.includes(tx.transaction_type));
  const warnRows  = rows.filter(tx => !tx.id || !tx.date || !VALID_TX_TYPES.includes(tx.transaction_type));

  txEl.innerHTML = `
    ${renderAdminDeleteDialog()}
    ${renderAddForm()}
    ${renderFilterBar()}
    ${warnRows.length ? `<div class="warning-count" id="warnToggle">⚠ ${warnRows.length} row${warnRows.length > 1 ? 's' : ''} have warnings — click to expand</div>` : ''}
    <div class="table-controls">
      <button class="btn btn-secondary btn-sm" id="exportCsv">Export CSV</button>
      <button class="btn btn-secondary btn-sm" id="exportJson">Export JSON</button>
    </div>
    ${renderTxTable(validRows, warnRows)}
  `;

  attachFilterEvents();
  attachAddFormEvents();
  attachTableEvents();

  el('exportCsv')?.addEventListener('click', () => exportData('csv', rows));
  el('exportJson')?.addEventListener('click', () => exportData('json', rows));

  if (warnRows.length) {
    el('warnToggle')?.addEventListener('click', () => el('warnTable')?.classList.toggle('hidden'));
  }
}

// ── Admin-contact delete dialog ───────────────────────────────────────────────

function renderAdminDeleteDialog() {
  if (!deleteDialogTx) return '';
  const tx = deleteDialogTx;
  return `
  <div class="overlay" id="deleteDialogOverlay">
    <div class="pin-card" style="max-width:420px">
      <p class="pin-eyebrow">Admin action required</p>
      <h2 style="margin:0 0 10px">Delete Transaction</h2>
      <p style="color:var(--muted);font-size:13.5px;margin:0 0 16px;line-height:1.6">
        Deletion is restricted to admin access. To remove this transaction, open the Google Sheet and delete the corresponding row directly.
      </p>
      <div style="background:var(--canvas);border:1px solid var(--hair);border-radius:10px;padding:12px 14px;font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:20px;line-height:1.9">
        <div><span style="color:var(--ink);font-weight:600">ID &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>${esc(String(tx.id))}</div>
        <div><span style="color:var(--ink);font-weight:600">Date &nbsp;&nbsp;&nbsp;&nbsp;</span>${esc(fmtDate(tx.date))}</div>
        <div><span style="color:var(--ink);font-weight:600">Type &nbsp;&nbsp;&nbsp;&nbsp;</span>${esc(tx.transaction_type || '—')}</div>
        <div><span style="color:var(--ink);font-weight:600">Amount &nbsp;&nbsp;</span>${esc(fmtNative(tx.amount, tx.currency))}</div>
        <div><span style="color:var(--ink);font-weight:600">Account &nbsp;</span>${esc(tx.account || '—')}</div>
        ${tx.counterparty ? `<div><span style="color:var(--ink);font-weight:600">With &nbsp;&nbsp;&nbsp;&nbsp;</span>${esc(tx.counterparty)}</div>` : ''}
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-secondary" id="closeDeleteDialog">Close</button>
        <button class="btn btn-secondary btn-sm" id="copyTxId" style="font-family:var(--mono)">Copy ID</button>
      </div>
    </div>
  </div>`;
}

function attachTableEvents() {
  // Close dialog — button or backdrop click
  el('closeDeleteDialog')?.addEventListener('click', () => { deleteDialogTx = null; renderTransactions(); });
  el('deleteDialogOverlay')?.addEventListener('click', e => {
    if (e.target === el('deleteDialogOverlay')) { deleteDialogTx = null; renderTransactions(); }
  });

  // Copy ID
  el('copyTxId')?.addEventListener('click', () => {
    const id = String(deleteDialogTx?.id || '');
    navigator.clipboard?.writeText(id).then(() => {
      const btn = el('copyTxId');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { if (el('copyTxId')) el('copyTxId').textContent = 'Copy ID'; }, 1500); }
    });
  });

  // Row action buttons — edit and request-delete
  el('txTableBody')?.addEventListener('click', e => {
    const editBtn   = e.target.closest('[data-action="edit"]');
    const deleteBtn = e.target.closest('[data-action="req-delete"]');

    if (editBtn) {
      const tx = state.transactions.find(t => String(t.id) === editBtn.dataset.txId);
      if (!tx) return;
      editId = tx.id; editTx = tx; addFormOpen = true;
      renderTransactions();
      setTimeout(() => el('addFormWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }

    if (deleteBtn) {
      deleteDialogTx = state.transactions.find(t => String(t.id) === deleteBtn.dataset.txId) || null;
      renderTransactions();
    }
  });

  // Pagination
  el('prevPage')?.addEventListener('click', () => { state.txPage--; renderTransactions(); });
  el('nextPage')?.addEventListener('click', () => { state.txPage++; renderTransactions(); });

  // Sort headers
  el('transactionsContent')?.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      state.txSort.dir = state.txSort.col === col && state.txSort.dir === 'asc' ? 'desc' : (state.txSort.col === col ? 'asc' : 'desc');
      state.txSort.col = col;
      state.txPage = 1;
      renderTransactions();
    });
  });
}

// ── Transactions table ────────────────────────────────────────────────────────

function renderTxTable(validRows, warnRows) {
  const sorted = sortTx([...validRows]);
  const total  = sorted.length;
  const pages  = Math.max(1, Math.ceil(total / state.txPerPage));
  if (state.txPage > pages) state.txPage = 1;
  const start  = (state.txPage - 1) * state.txPerPage;
  const paged  = sorted.slice(start, start + state.txPerPage);

  const thSort = (col, label) => {
    const cls = state.txSort.col === col ? ` sort-${state.txSort.dir}` : '';
    return `<th class="${cls}" data-sort="${esc(col)}">${esc(label)}</th>`;
  };

  const rows = paged.map(tx => {
    const badgeCls  = tx.transaction_type === 'money-in' ? 'badge-in' : tx.transaction_type === 'money-out' ? 'badge-out' : 'badge-transfer';
    const typeLabel = tx.transaction_type === 'money-in' ? 'in'       : tx.transaction_type === 'money-out' ? 'out'       : 'xfer';
    const missingRate = !state.rateMap[tx.currency];
    const rowRate     = tx.fx_rate && parseFloat(tx.fx_rate) > 0;
    const isEditing   = editId && String(tx.id) === String(editId);

    return `<tr${isEditing ? ' style="background:color-mix(in srgb,var(--ember) 6%,transparent)"' : ''}>
      <td class="td-mono">${esc(fmtDate(tx.date))}</td>
      <td><span class="badge ${badgeCls}">${typeLabel}</span>${tx.transfer_id ? ' <span title="Transfer: '+esc(tx.transfer_id)+'">⇌</span>' : ''}</td>
      <td>${esc(tx.account || '—')}</td>
      <td class="td-mono">${esc(fmtNative(tx.amount, tx.currency))}${missingRate ? ' <span class="badge badge-warn" title="Currency not in rates tab">?</span>' : ''}</td>
      <td class="td-mono">${esc(fmtBase(tx.amount, tx.currency, tx.fx_rate))}${rowRate ? ' <span title="Row-level FX rate used" style="color:var(--muted);font-size:10px">†</span>' : ''}</td>
      <td>${esc(tx.major_category || '—')} ${tx.minor_category ? '→ ' + esc(tx.minor_category) : ''}</td>
      <td>${esc(tx.counterparty || '—')}</td>
      <td class="td-muted">${esc(tx.country || '—')}</td>
      <td class="td-muted">${esc(tx.payment_method || '—')}</td>
      <td class="td-muted">${tx.tags ? tx.tags.split(';').map(t => `<span class="badge" style="background:var(--canvas)">${esc(t.trim())}</span>`).join(' ') : '—'}</td>
      <td class="td-muted">${esc(tx.notes || '—')}</td>
      <td style="white-space:nowrap">
        <span class="row-actions">
          <button class="btn-link" data-action="edit" data-tx-id="${esc(String(tx.id))}">${isEditing ? 'Editing…' : 'Edit'}</button>
          <button class="btn-link danger" data-action="req-delete" data-tx-id="${esc(String(tx.id))}">Delete</button>
        </span>
      </td>
    </tr>`;
  }).join('');

  const warnRowsHtml = warnRows.length ? `
    <tbody id="warnTable" class="hidden">
      ${warnRows.map(tx => `<tr>
        <td colspan="12"><span class="badge badge-warn">⚠ malformed</span> id=${esc(String(tx.id||'?'))} type=${esc(tx.transaction_type||'?')} date=${esc(String(tx.date||'?'))}</td>
      </tr>`).join('')}
    </tbody>` : '';

  const pagination = pages > 1 ? `
    <div class="pagination">
      <button class="btn btn-secondary btn-sm" id="prevPage" ${state.txPage <= 1 ? 'disabled' : ''}>← Prev</button>
      <span>Page ${state.txPage} of ${pages} (${total} rows)</span>
      <button class="btn btn-secondary btn-sm" id="nextPage" ${state.txPage >= pages ? 'disabled' : ''}>Next →</button>
    </div>` : `<div class="pagination">${total} rows</div>`;

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${thSort('date','Date')}
          ${thSort('transaction_type','Type')}
          ${thSort('account','Account')}
          <th>Amount</th>
          <th>≈ ${esc(state.quoteCurrency)}</th>
          ${thSort('major_category','Category')}
          ${thSort('counterparty','Counterparty')}
          <th>Country</th>
          <th>Method</th>
          <th>Tags</th>
          <th>Notes</th>
          <th style="width:110px"></th>
        </tr></thead>
        <tbody id="txTableBody">${rows || '<tr class="empty-row"><td colspan="12">No transactions in this period.</td></tr>'}</tbody>
        ${warnRowsHtml}
      </table>
    </div>
    ${pagination}
  `;
}

function sortTx(rows) {
  const col = state.txSort.col;
  const dir = state.txSort.dir === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    let va = a[col] ?? '', vb = b[col] ?? '';
    if (col === 'date') {
      const ts = s => { const p = String(s).slice(0,10).split('-').map(Number); return p.length===3 ? new Date(p[0],p[1]-1,p[2]).getTime() : 0; };
      va = ts(va); vb = ts(vb);
    } else if (col === 'amount') {
      va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}

// ── Add / Edit form ───────────────────────────────────────────────────────────

function txDate(tx) {
  if (!tx?.date) return todayISO();
  const d = tx.date;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function renderAddForm() {
  const isEdit = editId !== null;
  const tx     = editTx || {};

  const majors = isEdit
    ? [...new Set(state.categories.filter(c => c.transaction_type === tx.transaction_type).map(c => c.major_category))]
    : [];
  const minors = isEdit
    ? state.categories.filter(c => c.transaction_type === tx.transaction_type && c.major_category === tx.major_category).map(c => c.minor_category)
    : [];

  const showTransfer = isEdit ? tx.transaction_type === 'money-transfer' : false;
  const showFx       = isEdit ? (tx.currency && tx.currency !== state.quoteCurrency) : false;

  return `
  <div class="add-form-wrap" id="addFormWrap">
    <button class="add-form-toggle" id="addFormToggle">
      ${isEdit
        ? `Editing <span style="font-family:var(--mono);font-size:11px;color:var(--ember)">${esc(String(editId))}</span>`
        : 'Add transaction'}
      <span class="plus-icon">${addFormOpen || isEdit ? '×' : '+'}</span>
    </button>
    <div class="add-form-body ${addFormOpen || isEdit ? '' : 'hidden'}" id="addFormBody">
      <div class="form-grid">
        <div class="field">
          <label for="afDate">Date *</label>
          <input type="date" id="afDate" value="${esc(isEdit ? txDate(tx) : todayISO())}">
        </div>
        <div class="field">
          <label for="afType">Type *</label>
          <select id="afType">
            ${['money-in','money-out','money-transfer'].map(t =>
              `<option value="${esc(t)}" ${isEdit && tx.transaction_type === t ? 'selected' : ''}>${esc(t)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afAccount">Account *</label>
          <select id="afAccount">
            <option value="">— select —</option>
            ${state.accounts.map(a =>
              `<option value="${esc(a.name)}" ${isEdit && tx.account === a.name ? 'selected' : ''}>${esc(a.name)} (${esc(a.currency)})</option>`
            ).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afAmount">Amount *</label>
          <input type="number" id="afAmount" min="0.01" step="0.01" placeholder="0.00"
            value="${isEdit ? esc(String(tx.amount ?? '')) : ''}">
        </div>
        <div class="field">
          <label for="afCurrency">Currency *</label>
          <select id="afCurrency">
            ${state.rates.map(r =>
              `<option value="${esc(r.currency)}" ${isEdit && tx.currency === r.currency ? 'selected' : ''}>${esc(r.symbol||'')} ${esc(r.currency)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afMajor">Major category *</label>
          <select id="afMajor">
            ${isEdit
              ? `<option value="">— select —</option>${majors.map(m => `<option value="${esc(m)}" ${tx.major_category === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}`
              : '<option value="">— select type first —</option>'}
          </select>
        </div>
        <div class="field">
          <label for="afMinor">Minor category *</label>
          <select id="afMinor">
            ${isEdit
              ? `<option value="">— select —</option>${minors.map(m => `<option value="${esc(m)}" ${tx.minor_category === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}`
              : '<option value="">— select major first —</option>'}
          </select>
        </div>
        <div class="field">
          <label for="afCounterparty">Counterparty</label>
          <input type="text" id="afCounterparty" placeholder="Tesco, employer, …"
            value="${isEdit ? esc(tx.counterparty || '') : ''}">
        </div>
        <div class="field">
          <label for="afCountry">Country</label>
          <input type="text" id="afCountry" placeholder="UK"
            value="${isEdit ? esc(tx.country || '') : ''}">
        </div>
        <div class="field">
          <label for="afMethod">Payment method</label>
          <select id="afMethod">
            <option value="">— optional —</option>
            ${['card','cash','bank','UPI','other'].map(m =>
              `<option value="${m}" ${isEdit && tx.payment_method === m ? 'selected' : ''}>${m}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field" id="afTransferIdWrap" ${showTransfer ? '' : 'style="display:none"'}>
          <label for="afTransferId">Transfer ID</label>
          <input type="text" id="afTransferId" placeholder="T-YYYY-MM-DD-1"
            value="${isEdit ? esc(tx.transfer_id || '') : ''}">
        </div>
        <div class="field" id="afFxRateWrap" ${showFx ? '' : 'style="display:none"'}>
          <label for="afFxRate">FX rate (units per 1 ${esc(state.quoteCurrency)})</label>
          <input type="number" id="afFxRate" min="0" step="any" placeholder="optional override"
            value="${isEdit && tx.fx_rate ? esc(String(tx.fx_rate)) : ''}">
        </div>
        <div class="field">
          <label for="afTags">Tags</label>
          <input type="text" id="afTags" placeholder="reimbursable, work"
            value="${isEdit ? esc((tx.tags || '').replace(/;/g, ', ')) : ''}">
        </div>
        <div class="field form-grid-full">
          <label for="afNotes">Notes</label>
          <input type="text" id="afNotes" placeholder="free text"
            value="${isEdit ? esc(tx.notes || '') : ''}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="afSubmit">${isEdit ? 'Update' : 'Save'}</button>
        <button class="btn btn-secondary" id="afReset">${isEdit ? 'Cancel edit' : 'Clear'}</button>
      </div>
      <div class="pin-error" id="afError"></div>
    </div>
  </div>`;
}

function attachAddFormEvents() {
  el('addFormToggle')?.addEventListener('click', () => {
    if (editId) {
      // Cancel edit mode
      editId = null; editTx = null; addFormOpen = false;
    } else {
      addFormOpen = !addFormOpen;
    }
    renderTransactions();
  });

  el('afType')?.addEventListener('change', () => {
    const type   = el('afType').value;
    const majors = [...new Set(state.categories.filter(c => c.transaction_type === type).map(c => c.major_category))];
    el('afMajor').innerHTML = `<option value="">— select —</option>${majors.map(m => `<option>${esc(m)}</option>`).join('')}`;
    el('afMinor').innerHTML = `<option value="">— select major first —</option>`;
    el('afTransferIdWrap').style.display = type === 'money-transfer' ? '' : 'none';
  });

  el('afMajor')?.addEventListener('change', () => {
    const type   = el('afType').value;
    const major  = el('afMajor').value;
    const minors = state.categories.filter(c => c.transaction_type === type && c.major_category === major).map(c => c.minor_category);
    el('afMinor').innerHTML = `<option value="">— select —</option>${minors.map(m => `<option>${esc(m)}</option>`).join('')}`;
  });

  el('afCurrency')?.addEventListener('change', () => {
    el('afFxRateWrap').style.display = el('afCurrency').value !== state.quoteCurrency ? '' : 'none';
  });

  el('afAccount')?.addEventListener('change', () => {
    const acc = state.accounts.find(a => a.name === el('afAccount').value);
    if (acc) el('afCurrency').value = acc.currency;
    el('afFxRateWrap').style.display = el('afCurrency').value !== state.quoteCurrency ? '' : 'none';
  });

  el('afSubmit')?.addEventListener('click', saveTransaction);

  el('afReset')?.addEventListener('click', () => {
    if (editId) {
      // Cancel edit
      editId = null; editTx = null; addFormOpen = false;
      renderTransactions();
    } else {
      ['afDate','afAmount','afCounterparty','afCountry','afTags','afNotes','afFxRate','afTransferId']
        .forEach(id => { if (el(id)) el(id).value = id === 'afDate' ? todayISO() : ''; });
      el('afType').value    = 'money-in';
      el('afMajor').innerHTML = '<option value="">— select type first —</option>';
      el('afMinor').innerHTML = '<option value="">— select major first —</option>';
      el('afError').textContent = '';
    }
  });
}

async function saveTransaction() {
  const btn   = el('afSubmit');
  const errEl = el('afError');
  errEl.textContent = '';

  const date             = el('afDate').value;
  const transaction_type = el('afType').value;
  const account          = el('afAccount').value;
  const amount           = el('afAmount').value;
  const currency         = el('afCurrency').value;
  const major_category   = el('afMajor').value;
  const minor_category   = el('afMinor').value;
  const counterparty     = el('afCounterparty').value.trim();
  const country          = el('afCountry').value.trim();
  const payment_method   = el('afMethod').value;
  const transfer_id      = el('afTransferId').value.trim();
  const fx_rate          = el('afFxRate').value;
  const tags             = el('afTags').value.trim();
  const notes            = el('afNotes').value.trim();

  if (!date)                                { errEl.textContent = 'Date is required.';            return; }
  if (!account)                             { errEl.textContent = 'Account is required.';         return; }
  if (!amount || parseFloat(amount) <= 0)   { errEl.textContent = 'Enter a positive amount.';     return; }
  if (!major_category)                      { errEl.textContent = 'Major category is required.';  return; }
  if (!minor_category)                      { errEl.textContent = 'Minor category is required.';  return; }

  const isEdit = editId !== null;
  btn.disabled = true; btn.textContent = isEdit ? 'Updating…' : 'Saving…';
  showLoading();

  const payload = {
    date, transaction_type, account, amount: parseFloat(amount), currency,
    major_category, minor_category, counterparty, country, payment_method,
    transfer_id, fx_rate: fx_rate ? parseFloat(fx_rate) : '',
    tags, notes,
  };

  try {
    const res = isEdit
      ? await ExpenseAPI.updateTransaction({ id: editId, ...payload })
      : await ExpenseAPI.createTransaction(payload);

    if (res.ok) {
      showMsg(isEdit ? 'Transaction updated.' : 'Transaction saved.');
      editId = null; editTx = null; addFormOpen = false;
      document.dispatchEvent(new CustomEvent('et:reload'));
    } else {
      errEl.textContent = 'Error: ' + (res.error || 'unknown');
      btn.disabled = false; btn.textContent = isEdit ? 'Update' : 'Save';
    }
  } catch (_) {
    errEl.textContent = 'Connection error.';
    btn.disabled = false; btn.textContent = isEdit ? 'Update' : 'Save';
  } finally {
    hideLoading();
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function renderFilterBar() {
  const f        = state.filters;
  const allTypes = ['money-in', 'money-out', 'money-transfer'];
  const allAccs  = [...new Set(state.accounts.map(a => a.name))];
  const allMajor = [...new Set(state.categories.map(c => c.major_category))];
  const allMinor = [...new Set(state.categories.map(c => c.minor_category))];
  const methods  = ['card','cash','bank','UPI','other'];

  const activeChips = [
    ...f.types.map(t    => ({ label: t,                   key: 'types',    val: t })),
    ...f.accounts.map(a => ({ label: a,                   key: 'accounts', val: a })),
    ...f.major.map(m    => ({ label: m,                   key: 'major',    val: m })),
    ...f.minor.map(m    => ({ label: m,                   key: 'minor',    val: m })),
    ...(f.country ? [{ label: 'Country: '+f.country, key: 'country', val: '' }] : []),
    ...(f.method  ? [{ label: 'Method: ' +f.method,  key: 'method',  val: '' }] : []),
    ...(f.tag     ? [{ label: 'Tag: '    +f.tag,      key: 'tag',     val: '' }] : []),
    ...(f.search  ? [{ label: 'Search: ' +f.search,  key: 'search',  val: '' }] : []),
  ];

  return `
  <div class="filter-bar">
    <button class="filter-toggle" id="filterToggle">
      Filters ${activeChips.length ? `<span class="badge badge-in">${activeChips.length}</span>` : ''}
      <span class="filter-arrow">${filterOpen ? '▲' : '▼'}</span>
    </button>
    <div class="filter-body ${filterOpen ? '' : 'hidden'}" id="filterBody">
      <div class="filter-row">
        <label>Type</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${allTypes.map(t => `<label style="display:flex;align-items:center;gap:4px;font-size:12px">
            <input type="checkbox" data-filter-type="${esc(t)}" ${f.types.includes(t) ? 'checked' : ''}> ${esc(t)}
          </label>`).join('')}
        </div>
      </div>
      <div class="filter-row">
        <label>Account</label>
        <select id="filterAccount">
          <option value="">All accounts</option>
          ${allAccs.map(a => `<option value="${esc(a)}" ${f.accounts.includes(a) ? 'selected' : ''}>${esc(a)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-row">
        <label>Major cat.</label>
        <select id="filterMajor">
          <option value="">All</option>
          ${allMajor.map(m => `<option value="${esc(m)}" ${f.major.includes(m) ? 'selected' : ''}>${esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-row">
        <label>Minor cat.</label>
        <select id="filterMinor">
          <option value="">All</option>
          ${allMinor.map(m => `<option value="${esc(m)}" ${f.minor.includes(m) ? 'selected' : ''}>${esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-row">
        <label>Country</label>
        <input type="text" id="filterCountry" value="${esc(f.country)}" placeholder="e.g. UK">
      </div>
      <div class="filter-row">
        <label>Method</label>
        <select id="filterMethod">
          <option value="">All</option>
          ${methods.map(m => `<option value="${esc(m)}" ${f.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-row">
        <label>Tag</label>
        <input type="text" id="filterTag" value="${esc(f.tag)}" placeholder="any tag">
      </div>
      <div class="filter-row">
        <label>Search</label>
        <input type="text" id="filterSearch" value="${esc(f.search)}" placeholder="counterparty or notes">
      </div>
      <div style="margin-top:4px">
        <button class="btn btn-secondary btn-sm" id="clearFilters">Clear all filters</button>
      </div>
    </div>
    ${activeChips.length ? `<div class="filter-chips">
      ${activeChips.map(chip => `<span class="filter-chip">${esc(chip.label)}<button class="chip-remove" data-chip-key="${esc(chip.key)}" data-chip-val="${esc(chip.val)}">×</button></span>`).join('')}
    </div>` : ''}
  </div>`;
}

function attachFilterEvents() {
  el('filterToggle')?.addEventListener('click', () => { filterOpen = !filterOpen; renderTransactions(); });

  document.querySelectorAll('[data-filter-type]').forEach(cb => {
    cb.addEventListener('change', () => {
      const t = cb.dataset.filterType;
      if (cb.checked) { if (!state.filters.types.includes(t)) state.filters.types.push(t); }
      else { state.filters.types = state.filters.types.filter(x => x !== t); }
      state.txPage = 1; renderTransactions();
    });
  });

  const bindSelect = (id, key) => el(id)?.addEventListener('change', e => {
    state.filters[key] = e.target.value ? [e.target.value] : [];
    state.txPage = 1; renderTransactions();
  });
  const bindText = (id, key) => el(id)?.addEventListener('input', e => {
    state.filters[key] = e.target.value.trim();
    state.txPage = 1; renderTransactions();
  });

  bindSelect('filterAccount', 'accounts');
  bindSelect('filterMajor',   'major');
  bindSelect('filterMinor',   'minor');
  bindSelect('filterMethod',  'method');
  bindText('filterCountry',   'country');
  bindText('filterTag',       'tag');
  bindText('filterSearch',    'search');

  el('clearFilters')?.addEventListener('click', () => {
    state.filters = { types:[], accounts:[], major:[], minor:[], country:'', method:'', tag:'', search:'' };
    state.txPage = 1; renderTransactions();
  });

  document.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.chipKey;
      const val = btn.dataset.chipVal;
      if (Array.isArray(state.filters[key])) state.filters[key] = state.filters[key].filter(x => x !== val);
      else state.filters[key] = '';
      state.txPage = 1; renderTransactions();
    });
  });
}
