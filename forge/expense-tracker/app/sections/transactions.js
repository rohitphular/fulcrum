import { state, VALID_TX_TYPES } from '../core/state.js';
import { el, esc, fmtDate, fmtNative, fmtBase, todayISO, exportData } from '../core/utils.js';
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
    const badgeCls  = tx.transaction_type === 'money-in' ? 'badge-in' : tx.transaction_type === 'money-out' ? 'badge-out' : 'badge-transfer';
    const typeLabel = tx.transaction_type === 'money-in' ? 'in'       : tx.transaction_type === 'money-out' ? 'out'       : 'xfer';
    const missingRate = !state.rateMap[tx.currency];
    const rowRate     = tx.fx_rate && parseFloat(tx.fx_rate) > 0;

    return `<tr>
      <td class="td-mono">${esc(fmtDate(tx.date))}</td>
      <td><span class="badge ${badgeCls}">${typeLabel}</span>${tx.transfer_id ? ' <span title="Transfer: '+esc(tx.transfer_id)+'">⇌</span>' : ''}</td>
      <td>${esc(state.accountMap[tx.account]?.name || '—')}</td>
      <td class="td-mono">${esc(fmtNative(tx.amount, tx.currency))}${missingRate ? ' <span class="badge badge-warn" title="Currency not in rates tab">?</span>' : ''}</td>
      <td class="td-mono">${esc(fmtBase(tx.amount, tx.currency, tx.fx_rate))}${rowRate ? ' <span title="Row-level FX rate used" style="color:var(--muted);font-size:10px">†</span>' : ''}</td>
      <td>${esc(tx.major_category || '—')} ${tx.minor_category ? '→ ' + esc(tx.minor_category) : ''}</td>
      <td>${esc(tx.counterparty || '—')}</td>
      <td class="td-muted">${esc(tx.country || '—')}</td>
      <td class="td-muted">${esc(tx.payment_method || '—')}</td>
      <td class="td-muted">${tx.tags ? tx.tags.split(';').map(t => `<span class="badge" style="background:var(--canvas)">${esc(t.trim())}</span>`).join(' ') : '—'}</td>
      <td class="td-muted">${esc(tx.notes || '—')}</td>
    </tr>`;
  }).join('');

  const warnRowsHtml = warnRows.length ? `
    <tbody id="warnTable" class="hidden">
      ${warnRows.map(tx => `<tr>
        <td colspan="11"><span class="badge badge-warn">⚠ malformed</span> id=${esc(String(tx.id||'?'))} type=${esc(tx.transaction_type||'?')} date=${esc(String(tx.date||'?'))}</td>
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
          ${thSort('account','Account')}
          <th>Amount</th>
          <th>≈ ${esc(state.quoteCurrency)}</th>
          ${thSort('major_category','Category')}
          ${thSort('counterparty','Counterparty')}
          <th>Country</th>
          <th>Method</th>
          <th>Tags</th>
          <th>Notes</th>
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
  }, 0);

  return html;
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

// ── Add-transaction form ──────────────────────────────────────────────────────

function renderAddForm() {
  return `
  <div class="add-form-wrap">
    <button class="add-form-toggle" id="addFormToggle">
      Add transaction
      <span class="plus-icon">${addFormOpen ? '×' : '+'}</span>
    </button>
    <div class="add-form-body ${addFormOpen ? '' : 'hidden'}" id="addFormBody">
      <div class="form-grid">
        <div class="field">
          <label for="afDate">Date *</label>
          <input type="date" id="afDate" value="${todayISO()}">
        </div>
        <div class="field">
          <label for="afType">Type *</label>
          <select id="afType">
            ${['money-in','money-out','money-transfer'].map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afAccount">Account *</label>
          <select id="afAccount">
            <option value="">— select —</option>
            ${state.accounts
              .filter(a => a.is_active === true || a.is_active === 'TRUE' || a.is_active === 'true')
              .map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.currency)})</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afAmount">Amount *</label>
          <input type="number" id="afAmount" min="0.01" step="0.01" placeholder="0.00">
        </div>
        <div class="field">
          <label for="afCurrency">Currency *</label>
          <select id="afCurrency">
            ${state.rates.map(r => `<option value="${esc(r.currency)}">${esc(r.symbol||'')} ${esc(r.currency)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afMajor">Major category *</label>
          <select id="afMajor"><option value="">— select type first —</option></select>
        </div>
        <div class="field">
          <label for="afMinor">Minor category *</label>
          <select id="afMinor"><option value="">— select major first —</option></select>
        </div>
        <div class="field">
          <label for="afCounterparty">Counterparty</label>
          <input type="text" id="afCounterparty" placeholder="Tesco, employer, …">
        </div>
        <div class="field">
          <label for="afCountry">Country</label>
          <input type="text" id="afCountry" placeholder="UK">
        </div>
        <div class="field">
          <label for="afMethod">Payment method</label>
          <select id="afMethod">
            <option value="">— optional —</option>
            ${['card','cash','bank','UPI','other'].map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="afTransferIdWrap" style="display:none">
          <label for="afTransferId">Transfer ID</label>
          <input type="text" id="afTransferId" placeholder="T-YYYY-MM-DD-1">
        </div>
        <div class="field" id="afFxRateWrap" style="display:none">
          <label for="afFxRate">FX rate (units per 1 GBP)</label>
          <input type="number" id="afFxRate" min="0" step="any" placeholder="optional override">
        </div>
        <div class="field">
          <label for="afTags">Tags</label>
          <input type="text" id="afTags" placeholder="reimbursable, work">
        </div>
        <div class="field form-grid-full">
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
    el('afFxRateWrap').style.display = el('afCurrency').value !== 'GBP' ? '' : 'none';
  });

  el('afAccount')?.addEventListener('change', () => {
    const acc = state.accounts.find(a => a.id === el('afAccount').value);
    if (acc) el('afCurrency').value = acc.currency;
    el('afFxRateWrap').style.display = el('afCurrency').value !== 'GBP' ? '' : 'none';
  });

  el('afSubmit')?.addEventListener('click', saveTransaction);
  el('afReset')?.addEventListener('click', () => {
    ['afDate','afAmount','afCounterparty','afCountry','afTags','afNotes','afFxRate','afTransferId']
      .forEach(id => { if (el(id)) el(id).value = id === 'afDate' ? todayISO() : ''; });
    el('afType').value    = 'money-in';
    el('afMajor').innerHTML = '<option value="">— select type first —</option>';
    el('afMinor').innerHTML = '<option value="">— select major first —</option>';
    el('afError').textContent = '';
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

  if (!date)                                { errEl.textContent = 'Date is required.';             return; }
  if (!account)                             { errEl.textContent = 'Account is required.';          return; }
  if (!amount || parseFloat(amount) <= 0)   { errEl.textContent = 'Enter a positive amount.';      return; }
  if (!major_category)                      { errEl.textContent = 'Major category is required.';   return; }
  if (!minor_category)                      { errEl.textContent = 'Minor category is required.';   return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  showLoading();
  try {
    const res = await ExpenseAPI.createTransaction({
      date, transaction_type, account, amount: parseFloat(amount), currency,
      major_category, minor_category, counterparty, country, payment_method,
      transfer_id, fx_rate: fx_rate ? parseFloat(fx_rate) : '',
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
