import { state, VALID_TX_TYPES } from '../core/state.js';
import { el, esc, fmtDateTime, fmtNative, fmtBase, nowLocalISO, toDateInputVal, exportData, getSymbol } from '../core/utils.js';
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
    const active = cats.some(x => x.major_category === c.major_category && x.is_active !== false);
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
      return c.is_active !== false
        ? `<option value="${esc(c.minor_category)}" ${sel}>${esc(c.minor_category)}</option>`
        : `<option value="${esc(c.minor_category)}" ${sel} disabled style="color:var(--muted)">${esc(c.minor_category)} (archived)</option>`;
    }).join('');
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

  el('exportCsv')?.addEventListener('click', () => exportData('csv', rows));
  el('exportJson')?.addEventListener('click', () => exportData('json', rows));

  if (warnRows.length) {
    el('warnToggle')?.addEventListener('click', () => el('warnTable')?.classList.toggle('hidden'));
  }
}

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
    if (state.txDeleteRow === tx._row) return renderTxDeleteRow(tx);
    if (state.txEditRow   === tx._row) return renderTxEditRow(tx);

    const badgeCls  = tx.transaction_type === 'money-in' ? 'badge-in' : tx.transaction_type === 'money-out' ? 'badge-out' : 'badge-transfer';
    const typeLabel = _txTypeMap()[tx.transaction_type] || tx.transaction_type;
    const missingRate = !state.rateMap[tx.currency];
    const rowRate     = tx.fx_rate && parseFloat(tx.fx_rate) > 0;

    return `<tr>
      <td class="td-mono">${esc(fmtDateTime(tx.transaction_date_utc))}</td>
      <td><span class="badge ${badgeCls}">${typeLabel}</span>${tx.transfer_id ? ' <span title="Transfer: '+esc(tx.transfer_id)+'">⇌</span>' : ''}</td>
      <td>${tx.transaction_type === 'money-transfer' && tx.to_account
        ? `${esc(state.accountMap[tx.from_account]?.name || '—')} → ${esc(state.accountMap[tx.to_account]?.name || '—')}`
        : esc(state.accountMap[tx.from_account]?.name || '—')
      }</td>
      <td class="td-mono">${esc(fmtNative(tx.amount, tx.currency))}${missingRate ? ' <span class="badge badge-warn" title="Currency not in rates tab">?</span>' : ''}</td>
      <td class="td-mono">${esc(fmtBase(tx.amount, tx.currency, tx.fx_rate))}${rowRate ? ' <span title="Row-level FX rate used" style="color:var(--muted);font-size:10px">†</span>' : ''}</td>
      <td>${esc(tx.major_category || '—')} ${tx.minor_category ? '→ ' + esc(tx.minor_category) : ''}</td>
      <td>${esc(tx.counterparty || '—')}</td>
      <td class="td-muted">${esc(tx.country || '—')}</td>
      <td><div class="row-actions">
        <button class="btn-link" data-action="tx-edit" data-row="${tx._row}">Edit</button>
        <button class="btn-link danger" data-action="tx-delete" data-row="${tx._row}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');

  const warnRowsHtml = warnRows.length ? `
    <tbody id="warnTable" class="hidden">
      ${warnRows.map(tx => `<tr>
        <td colspan="9"><span class="badge badge-warn">⚠ malformed</span> id=${esc(String(tx.id||'?'))} type=${esc(tx.transaction_type||'?')} date=${esc(String(tx.transaction_date_utc||'?'))}</td>
      </tr>`).join('')}
    </tbody>` : '';

  const pagination = pages > 1 ? `
    <div class="pagination">
      <button class="btn btn-secondary btn-sm" id="prevPage" ${state.txPage <= 1 ? 'disabled' : ''}>← Prev</button>
      <span>Page ${state.txPage} of ${pages} (${total} rows)</span>
      <button class="btn btn-secondary btn-sm" id="nextPage" ${state.txPage >= pages ? 'disabled' : ''}>Next →</button>
    </div>` : `<div class="pagination">${total} rows</div>`;

  const html = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${thSort('transaction_date_utc','Date')}
          ${thSort('transaction_type','Type')}
          ${thSort('from_account','Account')}
          <th>Amount</th>
          <th>≈ ${esc(state.quoteCurrency)}</th>
          ${thSort('major_category','Category')}
          ${thSort('counterparty','Counterparty')}
          <th>Country</th>
          <th style="width:100px">Actions</th>
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

    el('transactionsContent')?.querySelector('.table-wrap')?.addEventListener('click', e => {
      const btn    = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const row    = btn.dataset.row ? Number(btn.dataset.row) : null;
      if (action === 'tx-edit')           { state.txEditRow = row; state.txDeleteRow = null; renderTransactions(); }
      if (action === 'tx-cancel-edit')    { state.txEditRow = null; renderTransactions(); }
      if (action === 'tx-save-edit')      { saveEdit(row); }
      if (action === 'tx-delete')         { state.txDeleteRow = row; state.txEditRow = null; renderTransactions(); }
      if (action === 'tx-cancel-delete')  { state.txDeleteRow = null; renderTransactions(); }
      if (action === 'tx-confirm-delete') { confirmDelete(row); }
    });

    if (state.txEditRow !== null) attachTxEditCascadeEvents(state.txEditRow);
  }, 0);

  return html;
}

function sortTx(rows) {
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

function renderAddForm() {
  const activeAccounts = state.accounts.filter(
    a => a.is_active === true || a.is_active === 'TRUE' || a.is_active === 'true'
  );
  return `
  <div class="add-form-wrap">
    <button class="add-form-toggle" id="addFormToggle">
      Add transaction
      <span class="plus-icon">${addFormOpen ? '×' : '+'}</span>
    </button>
    <div class="add-form-body ${addFormOpen ? '' : 'hidden'}" id="addFormBody">
      <div class="form-grid form-grid-4">
        <div class="field">
          <label for="afType">Type *</label>
          <select id="afType">
            <option value="">— select —</option>
            ${_txTypes().map(t => `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="afMajorField">
          <label for="afMajor">Major category *</label>
          <select id="afMajor" disabled><option value="">— select type first —</option></select>
        </div>
        <div class="field" id="afMinorField">
          <label for="afMinor">Minor category *</label>
          <select id="afMinor" disabled><option value="">— select major first —</option></select>
        </div>
        <div class="field">
          <label for="afFromAccount" id="afFromAccountLabel">From account *</label>
          <select id="afFromAccount" disabled>
            <option value="">— select type first —</option>
            ${activeAccounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.currency)})</option>`).join('')}
          </select>
        </div>
        <div class="field" id="afToAccountField" style="display:none">
          <label for="afToAccount">To account *</label>
          <select id="afToAccount">
            <option value="">— select —</option>
            ${activeAccounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.currency)})</option>`).join('')}
          </select>
        </div>
        <div class="field" id="afFxRateWrap" style="display:none">
          <label for="afFxRate">FX rate</label>
          <input type="number" id="afFxRate" min="0.0001" step="any" placeholder="e.g. 105">
          <div id="afFxDirection" class="field-hint" style="display:none"></div>
          <div id="afFxPreview"   class="field-hint" style="display:none;color:var(--teal)"></div>
        </div>
        <div id="afTransferFxSpacer" style="display:none"></div>
        <div class="field">
          <label for="afDate">Date &amp; time *</label>
          <input type="datetime-local" id="afDate" value="${nowLocalISO()}">
        </div>
        <div class="field" id="afCounterpartyField">
          <label for="afCounterparty">Counterparty</label>
          <input type="text" id="afCounterparty" placeholder="Tesco, employer, …">
        </div>
        <div class="field">
          <label for="afAmount">Amount *</label>
          <input type="number" id="afAmount" min="0.01" step="0.01" placeholder="0.00">
        </div>
        <div class="field" id="afCountryField">
          <label for="afCountry">Country</label>
          <input type="text" id="afCountry" placeholder="UK">
        </div>
        <div class="field form-grid-span-2">
          <label for="afTags">Tags</label>
          <input type="text" id="afTags" placeholder="reimbursable, work">
        </div>
        <div class="field form-grid-span-2" id="afNotesField">
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

function attachAddFormEvents() {
  el('addFormToggle')?.addEventListener('click', () => { addFormOpen = !addFormOpen; renderTransactions(); });

  el('afType')?.addEventListener('change', () => {
    const type        = el('afType').value;
    const majorEl     = el('afMajor');
    const minorEl     = el('afMinor');
    const fromAccEl   = el('afFromAccount');
    const isTransfer  = type === 'money-transfer';
    const isMoneyIn   = type === 'money-in';

    // Update From/To account label based on transaction direction
    const fromLabelEl = el('afFromAccountLabel');
    if (fromLabelEl) fromLabelEl.textContent = isMoneyIn ? 'To account *' : 'From account *';

    majorEl.innerHTML = '<option value="">— select type first —</option>';
    minorEl.innerHTML = '<option value="">— select major first —</option>';
    fromAccEl.value   = '';
    if (el('afToAccount'))  el('afToAccount').value  = '';
    if (el('afFxRate'))     el('afFxRate').value      = '';

    if (!type) {
      majorEl.disabled   = true;
      minorEl.disabled   = true;
      fromAccEl.disabled = true;
      el('afToAccountField').style.display   = 'none';
      el('afFxRateWrap').style.display       = 'none';
      el('afTransferFxSpacer').style.display = 'none';
      ['afMajorField', 'afMinorField', 'afCounterpartyField', 'afCountryField'].forEach(id => {
        const f = el(id); if (f) f.style.display = '';
      });
      const notesField = el('afNotesField');
      if (notesField) { notesField.classList.remove('form-grid-full'); notesField.classList.add('form-grid-span-2'); }
      return;
    }

    majorEl.innerHTML = _catMajorOpts(type);
    majorEl.disabled   = false;
    minorEl.disabled   = false;
    fromAccEl.disabled = false;

    // Transfer: show To account inline (same row as From account); hide categorisation fields
    el('afToAccountField').style.display = isTransfer ? '' : 'none';
    if (isTransfer) {
      _afRefreshToAccountOpts();
      _afRefreshFxRateVis(); // sets spacer so Date stays on row 2
    } else {
      el('afFxRateWrap').style.display       = 'none';
      el('afTransferFxSpacer').style.display = 'none';
    }

    // Categorisation fields only apply to money-in and money-out
    ['afMajorField', 'afMinorField', 'afCounterpartyField', 'afCountryField'].forEach(id => {
      const f = el(id);
      if (f) f.style.display = isTransfer ? 'none' : '';
    });

    // Notes spans full width for transfer (no Tags neighbour), half for money-in/out
    const notesField = el('afNotesField');
    if (notesField) {
      if (isTransfer) {
        notesField.classList.remove('form-grid-span-2');
        notesField.classList.add('form-grid-full');
      } else {
        notesField.classList.remove('form-grid-full');
        notesField.classList.add('form-grid-span-2');
      }
    }
  });

  el('afMajor')?.addEventListener('change', () => {
    const type   = el('afType').value;
    const major  = el('afMajor').value;
    el('afMinor').innerHTML = _catMinorOpts(type, major);
  });

  el('afFromAccount')?.addEventListener('change', () => {
    if (el('afType').value === 'money-transfer') _afRefreshToAccountOpts();
    _afRefreshFxRateVis();
  });

  el('afToAccount')?.addEventListener('change', _afRefreshFxRateVis);

  el('afFxRate')?.addEventListener('input', _afUpdateFxPreview);
  el('afAmount')?.addEventListener('input', _afUpdateFxPreview);

  el('afSubmit')?.addEventListener('click', saveTransaction);
  el('afReset')?.addEventListener('click', () => {
    ['afDate','afAmount','afCounterparty','afCountry','afTags','afNotes','afFxRate']
      .forEach(id => { if (el(id)) el(id).value = id === 'afDate' ? nowLocalISO() : ''; });
    el('afType').value              = '';
    el('afFromAccount').value       = '';
    el('afFromAccount').disabled    = true;
    if (el('afToAccount')) el('afToAccount').value = '';
    el('afMajor').innerHTML         = '<option value="">— select type first —</option>';
    el('afMajor').disabled          = true;
    el('afMinor').innerHTML         = '<option value="">— select major first —</option>';
    el('afMinor').disabled          = true;
    el('afToAccountField').style.display   = 'none';
    el('afFxRateWrap').style.display       = 'none';
    el('afTransferFxSpacer').style.display = 'none';
    ['afMajorField', 'afMinorField', 'afCounterpartyField', 'afCountryField'].forEach(id => {
      const f = el(id); if (f) f.style.display = '';
    });
    const fromLabelEl = el('afFromAccountLabel');
    if (fromLabelEl) fromLabelEl.textContent = 'From account *';
    const notesField = el('afNotesField');
    if (notesField) { notesField.classList.remove('form-grid-full'); notesField.classList.add('form-grid-span-2'); }
    el('afError').textContent       = '';
  });
}

function _afRefreshToAccountOpts() {
  const fromId    = el('afFromAccount')?.value || '';
  const toAccEl   = el('afToAccount');
  if (!toAccEl) return;
  const activeAccs = state.accounts.filter(a => a.is_active === true || a.is_active === 'TRUE' || a.is_active === 'true');
  const prevVal    = toAccEl.value;
  const opts = activeAccs.filter(a => a.id !== fromId)
    .map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.currency)})</option>`)
    .join('');
  toAccEl.innerHTML = `<option value="">— select —</option>${opts}`;
  if (prevVal && prevVal !== fromId) toAccEl.value = prevVal;
}

function _afRefreshFxRateVis() {
  const fromAcc  = state.accounts.find(a => a.id === el('afFromAccount')?.value);
  const toAcc    = state.accounts.find(a => a.id === el('afToAccount')?.value);
  const show     = fromAcc && toAcc && fromAcc.currency !== toAcc.currency;
  const wrap     = el('afFxRateWrap');
  const spacer   = el('afTransferFxSpacer');
  const isXfer   = el('afType')?.value === 'money-transfer';

  if (wrap) wrap.style.display = show ? '' : 'none';
  if (!show && el('afFxRate')) el('afFxRate').value = '';
  // Spacer fills col 4 for same-currency transfers so Date stays on the next row
  if (spacer) spacer.style.display = (isXfer && !show) ? '' : 'none';

  const dirEl = el('afFxDirection');
  const prvEl = el('afFxPreview');
  if (show) {
    const fromCcy = fromAcc.currency;
    const toCcy   = toAcc.currency;
    if (dirEl) {
      dirEl.textContent    = `Rate: units of ${toCcy} per 1 ${fromCcy} (e.g. 105 ${toCcy} per 1 ${fromCcy})`;
      dirEl.style.display  = '';
    }
  } else {
    if (dirEl) { dirEl.style.display = 'none'; dirEl.textContent = ''; }
    if (prvEl) { prvEl.style.display = 'none'; prvEl.textContent = ''; }
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
    prvEl.textContent   = `${amount} ${fromAcc.currency} will be sent; ${credited} ${toAcc.currency} will be credited to ${toAcc.name}`;
    prvEl.style.display = '';
  } else {
    prvEl.textContent   = '';
    prvEl.style.display = 'none';
  }
}

// ── Financial hard-block rules 1–6 ───────────────────────────────────────────
// Returns null on pass, or a multi-line error string on block.
// Rules 1 & 3 — insufficient balance (asset accounts).
// Rules 2 & 4 — credit limit exceeded (credit-card accounts).
// Rule 5     — money-out from a loan account (with exemption for interest/charges).
// Rule 6     — FX rate required for cross-currency money-transfer.

const ASSET_ACCOUNT_TYPES = new Set(['current', 'savings', 'cash', 'investment']);

function checkBalanceRules(transaction_type, fromAccount, amount) {
  if (!fromAccount) return null;
  const isMoneyOut      = transaction_type === 'money-out';
  const isTransfer      = transaction_type === 'money-transfer';
  if (!isMoneyOut && !isTransfer) return null;

  const sym = getSymbol(fromAccount.currency);
  const fmt = n => Number(n).toFixed(2);

  // Rules 1 & 3 — asset accounts
  if (ASSET_ACCOUNT_TYPES.has(fromAccount.type)) {
    const balance = Number(fromAccount.current_balance);
    if (balance < amount) {
      return (
        `Insufficient balance.\n` +
        `${fromAccount.name} has ${sym}${fmt(balance)} — this transaction requires ${sym}${fmt(amount)}.\n` +
        `Record an Adjustments / Balance correction first if your actual balance is higher.`
      );
    }
    return null;
  }

  // Rules 2 & 4 — credit card accounts
  if (fromAccount.type === 'credit_card') {
    const creditLimit = Number(fromAccount.credit_card_limit) || 0;
    if (creditLimit <= 0) return null; // no limit set — skip check

    const balance        = Number(fromAccount.current_balance); // negative: amount owed stored as negative
    const availableCredit = creditLimit + balance;              // e.g. limit=1000, balance=−600 → available=400

    if (amount > availableCredit) {
      const owed = Math.abs(balance);
      if (availableCredit < 0) {
        // Already over the limit before this transaction
        const alreadyOver = Math.abs(availableCredit);
        return (
          `Credit limit exceeded.\n` +
          `${fromAccount.name} — limit ${sym}${fmt(creditLimit)}, currently ${sym}${fmt(owed)} owed, already ${sym}${fmt(alreadyOver)} over the limit.\n` +
          `This transaction of ${sym}${fmt(amount)} cannot be applied.`
        );
      } else {
        // Within limit but this transaction would exceed it
        const overage = amount - availableCredit;
        return (
          `Credit limit exceeded.\n` +
          `${fromAccount.name} — limit ${sym}${fmt(creditLimit)}, currently ${sym}${fmt(owed)} owed, available ${sym}${fmt(availableCredit)}.\n` +
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
function checkRule5(transaction_type, fromAccount, major_category, minor_category) {
  if (transaction_type !== 'money-out') return null;
  if (!fromAccount) return null;
  const loanTypes = state.accountSchema?.loan_types || [];
  if (!loanTypes.includes(fromAccount.type)) return null;
  if (major_category === 'Debt & finance' && minor_category === 'Interest & charges') return null;
  return (
    `Cannot record money-out from a loan account.\n` +
    `Loan accounts track what you owe. To record a loan fee or charge, add it as a money-out from your current account, or record it directly in the sheet.`
  );
}

// Rule 6 — FX rate required for cross-currency money-transfer.
// Returns null on pass, or the error string on block.
function checkRule6(transaction_type, fromAccount, toAccount, fx_rate) {
  if (transaction_type !== 'money-transfer') return null;
  if (!fromAccount || !toAccount) return null;
  const fromCcy = fromAccount.currency;
  const toCcy   = toAccount.currency;
  if (fromCcy === toCcy) return null;
  if (fx_rate && parseFloat(fx_rate) > 0) return null;
  return (
    `FX rate required.\n` +
    `${fromAccount.name} is in ${fromCcy} and ${toAccount.name} is in ${toCcy}. Enter the exchange rate to continue.\n` +
    `(Rate expressed as units of ${toCcy} per 1 ${fromCcy}.)`
  );
}

async function saveTransaction() {
  const btn   = el('afSubmit');
  const errEl = el('afError');
  errEl.textContent = '';

  const dateRaw          = el('afDate').value;
  const transaction_type = el('afType').value;
  const from_account     = el('afFromAccount').value;
  const to_account       = el('afToAccount')?.value || '';
  const fx_rate          = el('afFxRate')?.value     || '';
  const amount           = el('afAmount').value;
  const currency         = state.accounts.find(a => a.id === from_account)?.currency || '';
  const major_category   = el('afMajor').value;
  const minor_category   = el('afMinor').value;
  const counterparty     = el('afCounterparty').value.trim();
  const country          = el('afCountry').value.trim();
  const tags             = el('afTags').value.trim();
  const notes            = el('afNotes').value.trim();

  const isTransfer = transaction_type === 'money-transfer';
  if (!dateRaw)                                  { errEl.textContent = 'Date is required.';                          return; }
  if (!transaction_type)                         { errEl.textContent = 'Type is required.';                          return; }
  if (!from_account)                             { errEl.textContent = 'From account is required.';                  return; }
  if (isTransfer && !to_account)                 { errEl.textContent = 'To account is required for transfers.';      return; }
  if (!amount || parseFloat(amount) <= 0)        { errEl.textContent = 'Enter a positive amount.';                   return; }
  if (!isTransfer && !major_category)            { errEl.textContent = 'Major category is required.';                return; }
  if (!isTransfer && !minor_category)            { errEl.textContent = 'Minor category is required.';                return; }

  const fromAcc       = state.accountMap[from_account];
  const toAcc         = state.accountMap[to_account];
  const balanceError  = checkBalanceRules(transaction_type, fromAcc, parseFloat(amount));
  if (balanceError) { errEl.textContent = balanceError; return; }

  const rule5Error    = checkRule5(transaction_type, fromAcc, major_category, minor_category);
  if (rule5Error) { errEl.textContent = rule5Error; return; }

  const rule6Error    = checkRule6(transaction_type, fromAcc, toAcc, fx_rate);
  if (rule6Error) { errEl.textContent = rule6Error; return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  showLoading();
  try {
    const res = await ExpenseAPI.createTransaction({
      transaction_date_utc: new Date(dateRaw).toISOString(),
      transaction_type, from_account, to_account,
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

function renderTxEditRow(tx) {
  const r = tx._row;
  const activeAccounts = state.accounts.filter(
    a => a.is_active === true || a.is_active === 'TRUE' || a.is_active === 'true'
  );
  const fromAccountOpts = activeAccounts.map(a =>
    `<option value="${esc(a.id)}" ${tx.from_account === a.id ? 'selected' : ''}>${esc(a.name)} (${esc(a.currency)})</option>`
  ).join('');
  const toAccountOpts = activeAccounts.map(a =>
    `<option value="${esc(a.id)}" ${tx.to_account === a.id ? 'selected' : ''}>${esc(a.name)} (${esc(a.currency)})</option>`
  ).join('');
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

  const fromCcy    = state.accountMap[tx.from_account]?.currency;
  const toCcy      = state.accountMap[tx.to_account]?.currency;
  const isXfer     = tx.transaction_type === 'money-transfer';
  const categStyle = isXfer ? 'display:none' : '';
  const isCrossCcy = isXfer && fromCcy && toCcy && fromCcy !== toCcy;
  const toWrapStyle  = isXfer    ? '' : 'display:none';
  const fxWrapStyle  = isCrossCcy ? '' : 'display:none';
  const fxDirText    = isCrossCcy ? `Rate: units of ${esc(toCcy)} per 1 ${esc(fromCcy)}` : '';

  return `<tr class="tx-edit-row">
    <td colspan="9">
      <div class="form-grid form-grid-4" style="padding:6px 0 4px">
        <div class="field">
          <label>Date &amp; time</label>
          <input type="datetime-local" id="txEditDate-${r}" value="${esc(dateVal)}">
        </div>
        <div class="field">
          <label>Type</label>
          <select id="txEditType-${r}">${typeOpts}</select>
        </div>
        <div class="field">
          <label id="txEditFromAccountLabel-${r}">${tx.transaction_type === 'money-in' ? 'To account' : 'From account'}</label>
          <select id="txEditFromAccount-${r}">
            <option value="">— select —</option>
            ${fromAccountOpts}
          </select>
        </div>
        <div class="field">
          <label>Amount</label>
          <input type="number" id="txEditAmount-${r}" min="0.01" step="0.01" value="${esc(String(tx.amount || ''))}">
        </div>
        <div class="field" id="txEditMajorField-${r}" style="${categStyle}">
          <label>Major category</label>
          <select id="txEditMajor-${r}">
            <option value="">— select —</option>
            ${majorOpts}
          </select>
        </div>
        <div class="field" id="txEditMinorField-${r}" style="${categStyle}">
          <label>Minor category</label>
          <select id="txEditMinor-${r}">
            <option value="">— select —</option>
            ${minorOpts}
          </select>
        </div>
        <div class="field" id="txEditCounterpartyField-${r}" style="${categStyle}">
          <label>Counterparty</label>
          <input type="text" id="txEditCounterparty-${r}" value="${esc(tx.counterparty || '')}">
        </div>
        <div class="field" id="txEditCountryField-${r}" style="${categStyle}">
          <label>Country</label>
          <input type="text" id="txEditCountry-${r}" value="${esc(tx.country || '')}">
        </div>
        <div class="field" id="txEditToAccountWrap-${r}" style="${toWrapStyle}">
          <label>To account</label>
          <select id="txEditToAccount-${r}">
            <option value="">— none —</option>
            ${toAccountOpts}
          </select>
        </div>
        <div class="field" id="txEditFxRateWrap-${r}" style="${fxWrapStyle}">
          <label>FX rate</label>
          <input type="number" id="txEditFxRate-${r}" min="0.0001" step="any" value="${esc(String(tx.fx_rate || ''))}">
          <div id="txEditFxDirection-${r}" class="field-hint">${fxDirText}</div>
          <div id="txEditFxPreview-${r}" class="field-hint" style="color:var(--teal)"></div>
        </div>
        <div class="field">
          <label>Tags</label>
          <input type="text" id="txEditTags-${r}" value="${esc(String(tx.tags || '').replace(/;/g, ', '))}">
        </div>
        <div class="field">
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

function renderTxDeleteRow(tx) {
  const fromName = state.accountMap[tx.from_account]?.name || '—';
  const toName   = tx.to_account ? state.accountMap[tx.to_account]?.name : null;
  const accLabel = toName ? `${fromName} → ${toName}` : fromName;
  return `<tr>
    <td colspan="9">
      <span class="confirm-text">Delete <strong>${esc(fmtDateTime(tx.transaction_date_utc))}</strong> — ${esc(accLabel)} — ${esc(fmtNative(tx.amount, tx.currency))}? Account balance will be adjusted.</span>
      <span style="display:inline-flex;gap:8px;margin-left:16px">
        <button class="btn-link danger" data-action="tx-confirm-delete" data-row="${tx._row}">Yes, delete</button>
        <button class="btn-link" data-action="tx-cancel-delete">Cancel</button>
      </span>
    </td>
  </tr>`;
}

function attachTxEditCascadeEvents(r) {
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
    const type      = el(`txEditType-${row}`)?.value;
    const fromAcc   = state.accountMap[el(`txEditFromAccount-${row}`)?.value];
    const toAcc     = state.accountMap[el(`txEditToAccount-${row}`)?.value];
    const isXfer    = type === 'money-transfer';
    const isCrossCcy = isXfer && fromAcc && toAcc && fromAcc.currency !== toAcc.currency;

    // to_account wrap: visible only for transfers
    const toWrap = el(`txEditToAccountWrap-${row}`);
    if (toWrap) toWrap.style.display = isXfer ? '' : 'none';

    // fx_rate wrap: visible only for cross-currency transfers
    const fxWrap = el(`txEditFxRateWrap-${row}`);
    if (fxWrap) fxWrap.style.display = isCrossCcy ? '' : 'none';

    // Direction label
    const dirEl = el(`txEditFxDirection-${row}`);
    if (dirEl) {
      dirEl.textContent = isCrossCcy
        ? `Rate: units of ${toAcc.currency} per 1 ${fromAcc.currency}`
        : '';
    }

    // Clear fx_rate value when hidden
    if (!isCrossCcy && el(`txEditFxRate-${row}`)) el(`txEditFxRate-${row}`).value = '';

    // Categorisation fields only apply to money-in and money-out
    ['txEditMajorField', 'txEditMinorField', 'txEditCounterpartyField', 'txEditCountryField'].forEach(prefix => {
      const f = el(`${prefix}-${row}`);
      if (f) f.style.display = isXfer ? 'none' : '';
    });

    _txEditUpdateFxPreview(row);
  };

  el(`txEditType-${r}`)?.addEventListener('change', () => {
    const type   = el(`txEditType-${r}`).value;
    el(`txEditMajor-${r}`).innerHTML = _catMajorOpts(type);
    el(`txEditMinor-${r}`).innerHTML = `<option value="">— select major first —</option>`;
    el(`txEditToAccount-${r}`).value  = '';
    const fromLbl = el(`txEditFromAccountLabel-${r}`);
    if (fromLbl) fromLbl.textContent = type === 'money-in' ? 'To account' : 'From account';
    _txEditRefreshFieldVis(r);
  });
  el(`txEditMajor-${r}`)?.addEventListener('change', () => {
    const type   = el(`txEditType-${r}`).value;
    const major  = el(`txEditMajor-${r}`).value;
    el(`txEditMinor-${r}`).innerHTML = _catMinorOpts(type, major);
  });

  el(`txEditFromAccount-${r}`)?.addEventListener('change', () => _txEditRefreshFieldVis(r));
  el(`txEditToAccount-${r}`)?.addEventListener('change', () => _txEditRefreshFieldVis(r));
  el(`txEditFxRate-${r}`)?.addEventListener('input', () => _txEditUpdateFxPreview(r));
  el(`txEditAmount-${r}`)?.addEventListener('input', () => _txEditUpdateFxPreview(r));
  // Initial render for pre-filled values
  _txEditRefreshFieldVis(r);
}

async function saveEdit(rowNum) {
  const r     = rowNum;
  const errEl = el(`txEditError-${r}`);
  errEl.textContent = '';

  const dateRaw          = el(`txEditDate-${r}`)?.value;
  const transaction_type = el(`txEditType-${r}`)?.value;
  const from_account     = el(`txEditFromAccount-${r}`)?.value;
  const to_account       = el(`txEditToAccount-${r}`)?.value  || '';
  const fx_rate          = el(`txEditFxRate-${r}`)?.value     || '';
  const amount           = el(`txEditAmount-${r}`)?.value;
  const currency         = state.accounts.find(a => a.id === from_account)?.currency || '';
  const major_category   = el(`txEditMajor-${r}`)?.value;
  const minor_category   = el(`txEditMinor-${r}`)?.value;
  const counterparty     = el(`txEditCounterparty-${r}`)?.value.trim();
  const country          = el(`txEditCountry-${r}`)?.value.trim();
  const tags             = el(`txEditTags-${r}`)?.value.trim();
  const notes            = el(`txEditNotes-${r}`)?.value.trim();

  const isEditTransfer = transaction_type === 'money-transfer';
  if (!dateRaw)                                 { errEl.textContent = 'Date is required.';                          return; }
  if (!transaction_type)                        { errEl.textContent = 'Type is required.';                          return; }
  if (!from_account)                            { errEl.textContent = 'From account is required.';                  return; }
  if (isEditTransfer && !to_account)            { errEl.textContent = 'To account is required for transfers.';      return; }
  if (!amount || parseFloat(amount) <= 0)       { errEl.textContent = 'Enter a positive amount.';                   return; }
  if (!isEditTransfer && !major_category)       { errEl.textContent = 'Major category is required.';                return; }
  if (!isEditTransfer && !minor_category)       { errEl.textContent = 'Minor category is required.';                return; }

  const fromAccEdit = state.accountMap[from_account];
  const toAccEdit   = state.accountMap[to_account];

  // Locate the original transaction so we can compute post-reversal balances.
  const oldTx = state.transactions.find(t => t._row === rowNum);

  // Post-reversal balance for from_account:
  // Phase 1 of the backend edit reverses the old transaction before Phase 2 applies new values.
  // We only undo the old debit/credit if the from_account hasn't changed.
  let fromPostRevBal = fromAccEdit ? Number(fromAccEdit.current_balance) : 0;
  if (oldTx && String(oldTx.from_account) === String(from_account)) {
    const oldAmt = Number(oldTx.amount) || 0;
    if (oldTx.transaction_type === 'money-in')       fromPostRevBal -= oldAmt; // reversal removes the credit
    if (oldTx.transaction_type === 'money-out')      fromPostRevBal += oldAmt; // reversal restores the debit
    if (oldTx.transaction_type === 'money-transfer') fromPostRevBal += oldAmt; // reversal restores the debit
  }
  // Proxy object with post-reversal balance — passed to checkBalanceRules instead of fromAccEdit.
  const fromAccPR = fromAccEdit ? { ...fromAccEdit, current_balance: fromPostRevBal } : fromAccEdit;

  const balanceErrorEdit = checkBalanceRules(transaction_type, fromAccPR, parseFloat(amount));
  if (balanceErrorEdit) { errEl.textContent = balanceErrorEdit; return; }

  const rule5ErrorEdit = checkRule5(transaction_type, fromAccEdit, major_category, minor_category);
  if (rule5ErrorEdit) { errEl.textContent = rule5ErrorEdit; return; }

  const rule6ErrorEdit = checkRule6(transaction_type, fromAccEdit, toAccEdit, fx_rate);
  if (rule6ErrorEdit) { errEl.textContent = rule6ErrorEdit; return; }

  // to_account credit-card check (transfer edits only)
  if (
    transaction_type === 'money-transfer' &&
    toAccEdit && toAccEdit.type === 'credit_card' &&
    Number(toAccEdit.credit_card_limit) > 0
  ) {
    // How much will be credited to to_account in Phase 2?
    const newFxRate   = fx_rate ? parseFloat(fx_rate) : 0;
    const newCredited = newFxRate > 0 ? parseFloat(amount) * newFxRate : parseFloat(amount);

    // Post-reversal balance of to_account: undo old credited amount (if same to_account).
    let toPostRevBal = Number(toAccEdit.current_balance);
    if (oldTx && String(oldTx.to_account) === String(to_account)) {
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
      from_account, to_account, amount: parseFloat(amount), currency,
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

async function confirmDelete(rowNum) {
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

function renderFilterBar() {
  const f        = state.filters;
  const allTypes = _txTypes();
  const allAccs  = state.accounts;
  const allMajor = [...new Set(state.categories.map(c => c.major_category))];
  const allMinor = [...new Set(state.categories.map(c => c.minor_category))];
  const methods  = ['card','cash','bank','UPI','other'];

  const activeChips = [
    ...f.types.map(t    => ({ label: _txTypeMap()[t] || t, key: 'types',    val: t })),
    ...f.accounts.map(id => ({ label: state.accountMap[id]?.name || id, key: 'accounts', val: id })),
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
