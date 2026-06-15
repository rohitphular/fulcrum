import { state, setQuoteCurrency } from '../core/state.js';
import { el, esc, fmtDate } from '../core/utils.js';
import { showMsg } from '../core/ui.js';
import { DebtAPI } from '../core/api.js';

const ratesUI = { editCurrency: null };

const CCY_ORDER = ['GBP', 'INR', 'USD', 'EUR', 'AED'];

function rateRowHTML(r) {
  const isBase    = r.currency === 'GBP';
  const isEditing = ratesUI.editCurrency === r.currency;

  const rateCell = isEditing
    ? `<td><input type="number" id="rateEditInput" class="rate-edit-input"
           value="${parseFloat(r.rate)}" min="0.0001" step="0.0001"></td>`
    : `<td class="td-mono">${parseFloat(r.rate)}</td>`;

  let actionsCell;
  if (isBase) {
    actionsCell = `<td><span class="badge badge-subtype">base</span></td>`;
  } else if (isEditing) {
    actionsCell = `<td><div class="row-actions">
      <button class="btn-link" data-action="rate-save" data-currency="${esc(r.currency)}">Save</button>
      <button class="btn-link danger" data-action="rate-cancel">Cancel</button>
    </div></td>`;
  } else {
    actionsCell = `<td><button class="btn-link" data-action="rate-edit" data-currency="${esc(r.currency)}">Edit</button></td>`;
  }

  return `<tr>
    <td class="td-name">${esc(r.currency)}</td>
    <td class="td-mono">${esc(r.symbol)}</td>
    ${rateCell}
    <td class="td-mono">${fmtDate(r.updated_at)}</td>
    ${actionsCell}
  </tr>`;
}

export function renderRates() {
  const sortedRates = [...state.rates].sort(
    (a, b) => CCY_ORDER.indexOf(a.currency) - CCY_ORDER.indexOf(b.currency)
  );

  const rows = sortedRates.length
    ? sortedRates.map(rateRowHTML).join('')
    : `<tr class="empty-row"><td colspan="5">No rates loaded.</td></tr>`;

  el('ratesContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Rates</h2></div>
    </div>

    <div class="card" style="margin-bottom:22px;">
      <p class="sec-sub" style="margin:0 0 14px;">
        Quote currency converts all balances across the app for comparison. Saved in your browser across sessions.
      </p>
      <div class="field" style="max-width:200px;margin:0;">
        <label for="ratesQuotePicker">Quote currency</label>
        <select id="ratesQuotePicker">
          ${CCY_ORDER.map(c => `<option value="${c}" ${state.quoteCurrency === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="sec-head">
      <div class="sec-head-left"><h2>Exchange rates</h2></div>
      <span style="font-size:12.5px;color:var(--muted);">Units of currency per&nbsp;1&nbsp;GBP</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Currency</th><th>Symbol</th><th>Rate (per 1 GBP)</th><th>Last updated</th><th>Actions</th>
        </tr></thead>
        <tbody id="ratesBody">${rows}</tbody>
      </table>
    </div>
  `;

  wireRatesEvents();
}

function wireRatesEvents() {
  el('ratesQuotePicker')?.addEventListener('change', e => setQuoteCurrency(e.target.value));
  el('ratesBody')?.addEventListener('click', ratesRowClick);

  const editInput = el('rateEditInput');
  if (editInput) {
    editInput.focus();
    editInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); saveRate(ratesUI.editCurrency); }
      if (e.key === 'Escape') cancelRateEdit();
    });
  }
}

function ratesRowClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, currency } = btn.dataset;
  if (action === 'rate-edit')   { ratesUI.editCurrency = currency; renderRates(); }
  if (action === 'rate-cancel') cancelRateEdit();
  if (action === 'rate-save')   saveRate(currency);
}

function cancelRateEdit() {
  ratesUI.editCurrency = null;
  renderRates();
}

async function saveRate(currency) {
  const input = el('rateEditInput');
  const rate  = parseFloat(input?.value);

  if (!rate || rate <= 0) {
    if (input) input.style.borderColor = 'var(--ember)';
    return;
  }

  const saveBtn = el('ratesBody')?.querySelector('[data-action="rate-save"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const rateRecord = state.rates.find(r => r.currency === currency);

  try {
    const res = await DebtAPI.upsertRate({ currency, rate, symbol: rateRecord?.symbol || '' });
    if (res.ok) {
      showMsg(`${currency} rate updated.`);
      ratesUI.editCurrency = null;
      document.dispatchEvent(new CustomEvent('dt:reload'));
    } else {
      showMsg('Update failed: ' + (res.error || 'unknown'), 'warn');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}
