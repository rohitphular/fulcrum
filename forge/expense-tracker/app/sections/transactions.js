import { state, VALID_TX_TYPES } from '../core/state.js';
import { el, esc, fmtDateTime, fmtNative, fmtBase, nowLocalISO, toDateInputVal, exportData } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { filteredTx } from '../core/daterange.js';
import { ExpenseAPI } from '../core/api.js';

let addFormOpen = false;
let filterOpen  = false;

export function renderTransactions() {
  const txEl = el('transactionsContent');
  const rows = filteredTx();

  const validRows = rows.filter(tx =>  tx.id && tx.date && VALID_TX_TYPES.includes(tx.transaction_type));
  const warnRows  = rows.filter(tx => !tx.id || !tx.date || !VALID_TX_TYPES.includes(tx.transaction_type));

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
    const typeLabel = tx.transaction_type === 'money-in' ? 'in'       : tx.transaction_type === 'money-out' ? 'out'       : 'xfer';
    const missingRate = !state.rateMap[tx.currency];
    const rowRate     = tx.fx_rate && parseFloat(tx.fx_rate) > 0;

    return `<tr>
      <td class="td-mono">${esc(fmtDateTime(tx.date))}</td>
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
        <td colspan="9"><span class="badge badge-warn">⚠ malformed</span> id=${esc(String(tx.id||'?'))} type=${esc(tx.transaction_type||'?')} date=${esc(String(tx.date||'?'))}</td>
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
          ${thSort('date','Date')}
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
    if (col === 'date') {
      const ts = s => {
        const str = String(s);
        if (str.includes('T')) {
          const [dp, tp = '00:00'] = str.split('T');
          const [y, mo, d] = dp.split('-').map(Number);
          const [h, mi]    = tp.slice(0, 5).split(':').map(Number);
          return new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
        }
        const p = str.slice(0, 10).split('-').map(Number);
        return p.length === 3 ? new Date(p[0], p[1] - 1, p[2]).getTime() : 0;
      };
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
            ${['money-in','money-out','money-transfer'].map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afMajor">Major category *</label>
          <select id="afMajor" disabled><option value="">— select type first —</option></select>
        </div>
        <div class="field">
          <label for="afMinor">Minor category *</label>
          <select id="afMinor" disabled><option value="">— select major first —</option></select>
        </div>
        <div class="field">
          <label for="afFromAccount">From account *</label>
          <select id="afFromAccount" disabled>
            <option value="">— select type first —</option>
            ${activeAccounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.currency)})</option>`).join('')}
          </select>
        </div>
        <div class="form-grid-full" id="afTransferSection" style="display:none">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px 16px;align-items:end">
            <div class="field" style="margin:0">
              <label for="afToAccount">To account *</label>
              <select id="afToAccount">
                <option value="">— select from account first —</option>
                ${activeAccounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.currency)})</option>`).join('')}
              </select>
            </div>
            <div class="field" id="afFxRateWrap" style="display:none;margin:0">
              <label for="afFxRate">FX rate</label>
              <input type="number" id="afFxRate" min="0.0001" step="any" placeholder="e.g. 105">
            </div>
          </div>
        </div>
        <div class="field">
          <label for="afDate">Date &amp; time *</label>
          <input type="datetime-local" id="afDate" value="${nowLocalISO()}">
        </div>
        <div class="field">
          <label for="afCounterparty">Counterparty</label>
          <input type="text" id="afCounterparty" placeholder="Tesco, employer, …">
        </div>
        <div class="field">
          <label for="afAmount">Amount *</label>
          <input type="number" id="afAmount" min="0.01" step="0.01" placeholder="0.00">
        </div>
        <div class="field">
          <label for="afCountry">Country</label>
          <input type="text" id="afCountry" placeholder="UK">
        </div>
        <div class="field form-grid-span-2">
          <label for="afTags">Tags</label>
          <input type="text" id="afTags" placeholder="reimbursable, work">
        </div>
        <div class="field form-grid-span-2">
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

    majorEl.innerHTML = '<option value="">— select type first —</option>';
    minorEl.innerHTML = '<option value="">— select major first —</option>';
    fromAccEl.value   = '';
    if (el('afToAccount'))  el('afToAccount').value  = '';
    if (el('afFxRate'))     el('afFxRate').value      = '';

    if (!type) {
      majorEl.disabled  = true;
      minorEl.disabled  = true;
      fromAccEl.disabled = true;
      el('afTransferSection').style.display = 'none';
      return;
    }

    const majors = [...new Set(state.categories.filter(c => c.transaction_type === type).map(c => c.major_category))];
    majorEl.innerHTML  = `<option value="">— select —</option>${majors.map(m => `<option>${esc(m)}</option>`).join('')}`;
    majorEl.disabled   = false;
    minorEl.disabled   = false;
    fromAccEl.disabled = false;

    if (type === 'money-transfer') {
      el('afTransferSection').style.display = '';
      _afRefreshToAccountOpts();
    } else {
      el('afTransferSection').style.display = 'none';
    }
  });

  el('afMajor')?.addEventListener('change', () => {
    const type   = el('afType').value;
    const major  = el('afMajor').value;
    const minors = state.categories.filter(c => c.transaction_type === type && c.major_category === major).map(c => c.minor_category);
    el('afMinor').innerHTML = `<option value="">— select —</option>${minors.map(m => `<option>${esc(m)}</option>`).join('')}`;
  });

  el('afFromAccount')?.addEventListener('change', () => {
    if (el('afType').value === 'money-transfer') _afRefreshToAccountOpts();
    _afRefreshFxRateVis();
  });

  el('afToAccount')?.addEventListener('change', _afRefreshFxRateVis);

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
    el('afTransferSection').style.display = 'none';
    if (el('afFxRateWrap')) el('afFxRateWrap').style.display = 'none';
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
  const fromAcc = state.accounts.find(a => a.id === el('afFromAccount')?.value);
  const toAcc   = state.accounts.find(a => a.id === el('afToAccount')?.value);
  const show    = fromAcc && toAcc && fromAcc.currency !== toAcc.currency;
  const wrap    = el('afFxRateWrap');
  if (wrap) wrap.style.display = show ? '' : 'none';
  if (!show && el('afFxRate')) el('afFxRate').value = '';
}

async function saveTransaction() {
  const btn   = el('afSubmit');
  const errEl = el('afError');
  errEl.textContent = '';

  const date             = el('afDate').value;
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

  if (!date)                                            { errEl.textContent = 'Date is required.';                          return; }
  if (!transaction_type)                                { errEl.textContent = 'Type is required.';                          return; }
  if (!from_account)                                    { errEl.textContent = 'From account is required.';                  return; }
  if (transaction_type === 'money-transfer' && !to_account) { errEl.textContent = 'To account is required for transfers.'; return; }
  if (!amount || parseFloat(amount) <= 0)               { errEl.textContent = 'Enter a positive amount.';                   return; }
  if (!major_category)                                  { errEl.textContent = 'Major category is required.';                return; }
  if (!minor_category)                                  { errEl.textContent = 'Minor category is required.';                return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  showLoading();
  try {
    const res = await ExpenseAPI.createTransaction({
      date, transaction_type, from_account, to_account,
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
  const typeOpts = ['money-in', 'money-out', 'money-transfer'].map(t =>
    `<option value="${t}" ${tx.transaction_type === t ? 'selected' : ''}>${t}</option>`
  ).join('');
  const majors = [...new Set(state.categories.filter(c => c.transaction_type === tx.transaction_type).map(c => c.major_category))];
  const majorOpts = majors.map(m =>
    `<option value="${esc(m)}" ${tx.major_category === m ? 'selected' : ''}>${esc(m)}</option>`
  ).join('');
  const minors = state.categories.filter(c => c.transaction_type === tx.transaction_type && c.major_category === tx.major_category).map(c => c.minor_category);
  const minorOpts = minors.map(m =>
    `<option value="${esc(m)}" ${tx.minor_category === m ? 'selected' : ''}>${esc(m)}</option>`
  ).join('');

  const dateVal = (() => {
    const s = String(tx.date || '').trim();
    const match = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (match) return `${match[1]}T${match[2]}`;
    return s.slice(0, 10);
  })();

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
          <label>From account</label>
          <select id="txEditFromAccount-${r}">
            <option value="">— select —</option>
            ${fromAccountOpts}
          </select>
        </div>
        <div class="field">
          <label>Amount</label>
          <input type="number" id="txEditAmount-${r}" min="0.01" step="0.01" value="${esc(String(tx.amount || ''))}">
        </div>
        <div class="field">
          <label>Major category</label>
          <select id="txEditMajor-${r}">
            <option value="">— select —</option>
            ${majorOpts}
          </select>
        </div>
        <div class="field">
          <label>Minor category</label>
          <select id="txEditMinor-${r}">
            <option value="">— select —</option>
            ${minorOpts}
          </select>
        </div>
        <div class="field">
          <label>Counterparty</label>
          <input type="text" id="txEditCounterparty-${r}" value="${esc(tx.counterparty || '')}">
        </div>
        <div class="field">
          <label>Country</label>
          <input type="text" id="txEditCountry-${r}" value="${esc(tx.country || '')}">
        </div>
        <div class="field">
          <label>To account</label>
          <select id="txEditToAccount-${r}">
            <option value="">— none —</option>
            ${toAccountOpts}
          </select>
        </div>
        <div class="field">
          <label>FX rate</label>
          <input type="number" id="txEditFxRate-${r}" min="0.0001" step="any" value="${esc(String(tx.fx_rate || ''))}">
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
      <span class="confirm-text">Delete <strong>${esc(fmtDateTime(tx.date))}</strong> — ${esc(accLabel)} — ${esc(fmtNative(tx.amount, tx.currency))}? Account balance will be adjusted.</span>
      <span style="display:inline-flex;gap:8px;margin-left:16px">
        <button class="btn-link danger" data-action="tx-confirm-delete" data-row="${tx._row}">Yes, delete</button>
        <button class="btn-link" data-action="tx-cancel-delete">Cancel</button>
      </span>
    </td>
  </tr>`;
}

function attachTxEditCascadeEvents(r) {
  el(`txEditType-${r}`)?.addEventListener('change', () => {
    const type   = el(`txEditType-${r}`).value;
    const majors = [...new Set(state.categories.filter(c => c.transaction_type === type).map(c => c.major_category))];
    el(`txEditMajor-${r}`).innerHTML  = `<option value="">— select —</option>${majors.map(m => `<option>${esc(m)}</option>`).join('')}`;
    el(`txEditMinor-${r}`).innerHTML  = `<option value="">— select major first —</option>`;
    el(`txEditToAccount-${r}`).value  = '';
    el(`txEditFxRate-${r}`).value     = '';
  });
  el(`txEditMajor-${r}`)?.addEventListener('change', () => {
    const type   = el(`txEditType-${r}`).value;
    const major  = el(`txEditMajor-${r}`).value;
    const minors = state.categories.filter(c => c.transaction_type === type && c.major_category === major).map(c => c.minor_category);
    el(`txEditMinor-${r}`).innerHTML = `<option value="">— select —</option>${minors.map(m => `<option>${esc(m)}</option>`).join('')}`;
  });
}

async function saveEdit(rowNum) {
  const r     = rowNum;
  const errEl = el(`txEditError-${r}`);
  errEl.textContent = '';

  const date             = el(`txEditDate-${r}`)?.value;
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

  if (!date)              { errEl.textContent = 'Date is required.';                             return; }
  if (!transaction_type)  { errEl.textContent = 'Type is required.';                             return; }
  if (!from_account)      { errEl.textContent = 'From account is required.';                     return; }
  if (transaction_type === 'money-transfer' && !to_account) { errEl.textContent = 'To account is required for transfers.'; return; }
  if (!amount || parseFloat(amount) <= 0) { errEl.textContent = 'Enter a positive amount.';      return; }
  if (!major_category)    { errEl.textContent = 'Major category is required.';                   return; }
  if (!minor_category)    { errEl.textContent = 'Minor category is required.';                   return; }

  showLoading();
  try {
    const res = await ExpenseAPI.updateTransaction({
      row_num: rowNum, date, transaction_type,
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
  const allTypes = ['money-in', 'money-out', 'money-transfer'];
  const allAccs  = state.accounts;
  const allMajor = [...new Set(state.categories.map(c => c.major_category))];
  const allMinor = [...new Set(state.categories.map(c => c.minor_category))];
  const methods  = ['card','cash','bank','UPI','other'];

  const activeChips = [
    ...f.types.map(t    => ({ label: t,                   key: 'types',    val: t })),
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
            <input type="checkbox" data-filter-type="${esc(t)}" ${f.types.includes(t) ? 'checked' : ''}> ${esc(t)}
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
