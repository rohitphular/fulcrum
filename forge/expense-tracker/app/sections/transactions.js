import { state, VALID_TX_TYPES } from '../core/state.js';
import { el, esc, fmtDateTime, fmtDateTimeCompact, fmtNative, fmtBase, nowLocalISO, toDateInputVal, exportData, getSymbol } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { filteredTx } from '../core/daterange.js';
import { ExpenseAPI } from '../core/api.js';

let addFormOpen = false;
let filterOpen  = false;

// ── Category dropdown helpers — respect is_active (greyed-out when archived) ──

// Major <option> list for a transaction type.
// A major is active if at least one of its minors is active.
function _catMajorOpts(type, selectedVal = '') {
  const cats = state.categories.filter(c => c.transaction_type === type);
  const majors = [...new Map(cats.map(c => {
    const active = cats.some(x => x.major_category === c.major_category && x.is_active === true);
    return [c.major_category, { label: c.major_category, active }];
  })).values()];
  return `<option value="">— select —</option>` +
    majors.map(({ label, active }) => {
      const sel = selectedVal === label ? 'selected' : '';
      return active
        ? `<option value="${esc(label)}" ${sel}>${esc(label)}</option>`
        : `<option value="${esc(label)}" ${sel} disabled style="color:var(--muted)">${esc(label)} (archived)</option>`;
    }).join('');
}

// Minor <option> list for a type + major combo.
function _catMinorOpts(type, major, selectedVal = '') {
  const cats = state.categories.filter(c => c.transaction_type === type && c.major_category === major);
  return `<option value="">— select —</option>` +
    cats.map(c => {
      const sel = selectedVal === c.minor_category ? 'selected' : '';
      return c.is_active === true
        ? `<option value="${esc(c.minor_category)}" ${sel}>${esc(c.minor_category)}</option>`
        : `<option value="${esc(c.minor_category)}" ${sel} disabled style="color:var(--muted)">${esc(c.minor_category)} (archived)</option>`;
    }).join('');
}

// ── Account dropdown helpers — filter by category source/dest account types ──

function _getCat(type, major, minor) {
  if (!type || !major || !minor) return null;
  return state.categories.find(c =>
    c.transaction_type === type &&
    c.major_category   === major &&
    c.minor_category   === minor
  ) || null;
}

// Returns <option> elements filtered to allowedTypesStr account types.
// Shows all accounts when no types are configured for the category.
function _acctOptsWithHints(accounts, allowedTypesStr, selectedId = '') {
  const allowed = allowedTypesStr
    ? new Set(allowedTypesStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
    : new Set();
  const filtered = allowed.size
    ? accounts.filter(a => allowed.has((a.type || '').toLowerCase()))
    : accounts;
  return filtered.map(a =>
    `<option value="${esc(a.id)}" ${a.id === selectedId ? 'selected' : ''}>${esc(a.name)} (${esc(a.currency)})</option>`
  ).join('');
}

// ── Transaction schema helpers ────────────────────────────────────────────────

function _txTypes() {
  return state.transactionSchema?.types || [
    { value: 'money-in',       label: 'Money In'  },
    { value: 'money-out',      label: 'Money Out' },
    { value: 'money-transfer', label: 'Transfer'  },
  ];
}
function _txTypeMap() {
  return Object.fromEntries(_txTypes().map(t => [t.value, t.label]));
}

export function renderTransactions() {
  const txEl = el('transactionsContent');
  const rows = filteredTx();

  const validRows = rows.filter(tx =>  tx.id && tx.transaction_date_utc && VALID_TX_TYPES.includes(tx.transaction_type));
  const warnRows  = rows.filter(tx => !tx.id || !tx.transaction_date_utc || !VALID_TX_TYPES.includes(tx.transaction_type));

  txEl.innerHTML = `
    ${_renderAddForm()}
    ${_renderFilterBar()}
    ${warnRows.length ? `<div class="warning-count" id="warnToggle">⚠ ${warnRows.length} row${warnRows.length > 1 ? 's' : ''} have warnings — click to expand</div>` : ''}
    <div class="table-controls">
      <button class="btn btn-secondary btn-sm" id="exportCsv">Export CSV</button>
      <button class="btn btn-secondary btn-sm" id="exportJson">Export JSON</button>
    </div>
    ${_renderTxTable(validRows, warnRows)}
  `;

  _attachFilterEvents();
  _attachAddFormEvents();

  el('exportCsv')?.addEventListener('click', () => exportData('csv', rows));
  el('exportJson')?.addEventListener('click', () => exportData('json', rows));

  if (warnRows.length) {
    el('warnToggle')?.addEventListener('click', () => el('warnTable')?.classList.toggle('hidden'));
  }
}

function _renderTxTable(validRows, warnRows) {
  const sorted = _sortTx([...validRows]);
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
    if (state.txViewRow   === tx._row) return _renderTxViewRow(tx);
    if (state.txDeleteRow === tx._row) return _renderTxDeleteRow(tx);
    if (state.txEditRow   === tx._row) return _renderTxEditRow(tx);

    const badgeCls  = tx.transaction_type === 'money-in' ? 'badge-in' : tx.transaction_type === 'money-out' ? 'badge-out' : 'badge-transfer';
    const typeLabel = _txTypeMap()[tx.transaction_type] || tx.transaction_type;
    const missingRate = !state.rateMap[tx.currency];
    const rowRate     = tx.fx_rate && parseFloat(tx.fx_rate) > 0;

    const fromName  = state.accountMap[tx.source_account]?.name || '—';
    const toName    = tx.target_account ? state.accountMap[tx.target_account]?.name : null;
    const acctLabel = toName ? `${fromName} → ${toName}` : fromName;
    const catLabel  = [tx.major_category, tx.minor_category].filter(Boolean).join(' → ') || '—';
    const nativeAmt = fmtNative(tx.amount, tx.currency);
    const baseAmt   = fmtBase(tx.amount, tx.currency, tx.fx_rate);
    const amtCell   = tx.currency !== state.quoteCurrency
      ? `${esc(nativeAmt)} <span class="td-base-amt">/ ${esc(baseAmt)}</span>`
      : esc(nativeAmt);

    return `<tr>
      <td class="td-mono td-nowrap">${esc(fmtDateTimeCompact(tx.transaction_date_utc))}</td>
      <td><span class="badge ${badgeCls}">${typeLabel}</span>${tx.transfer_id ? ' <span title="Transfer: '+esc(tx.transfer_id)+'">⇌</span>' : ''}</td>
      <td class="td-truncate" title="${esc(acctLabel)}">${esc(acctLabel)}</td>
      <td class="td-mono td-nowrap">${amtCell}${missingRate ? ' <span class="badge badge-warn" title="Currency not in rates tab">?</span>' : ''}${rowRate ? ' <span title="Row-level FX rate" style="color:var(--muted);font-size:10px">†</span>' : ''}</td>
      <td class="td-truncate" title="${esc(catLabel)}">${esc(catLabel)}</td>
      <td><div class="row-actions">
        <button class="btn-link" data-action="tx-view" data-row="${tx._row}">View</button>
        <button class="btn-link" data-action="tx-edit" data-row="${tx._row}">Edit</button>
        <button class="btn-link danger" data-action="tx-delete" data-row="${tx._row}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');

  const warnRowsHtml = warnRows.length ? `
    <tbody id="warnTable" class="hidden">
      ${warnRows.map(tx => `<tr>
        <td colspan="6"><span class="badge badge-warn">⚠ malformed</span> id=${esc(String(tx.id||'?'))} type=${esc(tx.transaction_type||'?')} date=${esc(String(tx.transaction_date_utc||'?'))}</td>
      </tr>`).join('')}
    </tbody>` : '';

  const pagination = `
    <div class="pagination">
      <button class="btn btn-secondary btn-sm" id="prevPage" ${state.txPage <= 1 ? 'disabled' : ''}>← Prev</button>
      <span>Page ${state.txPage} of ${pages} (${total} rows)</span>
      <select id="txPerPage" class="per-page-select">
        ${[10, 25, 50].map(n => `<option value="${n}" ${state.txPerPage === n ? 'selected' : ''}>${n} / page</option>`).join('')}
      </select>
      <button class="btn btn-secondary btn-sm" id="nextPage" ${state.txPage >= pages ? 'disabled' : ''}>Next →</button>
    </div>`;

  const html = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${thSort('transaction_date_utc','Date')}
          ${thSort('transaction_type','Type')}
          ${thSort('source_account','Account')}
          <th>Amount</th>
          ${thSort('major_category','Category')}
          <th style="width:130px">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        ${warnRowsHtml}
      </table>
    </div>
    ${pagination}
  `;

  setTimeout(() => {
    el('transactionsContent')?.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        state.txSort.dir = state.txSort.col === col && state.txSort.dir === 'asc' ? 'desc' : (state.txSort.col === col ? 'asc' : 'desc');
        state.txSort.col = col;
        state.txPage = 1;
        renderTransactions();
      });
    });
    el('prevPage')?.addEventListener('click', () => { state.txPage--; renderTransactions(); });
    el('nextPage')?.addEventListener('click', () => { state.txPage++; renderTransactions(); });
    el('txPerPage')?.addEventListener('change', e => { state.txPerPage = Number(e.target.value); state.txPage = 1; renderTransactions(); });

    el('transactionsContent')?.querySelector('.table-wrap')?.addEventListener('click', e => {
      const btn    = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const row    = btn.dataset.row ? Number(btn.dataset.row) : null;
      if (action === 'tx-view')           { state.txViewRow = row; state.txEditRow = null; state.txDeleteRow = null; renderTransactions(); }
      if (action === 'tx-cancel-view')    { state.txViewRow = null; renderTransactions(); }
      if (action === 'tx-edit')           { state.txEditRow = row; state.txDeleteRow = null; state.txViewRow = null; renderTransactions(); }
      if (action === 'tx-cancel-edit')    { state.txEditRow = null; renderTransactions(); }
      if (action === 'tx-save-edit')      { _saveEdit(row); }
      if (action === 'tx-delete')         { state.txDeleteRow = row; state.txEditRow = null; state.txViewRow = null; renderTransactions(); }
      if (action === 'tx-cancel-delete')  { state.txDeleteRow = null; renderTransactions(); }
      if (action === 'tx-confirm-delete') { _confirmDelete(row); }
    });

    if (state.txEditRow !== null) _attachTxEditCascadeEvents(state.txEditRow);
  }, 0);

  return html;
}

function _sortTx(rows) {
  const col = state.txSort.col;
  const dir = state.txSort.dir === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    let va = a[col] ?? '', vb = b[col] ?? '';
    if (col === 'transaction_date_utc') {
      const ts = s => { const d = new Date(String(s)); return isNaN(d) ? 0 : d.getTime(); };
      va = ts(va); vb = ts(vb);
    } else if (col === 'amount') {
      va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}

// ── Add-transaction form ──────────────────────────────────────────────────────

function _renderAddForm() {
  return `
  <div class="add-form-wrap">
    <button class="add-form-toggle" id="addFormToggle">
      Add transaction
      <span class="plus-icon">${addFormOpen ? '×' : '+'}</span>
    </button>
    <div class="add-form-body ${addFormOpen ? '' : 'hidden'}" id="addFormBody">
      <div class="form-grid form-grid-6">
        <!-- Row 1: Type | Major category | Minor category -->
        <div class="field form-grid-span-2">
          <label for="afType">Type *</label>
          <select id="afType">
            <option value="">— select —</option>
            ${_txTypes().map(t => `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field form-grid-span-2" id="afMajorField">
          <label for="afMajor">Major category *</label>
          <select id="afMajor" disabled><option value="">— select type first —</option></select>
        </div>
        <div class="field form-grid-span-2" id="afMinorField">
          <label for="afMinor">Minor category *</label>
          <select id="afMinor" disabled><option value="">— select major first —</option></select>
        </div>
        <!-- Row 2: Source account | Target account | Country -->
        <div class="field form-grid-span-2" id="afFromAccountWrap">
          <label for="afFromAccount">Source account</label>
          <select id="afFromAccount" disabled>
            <option value="">— select type first —</option>
          </select>
        </div>
        <div class="field form-grid-span-2" id="afToAccountWrap">
          <label for="afToAccount">Target account</label>
          <select id="afToAccount" disabled>
            <option value="">External</option>
          </select>
        </div>
        <div class="field form-grid-span-2" id="afCountryField">
          <label for="afCountry">Country</label>
          <input type="text" id="afCountry" placeholder="UK">
        </div>
        <!-- FX rate: full width, shown only when source and target are cross-currency -->
        <div class="field form-grid-full" id="afFxRateWrap" style="display:none">
          <label for="afFxRate">FX rate</label>
          <input type="number" id="afFxRate" min="0.0001" step="any" placeholder="e.g. 105" style="max-width:240px">
          <div id="afFxDirection" class="field-hint"></div>
          <div id="afFxPreview"   class="field-hint" style="color:var(--teal)"></div>
        </div>
        <!-- Row 3: Date & time | Amount | Counterparty -->
        <div class="field form-grid-span-2" id="afDateField">
          <label for="afDate">Date &amp; time *</label>
          <input type="datetime-local" id="afDate" value="${nowLocalISO()}">
        </div>
        <div class="field form-grid-span-2" id="afAmountField">
          <label for="afAmount">Amount *</label>
          <input type="number" id="afAmount" min="0.01" step="0.01" placeholder="0.00">
        </div>
        <div class="field form-grid-span-2" id="afCounterpartyField">
          <label for="afCounterparty">Counterparty</label>
          <input type="text" id="afCounterparty" placeholder="Tesco, employer, …">
        </div>
        <!-- Row 4: Tags 50% | Notes 50% -->
        <div class="field form-grid-span-3" id="afTagsField">
          <label for="afTags">Tags</label>
          <input type="text" id="afTags" placeholder="reimbursable, work">
        </div>
        <div class="field form-grid-span-3" id="afNotesField">
          <label for="afNotes">Notes</label>
          <input type="text" id="afNotes" placeholder="free text">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="afSubmit">Save</button>
        <button class="btn btn-secondary" id="afReset">Clear</button>
      </div>
      <div class="pin-error" id="afError"></div>
    </div>
  </div>`;
}

function _attachAddFormEvents() {
  el('addFormToggle')?.addEventListener('click', () => { addFormOpen = !addFormOpen; renderTransactions(); });

  el('afType')?.addEventListener('change', () => {
    const type       = el('afType').value;
    const majorEl    = el('afMajor');
    const minorEl    = el('afMinor');
    const isTransfer = type === 'money-transfer';

    majorEl.innerHTML = '<option value="">— select type first —</option>';
    minorEl.innerHTML = '<option value="">— select major first —</option>';
    if (el('afFromAccount')) el('afFromAccount').value = '';
    if (el('afToAccount'))   el('afToAccount').value   = '';
    if (el('afFxRate'))      el('afFxRate').value       = '';

    if (!type) {
      majorEl.disabled = true;
      minorEl.disabled = true;
      const fromEl = el('afFromAccount');
      if (fromEl) { fromEl.disabled = true; fromEl.innerHTML = '<option value="">— select type first —</option>'; }
      const toEl = el('afToAccount');
      if (toEl) { toEl.disabled = true; toEl.innerHTML = '<option value="">External</option>'; }
      const fxWrap = el('afFxRateWrap');
      if (fxWrap) fxWrap.style.display = 'none';
      return;
    }

    majorEl.innerHTML = _catMajorOpts(type);
    majorEl.disabled  = false;
    minorEl.disabled  = false;

    // _afRefreshFromAccountOpts cascades → _afRefreshToAccountField → _afRefreshFxRateVis
    _afRefreshFromAccountOpts();
  });

  el('afMajor')?.addEventListener('change', () => {
    const type   = el('afType').value;
    const major  = el('afMajor').value;
    el('afMinor').innerHTML = _catMinorOpts(type, major);
    _afRefreshFromAccountOpts();  // clear any previous category hint
  });

  el('afMinor')?.addEventListener('change', _afRefreshFromAccountOpts);

  el('afFromAccount')?.addEventListener('change', _afRefreshToAccountField);

  el('afToAccount')?.addEventListener('change', _afRefreshFxRateVis);

  el('afFxRate')?.addEventListener('input', _afUpdateFxPreview);
  el('afAmount')?.addEventListener('input', _afUpdateFxPreview);

  el('afSubmit')?.addEventListener('click', _saveTransaction);
  el('afReset')?.addEventListener('click', () => {
    ['afDate','afAmount','afCounterparty','afCountry','afTags','afNotes','afFxRate']
      .forEach(id => { if (el(id)) el(id).value = id === 'afDate' ? nowLocalISO() : ''; });
    el('afType').value = '';
    const fromEl = el('afFromAccount');
    if (fromEl) { fromEl.disabled = true; fromEl.innerHTML = '<option value="">— select type first —</option>'; }
    const toEl = el('afToAccount');
    if (toEl) { toEl.disabled = true; toEl.innerHTML = '<option value="">External</option>'; }
    el('afMajor').innerHTML = '<option value="">— select type first —</option>';
    el('afMajor').disabled  = true;
    el('afMinor').innerHTML = '<option value="">— select major first —</option>';
    el('afMinor').disabled  = true;
    const fxWrap = el('afFxRateWrap');
    if (fxWrap) fxWrap.style.display = 'none';
    el('afError').textContent = '';
  });
}

function _afRefreshFromAccountOpts() {
  const type   = el('afType')?.value  || '';
  const major  = el('afMajor')?.value || '';
  const minor  = el('afMinor')?.value || '';
  const fromEl = el('afFromAccount');
  if (!fromEl) return;
  const cat          = _getCat(type, major, minor);
  const srcMandatory = cat ? Boolean(cat.source_account_mandatory) : type !== 'money-in';

  if (!srcMandatory) {
    fromEl.disabled  = true;
    fromEl.innerHTML = `<option value="">External</option>`;
    fromEl.value     = '';
  } else {
    fromEl.disabled  = false;
    const prevVal    = fromEl.value;
    const activeAccs = state.accounts.filter(a => a.is_active === true);
    const srcTypes   = cat?.source_account_types || '';
    fromEl.innerHTML = `<option value="">— select —</option>${_acctOptsWithHints(activeAccs, srcTypes, prevVal)}`;
    if (prevVal) fromEl.value = prevVal;
  }
  _afRefreshToAccountField();
}

function _afRefreshToAccountField() {
  const type   = el('afType')?.value  || '';
  const major  = el('afMajor')?.value || '';
  const minor  = el('afMinor')?.value || '';
  const cat    = _getCat(type, major, minor);
  const isTransfer      = type === 'money-transfer';
  const targetMandatory = cat ? Boolean(cat.target_account_mandatory) : isTransfer;

  const toAccEl = el('afToAccount');
  if (!toAccEl) return;

  if (targetMandatory) {
    toAccEl.disabled  = false;
    const fromId      = el('afFromAccount')?.value || '';
    const prevVal     = toAccEl.value;
    const activeAccs  = state.accounts.filter(a => a.is_active === true);
    const dstTypes    = cat?.destination_account_types || '';
    const eligible    = activeAccs.filter(a => a.id !== fromId);
    toAccEl.innerHTML = `<option value="">— select —</option>${_acctOptsWithHints(eligible, dstTypes, prevVal)}`;
    if (prevVal && prevVal !== fromId) toAccEl.value = prevVal;
  } else {
    toAccEl.disabled  = true;
    toAccEl.innerHTML = `<option value="">External</option>`;
    toAccEl.value     = '';
  }
  _afRefreshFxRateVis();
}

function _afRefreshFxRateVis() {
  const fromAcc = state.accounts.find(a => a.id === el('afFromAccount')?.value);
  const toAcc   = state.accounts.find(a => a.id === el('afToAccount')?.value);
  const show    = fromAcc && toAcc && fromAcc.currency !== toAcc.currency;
  const wrap    = el('afFxRateWrap');

  if (wrap) wrap.style.display = show ? '' : 'none';
  if (!show && el('afFxRate')) el('afFxRate').value = '';

  const dirEl = el('afFxDirection');
  const prvEl = el('afFxPreview');
  if (show) {
    const fromCcy = fromAcc.currency;
    const toCcy   = toAcc.currency;
    if (dirEl) dirEl.textContent = `Rate: units of ${toCcy} per 1 ${fromCcy} (e.g. 105 ${toCcy} per 1 ${fromCcy})`;
  } else {
    if (dirEl) dirEl.textContent = '';
    if (prvEl) prvEl.textContent = '';
  }
  _afUpdateFxPreview();
}

function _afUpdateFxPreview() {
  const prvEl   = el('afFxPreview');
  if (!prvEl) return;
  const fromAcc = state.accountMap[el('afFromAccount')?.value];
  const toAcc   = state.accountMap[el('afToAccount')?.value];
  const fxRate  = parseFloat(el('afFxRate')?.value) || 0;
  const amount  = parseFloat(el('afAmount')?.value) || 0;
  if (fromAcc && toAcc && fromAcc.currency !== toAcc.currency && fxRate > 0 && amount > 0) {
    const credited = (amount * fxRate).toFixed(2);
    prvEl.textContent = `${amount} ${fromAcc.currency} will be sent; ${credited} ${toAcc.currency} will be credited to ${toAcc.name}`;
  } else {
    prvEl.textContent = '';
  }
}

// ── Financial hard-block rules 1–6 ───────────────────────────────────────────
// Returns null on pass, or a multi-line error string on block.
// Rules 1 & 3 — insufficient balance (asset accounts).
// Rules 2 & 4 — credit limit exceeded (credit-card accounts).
// Rule 5     — money-out from a loan account (with exemption for interest/charges).
// Rule 6     — FX rate required for cross-currency money-transfer.

function _checkBalanceRules(transaction_type, sourceAccount, amount) {
  if (!sourceAccount) return null;
  const isMoneyOut      = transaction_type === 'money-out';
  const isTransfer      = transaction_type === 'money-transfer';
  if (!isMoneyOut && !isTransfer) return null;

  const sym = getSymbol(sourceAccount.currency);
  const fmt = n => Number(n).toFixed(2);

  // Rules 1 & 3 — asset accounts
  if ((state.accountSchema?.asset_types || []).includes(sourceAccount.type)) {
    const balance = Number(sourceAccount.current_balance);
    if (balance < amount) {
      return (
        `Insufficient balance.\n` +
        `${sourceAccount.name} has ${sym}${fmt(balance)} — this transaction requires ${sym}${fmt(amount)}.\n` +
        `Record an Adjustments / Balance correction first if your actual balance is higher.`
      );
    }
    return null;
  }

  // Rules 2 & 4 — credit card accounts
  if (sourceAccount.type === 'credit_card') {
    const creditLimit = Number(sourceAccount.credit_card_limit) || 0;
    if (creditLimit <= 0) return null; // no limit set — skip check

    const balance        = Number(sourceAccount.current_balance); // negative: amount owed stored as negative
    const availableCredit = creditLimit + balance;                // e.g. limit=1000, balance=−600 → available=400

    if (amount > availableCredit) {
      const owed = Math.abs(balance);
      if (availableCredit < 0) {
        // Already over the limit before this transaction
        const alreadyOver = Math.abs(availableCredit);
        return (
          `Credit limit exceeded.\n` +
          `${sourceAccount.name} — limit ${sym}${fmt(creditLimit)}, currently ${sym}${fmt(owed)} owed, already ${sym}${fmt(alreadyOver)} over the limit.\n` +
          `This transaction of ${sym}${fmt(amount)} cannot be applied.`
        );
      } else {
        // Within limit but this transaction would exceed it
        const overage = amount - availableCredit;
        return (
          `Credit limit exceeded.\n` +
          `${sourceAccount.name} — limit ${sym}${fmt(creditLimit)}, currently ${sym}${fmt(owed)} owed, available ${sym}${fmt(availableCredit)}.\n` +
          `This transaction of ${sym}${fmt(amount)} would exceed the limit by ${sym}${fmt(overage)}.`
        );
      }
    }
    return null;
  }

  return null;
}

// Rule 5 — block money-out from a loan account.
// Exemption: major_category === 'Debt & finance' AND minor_category === 'Interest & charges'.
// Returns null on pass, or the error string on block.
function _checkRule5(transaction_type, sourceAccount, major_category, minor_category) {
  if (transaction_type !== 'money-out') return null;
  if (!sourceAccount) return null;
  const loanTypes = state.accountSchema?.loan_types || [];
  if (!loanTypes.includes(sourceAccount.type)) return null;
  if (major_category === 'Debt & finance' && minor_category === 'Interest & charges') return null;
  return (
    `Cannot record money-out from a loan account.\n` +
    `Loan accounts track what you owe. To record a loan fee or charge, add it as a money-out from your current account, or record it directly in the sheet.`
  );
}

// Rule 6 — FX rate required for cross-currency money-transfer or linked money-out.
// Returns null on pass, or the error string on block.
function _checkRule6(transaction_type, sourceAccount, targetAccount, fx_rate) {
  if (transaction_type !== 'money-transfer') return null;
  if (!sourceAccount || !targetAccount) return null;
  const fromCcy = sourceAccount.currency;
  const toCcy   = targetAccount.currency;
  if (fromCcy === toCcy) return null;
  if (fx_rate && parseFloat(fx_rate) > 0) return null;
  return (
    `FX rate required.\n` +
    `${sourceAccount.name} is in ${fromCcy} and ${targetAccount.name} is in ${toCcy}. Enter the exchange rate to continue.\n` +
    `(Rate expressed as units of ${toCcy} per 1 ${fromCcy}.)`
  );
}

async function _saveTransaction() {
  const btn   = el('afSubmit');
  const errEl = el('afError');
  errEl.textContent = '';

  const dateRaw          = el('afDate').value;
  const transaction_type = el('afType').value;
  const source_account   = el('afFromAccount').value;
  const target_account   = el('afToAccount')?.value || '';
  const fx_rate          = el('afFxRate')?.value     || '';
  const amount           = el('afAmount').value;
  const currency         = transaction_type === 'money-in'
    ? (state.accountMap[target_account]?.currency || '')
    : (state.accountMap[source_account]?.currency || '');
  const major_category   = el('afMajor').value;
  const minor_category   = el('afMinor').value;
  const counterparty     = el('afCounterparty').value.trim();
  const country          = el('afCountry').value.trim();
  const tags             = el('afTags').value.trim();
  const notes            = el('afNotes').value.trim();

  const isTransfer    = transaction_type === 'money-transfer';
  const _saveCat      = _getCat(transaction_type, major_category, minor_category);
  const srcMandatory  = _saveCat ? Boolean(_saveCat.source_account_mandatory) : transaction_type !== 'money-in';
  const tgtMandatory  = _saveCat ? Boolean(_saveCat.target_account_mandatory) : isTransfer;
  if (!dateRaw)                                  { errEl.textContent = 'Date is required.';                          return; }
  if (!transaction_type)                         { errEl.textContent = 'Type is required.';                          return; }
  if (srcMandatory && !source_account)           { errEl.textContent = 'Source account is required.';                return; }
  if (tgtMandatory && !target_account)           { errEl.textContent = 'Target account is required.';                return; }
  if (!amount || parseFloat(amount) <= 0)        { errEl.textContent = 'Enter a positive amount.';                   return; }
  if (!isTransfer && !major_category)            { errEl.textContent = 'Major category is required.';                return; }
  if (!isTransfer && !minor_category)            { errEl.textContent = 'Minor category is required.';                return; }

  const sourceAcc     = state.accountMap[source_account];
  const targetAcc     = state.accountMap[target_account];
  const balanceError  = _checkBalanceRules(transaction_type, sourceAcc, parseFloat(amount));
  if (balanceError) { errEl.textContent = balanceError; return; }

  const rule5Error    = _checkRule5(transaction_type, sourceAcc, major_category, minor_category);
  if (rule5Error) { errEl.textContent = rule5Error; return; }

  const rule6Error    = _checkRule6(transaction_type, sourceAcc, targetAcc, fx_rate);
  if (rule6Error) { errEl.textContent = rule6Error; return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  showLoading();
  try {
    const res = await ExpenseAPI.createTransaction({
      transaction_date_utc: new Date(dateRaw).toISOString(),
      transaction_type, source_account, target_account,
      amount: parseFloat(amount), currency,
      fx_rate: fx_rate ? parseFloat(fx_rate) : '',
      major_category, minor_category, counterparty, country,
      tags, notes,
    });
    if (res.ok) {
      showMsg('Transaction saved.');
      addFormOpen = false;
      document.dispatchEvent(new CustomEvent('et:reload'));
    } else {
      errEl.textContent = 'Error: ' + (res.error || 'unknown');
      btn.disabled = false; btn.textContent = 'Save';
    }
  } catch (_) {
    errEl.textContent = 'Connection error.';
    btn.disabled = false; btn.textContent = 'Save';
  } finally {
    hideLoading();
  }
}

// ── Transaction edit / delete ─────────────────────────────────────────────────

function _renderTxEditRow(tx) {
  const r = tx._row;
  const activeAccounts = state.accounts.filter(
    a => a.is_active === true
  );
  const _editCat        = _getCat(tx.transaction_type, tx.major_category, tx.minor_category);
  const fromAccountOpts = _acctOptsWithHints(activeAccounts, _editCat?.source_account_types || '', tx.source_account);
  const toAccountOpts   = _acctOptsWithHints(
    activeAccounts.filter(a => a.id !== tx.source_account),
    _editCat?.destination_account_types || '',
    tx.target_account
  );
  const typeOpts = _txTypes().map(t =>
    `<option value="${esc(t.value)}" ${tx.transaction_type === t.value ? 'selected' : ''}>${esc(t.label)}</option>`
  ).join('');
  const majorOpts = _catMajorOpts(tx.transaction_type, tx.major_category);
  const minorOpts = _catMinorOpts(tx.transaction_type, tx.major_category, tx.minor_category);

  const dateVal = (() => {
    const s = String(tx.transaction_date_utc || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return s.slice(0, 10);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  const fromCcy    = state.accountMap[tx.source_account]?.currency;
  const toCcy      = state.accountMap[tx.target_account]?.currency;
  const isXfer     = tx.transaction_type === 'money-transfer';
  const tgtMand    = _editCat ? Boolean(_editCat.target_account_mandatory) : isXfer;
  const isCrossCcy = tgtMand && fromCcy && toCcy && fromCcy !== toCcy;
  const fxDisplay  = isCrossCcy ? '' : 'display:none';
  const fxDirText  = isCrossCcy ? `Rate: units of ${esc(toCcy)} per 1 ${esc(fromCcy)}` : '';

  return `<tr class="tx-edit-row">
    <td colspan="6">
      <div class="form-grid form-grid-6" style="padding:6px 0 4px">
        <!-- Row 1: Type | Major category | Minor category -->
        <div class="field form-grid-span-2">
          <label>Type</label>
          <select id="txEditType-${r}">${typeOpts}</select>
        </div>
        <div class="field form-grid-span-2" id="txEditMajorField-${r}">
          <label>Major category</label>
          <select id="txEditMajor-${r}">
            <option value="">— select —</option>
            ${majorOpts}
          </select>
        </div>
        <div class="field form-grid-span-2" id="txEditMinorField-${r}">
          <label>Minor category</label>
          <select id="txEditMinor-${r}">
            <option value="">— select —</option>
            ${minorOpts}
          </select>
        </div>
        <!-- Row 2: Source account | Target account | Country -->
        <div class="field form-grid-span-2">
          <label>Source account</label>
          <select id="txEditFromAccount-${r}">
            <option value="">— select —</option>
            ${fromAccountOpts}
          </select>
        </div>
        <div class="field form-grid-span-2" id="txEditToAccountWrap-${r}">
          <label>Target account</label>
          <select id="txEditToAccount-${r}" ${tgtMand ? '' : 'disabled'}>
            ${tgtMand
              ? `<option value="">— select —</option>${toAccountOpts}`
              : `<option value="">External</option>`}
          </select>
        </div>
        <div class="field form-grid-span-2" id="txEditCountryField-${r}">
          <label>Country</label>
          <input type="text" id="txEditCountry-${r}" value="${esc(tx.country || '')}">
        </div>
        <!-- FX rate: full width, shown only when cross-currency -->
        <div class="field form-grid-full" id="txEditFxRateWrap-${r}" style="${fxDisplay}">
          <label>FX rate</label>
          <input type="number" id="txEditFxRate-${r}" min="0.0001" step="any" value="${esc(String(tx.fx_rate || ''))}" style="max-width:240px">
          <div id="txEditFxDirection-${r}" class="field-hint">${fxDirText}</div>
          <div id="txEditFxPreview-${r}" class="field-hint" style="color:var(--teal)"></div>
        </div>
        <!-- Row 3: Date & time | Amount | Counterparty -->
        <div class="field form-grid-span-2">
          <label>Date &amp; time</label>
          <input type="datetime-local" id="txEditDate-${r}" value="${esc(dateVal)}">
        </div>
        <div class="field form-grid-span-2">
          <label>Amount</label>
          <input type="number" id="txEditAmount-${r}" min="0.01" step="0.01" value="${esc(String(tx.amount || ''))}">
        </div>
        <div class="field form-grid-span-2" id="txEditCounterpartyField-${r}">
          <label>Counterparty</label>
          <input type="text" id="txEditCounterparty-${r}" value="${esc(tx.counterparty || '')}">
        </div>
        <!-- Row 4: Tags 50% | Notes 50% -->
        <div class="field form-grid-span-3">
          <label>Tags</label>
          <input type="text" id="txEditTags-${r}" value="${esc(String(tx.tags || '').replace(/;/g, ', '))}">
        </div>
        <div class="field form-grid-span-3">
          <label>Notes</label>
          <input type="text" id="txEditNotes-${r}" value="${esc(tx.notes || '')}">
        </div>
      </div>
      <div class="form-actions" style="margin-top:6px">
        <button class="btn btn-primary btn-sm" data-action="tx-save-edit" data-row="${r}">Save</button>
        <button class="btn btn-secondary btn-sm" data-action="tx-cancel-edit">Cancel</button>
      </div>
      <div class="pin-error" id="txEditError-${r}"></div>
    </td>
  </tr>`;
}

function _renderTxViewRow(tx) {
  const badgeCls  = tx.transaction_type === 'money-in' ? 'badge-in' : tx.transaction_type === 'money-out' ? 'badge-out' : 'badge-transfer';
  const typeLabel = _txTypeMap()[tx.transaction_type] || tx.transaction_type;
  const fromName  = state.accountMap[tx.source_account]?.name || '—';
  const toName    = tx.target_account ? (state.accountMap[tx.target_account]?.name || '—') : 'External';

  const f = (label, value) =>
    `<div class="tx-detail-field"><div class="tx-detail-label">${label}</div><div class="tx-detail-value">${value}</div></div>`;

  return `<tr class="tx-view-row">
    <td colspan="6">
      <div class="tx-detail-grid">
        ${f('Date & time',      esc(fmtDateTime(tx.transaction_date_utc)))}
        ${f('Type',             `<span class="badge ${badgeCls}">${esc(typeLabel)}</span>${tx.transfer_id ? ' <span title="Transfer: '+esc(tx.transfer_id)+'">⇌</span>' : ''}`)}
        ${f('Source account',   esc(fromName))}
        ${f('Target account',   esc(toName))}
        ${f('Amount',           esc(fmtNative(tx.amount, tx.currency)))}
        ${f('≈ ' + state.quoteCurrency, esc(fmtBase(tx.amount, tx.currency, tx.fx_rate)))}
        ${f('Category',         esc([tx.major_category, tx.minor_category].filter(Boolean).join(' → ') || '—'))}
        ${f('Counterparty',     esc(tx.counterparty || '—'))}
        ${f('Country',          esc(tx.country || '—'))}
        ${f('Tags',             esc(String(tx.tags || '').replace(/;/g, ', ') || '—'))}
        ${f('Notes',            esc(tx.notes || '—'))}
        ${tx.fx_rate && parseFloat(tx.fx_rate) > 0 ? f('FX rate', esc(String(tx.fx_rate))) : ''}
      </div>
      <div style="margin-top:10px">
        <button class="btn btn-secondary btn-sm" data-action="tx-cancel-view">Close</button>
      </div>
    </td>
  </tr>`;
}

function _renderTxDeleteRow(tx) {
  const fromName = state.accountMap[tx.source_account]?.name || '—';
  const toName   = tx.target_account ? state.accountMap[tx.target_account]?.name : null;
  const accLabel = toName ? `${fromName} → ${toName}` : fromName;
  return `<tr>
    <td colspan="6">
      <span class="confirm-text">Delete <strong>${esc(fmtDateTime(tx.transaction_date_utc))}</strong> — ${esc(accLabel)} — ${esc(fmtNative(tx.amount, tx.currency))}? Account balance will be adjusted.</span>
      <span style="display:inline-flex;gap:8px;margin-left:16px">
        <button class="btn-link danger" data-action="tx-confirm-delete" data-row="${tx._row}">Yes, delete</button>
        <button class="btn-link" data-action="tx-cancel-delete">Cancel</button>
      </span>
    </td>
  </tr>`;
}

function _attachTxEditCascadeEvents(r) {
  const _txEditUpdateFxPreview = (row) => {
    const prvEl   = el(`txEditFxPreview-${row}`);
    if (!prvEl) return;
    const fromAcc = state.accountMap[el(`txEditFromAccount-${row}`)?.value];
    const toAcc   = state.accountMap[el(`txEditToAccount-${row}`)?.value];
    const fxRate  = parseFloat(el(`txEditFxRate-${row}`)?.value) || 0;
    const amount  = parseFloat(el(`txEditAmount-${row}`)?.value) || 0;
    if (fromAcc && toAcc && fromAcc.currency !== toAcc.currency && fxRate > 0 && amount > 0) {
      const credited    = (amount * fxRate).toFixed(2);
      prvEl.textContent = `${amount} ${fromAcc.currency} sent; ${credited} ${toAcc.currency} credited to ${toAcc.name}`;
    } else {
      prvEl.textContent = '';
    }
  };

  const _txEditRefreshFieldVis = (row) => {
    const type    = el(`txEditType-${row}`)?.value;
    const major   = el(`txEditMajor-${row}`)?.value || '';
    const minor   = el(`txEditMinor-${row}`)?.value || '';
    const cat     = _getCat(type, major, minor);
    const fromAcc = state.accountMap[el(`txEditFromAccount-${row}`)?.value];
    const toAcc   = state.accountMap[el(`txEditToAccount-${row}`)?.value];
    const isXfer     = type === 'money-transfer';
    const tgtMand    = cat ? Boolean(cat.target_account_mandatory) : isXfer;
    const isCrossCcy = tgtMand && fromAcc && toAcc && fromAcc.currency !== toAcc.currency;

    const toEl = el(`txEditToAccount-${row}`);
    if (toEl) {
      if (tgtMand) {
        toEl.disabled = false;
        if (toEl.innerHTML.trim().startsWith('<option value="">External')) {
          toEl.innerHTML = `<option value="">— select —</option>`;
        }
      } else {
        toEl.disabled  = true;
        toEl.innerHTML = `<option value="">External</option>`;
        toEl.value     = '';
      }
    }

    const fxWrap = el(`txEditFxRateWrap-${row}`);
    if (fxWrap) fxWrap.style.display = isCrossCcy ? '' : 'none';

    const dirEl = el(`txEditFxDirection-${row}`);
    if (dirEl) {
      dirEl.textContent = isCrossCcy
        ? `Rate: units of ${toAcc.currency} per 1 ${fromAcc.currency}`
        : '';
    }

    if (!isCrossCcy && el(`txEditFxRate-${row}`)) el(`txEditFxRate-${row}`).value = '';

    _txEditUpdateFxPreview(row);
  };

  el(`txEditType-${r}`)?.addEventListener('change', () => {
    const type = el(`txEditType-${r}`).value;
    el(`txEditMajor-${r}`).innerHTML = _catMajorOpts(type);
    el(`txEditMinor-${r}`).innerHTML = `<option value="">— select major first —</option>`;
    el(`txEditToAccount-${r}`).value = '';
    _txEditRefreshFieldVis(r);
  });
  el(`txEditMajor-${r}`)?.addEventListener('change', () => {
    const type   = el(`txEditType-${r}`).value;
    const major  = el(`txEditMajor-${r}`).value;
    el(`txEditMinor-${r}`).innerHTML = _catMinorOpts(type, major);
    _txEditRefreshAccountOpts(r);  // clear hint when major changes
  });

  el(`txEditMinor-${r}`)?.addEventListener('change', () => _txEditRefreshAccountOpts(r));

  const _txEditRefreshAccountOpts = (row) => {
    const type     = el(`txEditType-${row}`)?.value  || '';
    const major    = el(`txEditMajor-${row}`)?.value || '';
    const minor    = el(`txEditMinor-${row}`)?.value || '';
    const cat      = _getCat(type, major, minor);
    const srcTypes = cat?.source_account_types      || '';
    const dstTypes = cat?.destination_account_types || '';
    const srcMand  = cat ? Boolean(cat.source_account_mandatory) : type !== 'money-in';
    const actives  = state.accounts.filter(a => a.is_active === true);
    const fromEl   = el(`txEditFromAccount-${row}`);
    const toEl     = el(`txEditToAccount-${row}`);
    if (fromEl) {
      if (!srcMand) {
        fromEl.disabled  = true;
        fromEl.innerHTML = `<option value="">External</option>`;
        fromEl.value     = '';
      } else {
        fromEl.disabled  = false;
        const prev = fromEl.value;
        fromEl.innerHTML = `<option value="">— select —</option>${_acctOptsWithHints(actives, srcTypes, prev)}`;
        if (prev) fromEl.value = prev;
      }
    }
    if (toEl) {
      const fromId = fromEl?.value || '';
      const prev   = toEl.value;
      toEl.innerHTML = `<option value="">— none —</option>${_acctOptsWithHints(actives.filter(a => a.id !== fromId), dstTypes, prev)}`;
      if (prev && prev !== fromId) toEl.value = prev;
    }
    _txEditRefreshFieldVis(row);
  };

  el(`txEditFromAccount-${r}`)?.addEventListener('change', () => _txEditRefreshFieldVis(r));
  el(`txEditToAccount-${r}`)?.addEventListener('change', () => _txEditRefreshFieldVis(r));
  el(`txEditFxRate-${r}`)?.addEventListener('input', () => _txEditUpdateFxPreview(r));
  el(`txEditAmount-${r}`)?.addEventListener('input', () => _txEditUpdateFxPreview(r));
  // Initial render: apply source/target disabled state based on category flags
  _txEditRefreshAccountOpts(r);
}

async function _saveEdit(rowNum) {
  const r     = rowNum;
  const errEl = el(`txEditError-${r}`);
  errEl.textContent = '';

  const dateRaw          = el(`txEditDate-${r}`)?.value;
  const transaction_type = el(`txEditType-${r}`)?.value;
  const source_account   = el(`txEditFromAccount-${r}`)?.value;
  const target_account   = el(`txEditToAccount-${r}`)?.value  || '';
  const fx_rate          = el(`txEditFxRate-${r}`)?.value     || '';
  const amount           = el(`txEditAmount-${r}`)?.value;
  const currency         = transaction_type === 'money-in'
    ? (state.accountMap[target_account]?.currency || '')
    : (state.accountMap[source_account]?.currency || '');
  const major_category   = el(`txEditMajor-${r}`)?.value;
  const minor_category   = el(`txEditMinor-${r}`)?.value;
  const counterparty     = el(`txEditCounterparty-${r}`)?.value.trim();
  const country          = el(`txEditCountry-${r}`)?.value.trim();
  const tags             = el(`txEditTags-${r}`)?.value.trim();
  const notes            = el(`txEditNotes-${r}`)?.value.trim();

  const isEditTransfer   = transaction_type === 'money-transfer';
  const _editSaveCat     = _getCat(transaction_type, major_category, minor_category);
  const editSrcMandatory = _editSaveCat ? Boolean(_editSaveCat.source_account_mandatory) : transaction_type !== 'money-in';
  const editTgtMandatory = _editSaveCat ? Boolean(_editSaveCat.target_account_mandatory) : isEditTransfer;
  if (!dateRaw)                                 { errEl.textContent = 'Date is required.';                          return; }
  if (!transaction_type)                        { errEl.textContent = 'Type is required.';                          return; }
  if (editSrcMandatory && !source_account)      { errEl.textContent = 'Source account is required.';                return; }
  if (editTgtMandatory && !target_account)      { errEl.textContent = 'Target account is required.';                return; }
  if (!amount || parseFloat(amount) <= 0)       { errEl.textContent = 'Enter a positive amount.';                   return; }
  if (!isEditTransfer && !major_category)       { errEl.textContent = 'Major category is required.';                return; }
  if (!isEditTransfer && !minor_category)       { errEl.textContent = 'Minor category is required.';                return; }

  const fromAccEdit = state.accountMap[source_account];
  const toAccEdit   = state.accountMap[target_account];

  // Locate the original transaction so we can compute post-reversal balances.
  const oldTx = state.transactions.find(t => t._row === rowNum);

  // Post-reversal balance for source_account:
  // Phase 1 of the backend edit reverses the old transaction before Phase 2 applies new values.
  // We only undo the old debit/credit if the source_account hasn't changed.
  let fromPostRevBal = fromAccEdit ? Number(fromAccEdit.current_balance) : 0;
  if (oldTx && String(oldTx.source_account) === String(source_account)) {
    const oldAmt = Number(oldTx.amount) || 0;
    if (oldTx.transaction_type === 'money-in')       fromPostRevBal -= oldAmt; // reversal removes the credit
    if (oldTx.transaction_type === 'money-out')      fromPostRevBal += oldAmt; // reversal restores the debit
    if (oldTx.transaction_type === 'money-transfer') fromPostRevBal += oldAmt; // reversal restores the debit
  }
  // Proxy object with post-reversal balance — passed to _checkBalanceRules instead of fromAccEdit.
  const fromAccPR = fromAccEdit ? { ...fromAccEdit, current_balance: fromPostRevBal } : fromAccEdit;

  const balanceErrorEdit = _checkBalanceRules(transaction_type, fromAccPR, parseFloat(amount));
  if (balanceErrorEdit) { errEl.textContent = balanceErrorEdit; return; }

  const rule5ErrorEdit = _checkRule5(transaction_type, fromAccEdit, major_category, minor_category);
  if (rule5ErrorEdit) { errEl.textContent = rule5ErrorEdit; return; }

  const rule6ErrorEdit = _checkRule6(transaction_type, fromAccEdit, toAccEdit, fx_rate);
  if (rule6ErrorEdit) { errEl.textContent = rule6ErrorEdit; return; }

  // target_account credit-card check (transfer edits only)
  if (
    transaction_type === 'money-transfer' &&
    toAccEdit && toAccEdit.type === 'credit_card' &&
    Number(toAccEdit.credit_card_limit) > 0
  ) {
    // How much will be credited to target_account in Phase 2?
    const newFxRate   = fx_rate ? parseFloat(fx_rate) : 0;
    const newCredited = newFxRate > 0 ? parseFloat(amount) * newFxRate : parseFloat(amount);

    // Post-reversal balance of target_account: undo old credited amount (if same target_account).
    let toPostRevBal = Number(toAccEdit.current_balance);
    if (oldTx && String(oldTx.target_account) === String(target_account)) {
      const oldFx       = Number(oldTx.fx_rate) || 0;
      const oldCredited = oldFx > 0 ? Number(oldTx.amount) * oldFx : Number(oldTx.amount);
      toPostRevBal     -= oldCredited; // reversal removes the old credit
    }

    const toAvailable = Number(toAccEdit.credit_card_limit) + toPostRevBal;
    if (newCredited > toAvailable) {
      const sym  = getSymbol(toAccEdit.currency);
      const fmt  = n => Number(n).toFixed(2);
      const owed = Math.abs(toPostRevBal);
      if (toAvailable < 0) {
        errEl.textContent =
          `Credit limit exceeded.\n` +
          `${toAccEdit.name} — limit ${sym}${fmt(toAccEdit.credit_card_limit)}, currently ${sym}${fmt(owed)} owed, already ${sym}${fmt(Math.abs(toAvailable))} over the limit.\n` +
          `This credit of ${sym}${fmt(newCredited)} cannot be applied.`;
      } else {
        errEl.textContent =
          `Credit limit exceeded.\n` +
          `${toAccEdit.name} — limit ${sym}${fmt(toAccEdit.credit_card_limit)}, currently ${sym}${fmt(owed)} owed, available ${sym}${fmt(toAvailable)}.\n` +
          `This credit of ${sym}${fmt(newCredited)} would exceed the limit by ${sym}${fmt(newCredited - toAvailable)}.`;
      }
      return;
    }
  }

  showLoading();
  try {
    const res = await ExpenseAPI.updateTransaction({
      row_num: rowNum, transaction_date_utc: new Date(dateRaw).toISOString(), transaction_type,
      source_account, target_account, amount: parseFloat(amount), currency,
      fx_rate: fx_rate ? parseFloat(fx_rate) : '',
      major_category, minor_category, counterparty, country, tags, notes,
    });
    if (res.ok) {
      showMsg('Transaction updated.');
      state.txEditRow = null;
      document.dispatchEvent(new CustomEvent('et:reload'));
    } else {
      errEl.textContent = 'Error: ' + (res.error || 'unknown');
    }
  } catch (_) {
    errEl.textContent = 'Connection error.';
  } finally {
    hideLoading();
  }
}

async function _confirmDelete(rowNum) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteTransaction({ row_num: rowNum });
    if (res.ok) {
      showMsg('Transaction deleted.');
      state.txDeleteRow = null;
      document.dispatchEvent(new CustomEvent('et:reload'));
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      state.txDeleteRow = null;
      renderTransactions();
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
    state.txDeleteRow = null;
    renderTransactions();
  } finally {
    hideLoading();
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function _renderFilterBar() {
  const f        = state.filters;
  const allTypes = _txTypes();
  const allAccs  = state.accounts;
  const allMajor = [...new Set(state.categories.map(c => c.major_category))];
  const allMinor = [...new Set(state.categories.map(c => c.minor_category))];

  const activeChips = [
    ...f.types.map(t    => ({ label: _txTypeMap()[t] || t, key: 'types',    val: t })),
    ...f.accounts.map(id => ({ label: state.accountMap[id]?.name || id, key: 'accounts', val: id })),
    ...f.major.map(m    => ({ label: m,                   key: 'major',    val: m })),
    ...f.minor.map(m    => ({ label: m,                   key: 'minor',    val: m })),
    ...(f.country ? [{ label: 'Country: '+f.country, key: 'country', val: '' }] : []),
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
            <input type="checkbox" data-filter-type="${esc(t.value)}" ${f.types.includes(t.value) ? 'checked' : ''}> ${esc(t.label)}
          </label>`).join('')}
        </div>
      </div>
      <div class="filter-row">
        <label>Account</label>
        <select id="filterAccount">
          <option value="">All accounts</option>
          ${allAccs.map(a => `<option value="${esc(a.id)}" ${f.accounts.includes(a.id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
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

function _attachFilterEvents() {
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
