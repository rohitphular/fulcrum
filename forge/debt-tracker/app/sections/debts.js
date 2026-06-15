import { state } from '../core/state.js';
import { el, esc, fmtAmount, toQuote, toDateInputVal } from '../core/utils.js';
import { showMsg } from '../core/ui.js';
import { DebtAPI } from '../core/api.js';

const debtsUI = { editId: null, deleteId: null, formOpen: false };

function openDebtForm(id) {
  debtsUI.editId   = id || null;
  debtsUI.formOpen = true;
  debtsUI.deleteId = null;
  renderDebts();
  requestAnimationFrame(() => el('debtFormCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function closeDebtForm() {
  debtsUI.editId   = null;
  debtsUI.formOpen = false;
  renderDebts();
}

function updateDebtFormFields(type) {
  const isLoan = type === 'loan', isCard = type === 'card', isFriend = type === 'friend';
  el('dSubtypeWrap')?.classList.toggle('field-hidden',    !isLoan);
  el('dMinPaymentWrap')?.classList.toggle('field-hidden', !(isLoan || isFriend));
  el('dPrecomputedWrap')?.classList.toggle('field-hidden', !isLoan);
  el('dMinPercentWrap')?.classList.toggle('field-hidden', !isCard);
  el('dMinFloorWrap')?.classList.toggle('field-hidden',   !isCard);
}

function debtTableHead() {
  return `<thead><tr>
    <th>Name</th><th>Type</th><th>CCY</th>
    <th>Balance</th><th>&#8776;&nbsp;${esc(state.quoteCurrency)}</th>
    <th>Monthly min</th><th>Status</th><th>Actions</th>
  </tr></thead>`;
}

function debtRowHTML(d) {
  const typeBadge = `<span class="badge badge-${esc(d.type)}">${esc(d.type)}</span>`;
  const subBadge  = d.subtype
    ? ` <span class="badge badge-subtype">${esc(d.subtype.replace(/_/g, ' '))}</span>`
    : '';

  const balOrig  = fmtAmount(d.balance, d.currency);
  const balQuote = d.currency !== state.quoteCurrency
    ? fmtAmount(toQuote(d.balance, d.currency), state.quoteCurrency)
    : '&mdash;';

  let monthlyMin = '&mdash;';
  if (d.type === 'card') {
    const pct = parseFloat(d.min_percent) || 0;
    const flr = parseFloat(d.min_floor)   || 0;
    if (pct || flr) monthlyMin = `${pct}% (min&nbsp;${fmtAmount(flr, d.currency)})`;
  } else {
    const mp = parseFloat(d.min_payment) || 0;
    if (mp) monthlyMin = fmtAmount(mp, d.currency);
  }

  if (debtsUI.deleteId === d.id) {
    return `<tr>
      <td class="td-name">${esc(d.name)}</td>
      <td>${typeBadge}${subBadge}</td>
      <td colspan="5"><span class="confirm-text">Delete &ldquo;<strong>${esc(d.name)}</strong>&rdquo;? This cannot be undone.</span></td>
      <td><div class="row-actions">
        <button class="btn-link danger" data-action="confirm-delete">Yes, delete</button>
        <button class="btn-link" data-action="cancel-delete">Cancel</button>
      </div></td>
    </tr>`;
  }

  return `<tr>
    <td class="td-name">${esc(d.name)}</td>
    <td>${typeBadge}${subBadge}</td>
    <td>${esc(d.currency)}</td>
    <td class="td-amount">${balOrig}</td>
    <td class="td-amount-quote">${balQuote}</td>
    <td class="td-mono">${monthlyMin}</td>
    <td><span class="badge badge-${esc(d.status)}">${esc(d.status.replace(/_/g, ' '))}</span></td>
    <td><div class="row-actions">
      <button class="btn-link" data-action="edit" data-id="${esc(d.id)}">Edit</button>
      <button class="btn-link danger" data-action="delete" data-id="${esc(d.id)}">Delete</button>
    </div></td>
  </tr>`;
}

function debtFormHTML() {
  const debt     = debtsUI.editId ? state.debts.find(d => d.id === debtsUI.editId) : null;
  const type     = debt?.type || 'loan';
  const isLoan   = type === 'loan';
  const isCard   = type === 'card';
  const isFriend = type === 'friend';
  const ccys     = ['GBP', 'INR', 'USD', 'EUR', 'AED'];

  return `
<div class="card" id="debtFormCard" style="margin-bottom:22px;">
  <p class="sec-sub" style="margin:0 0 16px;">${debt ? 'Editing: ' + esc(debt.name) : 'Add a new debt'}</p>
  <form id="debtForm" novalidate>
    <div class="form-grid">

      <div class="field">
        <label for="dType">Type</label>
        <select id="dType">
          <option value="loan"   ${type === 'loan'   ? 'selected' : ''}>Loan</option>
          <option value="card"   ${type === 'card'   ? 'selected' : ''}>Card</option>
          <option value="friend" ${type === 'friend' ? 'selected' : ''}>Friend</option>
        </select>
      </div>

      <div class="field ${isLoan ? '' : 'field-hidden'}" id="dSubtypeWrap">
        <label for="dSubtype">Subtype</label>
        <select id="dSubtype">
          <option value="personal_loan" ${(!debt || debt.subtype === 'personal_loan') ? 'selected' : ''}>Personal Loan</option>
          <option value="home_loan"     ${debt?.subtype === 'home_loan' ? 'selected' : ''}>Home Loan</option>
        </select>
      </div>

      <div class="field" id="dNameWrap">
        <label for="dName">Name *</label>
        <input type="text" id="dName" placeholder="e.g. HDFC Personal Loan" maxlength="200" value="${esc(debt?.name || '')}">
        <div class="err-msg">Name is required.</div>
      </div>

      <div class="field">
        <label for="dCurrency">Currency</label>
        <select id="dCurrency">
          ${ccys.map(c => `<option value="${c}" ${(debt?.currency || 'GBP') === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="field" id="dBalanceWrap">
        <label for="dBalance">Balance *</label>
        <input type="number" id="dBalance" placeholder="0.00" min="0" step="0.01" value="${debt?.balance ?? ''}">
        <div class="err-msg">Enter a valid balance.</div>
      </div>

      <div class="field">
        <label for="dRate">Interest rate %</label>
        <input type="number" id="dRate" placeholder="0.00" min="0" max="100" step="0.01" value="${debt?.rate ?? ''}">
      </div>

      <div class="field ${(isLoan || isFriend) ? '' : 'field-hidden'}" id="dMinPaymentWrap">
        <label for="dMinPayment">Monthly payment</label>
        <input type="number" id="dMinPayment" placeholder="0.00" min="0" step="0.01" value="${debt?.min_payment ?? ''}">
      </div>

      <div class="field ${isCard ? '' : 'field-hidden'}" id="dMinPercentWrap">
        <label for="dMinPercent">Min % of balance</label>
        <input type="number" id="dMinPercent" placeholder="2.00" min="0" max="100" step="0.01" value="${debt?.min_percent ?? ''}">
      </div>

      <div class="field ${isCard ? '' : 'field-hidden'}" id="dMinFloorWrap">
        <label for="dMinFloor">Minimum floor</label>
        <input type="number" id="dMinFloor" placeholder="25.00" min="0" step="0.01" value="${debt?.min_floor ?? ''}">
      </div>

      ${debt ? `
      <div class="field">
        <label for="dStatus">Status</label>
        <select id="dStatus">
          <option value="active"   ${debt.status === 'active'   ? 'selected' : ''}>Active</option>
          <option value="paid_off" ${debt.status === 'paid_off' ? 'selected' : ''}>Paid off</option>
        </select>
      </div>` : '<input type="hidden" id="dStatus" value="active">'}

      <div class="field">
        <label for="dStartDate">Start date</label>
        <input type="date" id="dStartDate" value="${esc(toDateInputVal(debt?.start_date))}">
      </div>

    </div>

    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:16px;">
      <div class="field-check ${isLoan ? '' : 'field-hidden'}" id="dPrecomputedWrap">
        <input type="checkbox" id="dPrecomputed" ${debt?.precomputed ? 'checked' : ''}>
        <label for="dPrecomputed">Precomputed EMI (interest already baked into payment)</label>
      </div>
      <div class="field-check">
        <input type="checkbox" id="dInclude" ${!debt || debt.include_in_projector ? 'checked' : ''}>
        <label for="dInclude">Include in projector</label>
      </div>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="dSaveBtn">${debt ? 'Update Debt' : 'Add Debt'}</button>
      <button type="button" class="btn btn-secondary" id="dCancelBtn">Cancel</button>
      <span class="hidden" id="dFormSpinner"><span class="spinner"></span>Saving&hellip;</span>
    </div>
  </form>
</div>`;
}

export function renderDebts() {
  const active  = state.debts.filter(d => d.status === 'active');
  const paidOff = state.debts.filter(d => d.status === 'paid_off');

  const activeRows = active.length
    ? active.map(debtRowHTML).join('')
    : `<tr class="empty-row"><td colspan="8">No active debts &mdash; click &ldquo;+ Add Debt&rdquo; to get started.</td></tr>`;

  const paidSection = paidOff.length ? `
    <div class="paid-section">
      <button class="paid-toggle" id="paidToggle" aria-expanded="false">
        <span class="paid-toggle-arrow">&#8250;</span>&ensp;Paid off (${paidOff.length})
      </button>
      <div class="paid-content collapsed" id="paidContent">
        <div class="table-wrap">
          <table>
            ${debtTableHead()}
            <tbody id="paidDebtsBody">${paidOff.map(debtRowHTML).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>` : '';

  el('debtsContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Debts</h2></div>
      ${!debtsUI.formOpen ? '<button class="btn btn-primary" id="dAddBtn">+ Add Debt</button>' : ''}
    </div>

    ${debtsUI.formOpen ? debtFormHTML() : ''}

    <div class="table-wrap">
      <table>
        ${debtTableHead()}
        <tbody id="activeDebtsBody">${activeRows}</tbody>
      </table>
    </div>

    ${paidSection}
  `;

  wireDebtsEvents();
}

function wireDebtsEvents() {
  el('dAddBtn')?.addEventListener('click', () => openDebtForm(null));

  const form = el('debtForm');
  if (form) {
    form.addEventListener('submit', e => { e.preventDefault(); saveDebt(); });
    el('dType').addEventListener('change', e => updateDebtFormFields(e.target.value));
    el('dCancelBtn').addEventListener('click', closeDebtForm);
  }

  el('activeDebtsBody')?.addEventListener('click', debtRowClick);
  el('paidDebtsBody')?.addEventListener('click', debtRowClick);

  const pt = el('paidToggle');
  if (pt) {
    pt.addEventListener('click', () => {
      const isOpen = pt.getAttribute('aria-expanded') === 'true';
      pt.setAttribute('aria-expanded', String(!isOpen));
      el('paidContent').classList.toggle('collapsed', isOpen);
    });
  }
}

function debtRowClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'edit')           openDebtForm(id);
  if (action === 'delete')         startDeleteDebt(id);
  if (action === 'confirm-delete') confirmDeleteDebt();
  if (action === 'cancel-delete')  cancelDeleteDebt();
}

async function saveDebt() {
  const type    = el('dType').value;
  const name    = el('dName').value.trim();
  const balance = el('dBalance').value.trim();

  let valid = true;
  const nw = el('dNameWrap'), bw = el('dBalanceWrap');
  if (!name)    { nw.classList.add('error'); valid = false; } else nw.classList.remove('error');
  if (balance === '' || isNaN(parseFloat(balance)) || parseFloat(balance) < 0) {
    bw.classList.add('error'); valid = false;
  } else bw.classList.remove('error');
  if (!valid) return;

  const fields = {
    name,
    type,
    subtype:              type === 'loan'               ? el('dSubtype').value                        : '',
    currency:             el('dCurrency').value,
    balance:              parseFloat(balance),
    rate:                 parseFloat(el('dRate').value)             || 0,
    min_payment:          (type === 'loan' || type === 'friend')    ? (parseFloat(el('dMinPayment').value) || 0) : 0,
    precomputed:          type === 'loan'               ? el('dPrecomputed').checked                  : false,
    min_percent:          type === 'card'               ? (parseFloat(el('dMinPercent').value)        || 0) : 0,
    min_floor:            type === 'card'               ? (parseFloat(el('dMinFloor').value)          || 0) : 0,
    include_in_projector: el('dInclude').checked,
    status:               el('dStatus').value,
    start_date:           el('dStartDate').value || '',
    ...(debtsUI.editId ? {} : { original_balance: parseFloat(balance) }),
  };

  el('dSaveBtn').disabled = true;
  el('dFormSpinner').classList.remove('hidden');

  try {
    const res = debtsUI.editId
      ? await DebtAPI.updateDebt(debtsUI.editId, fields)
      : await DebtAPI.createDebt(fields);
    if (res.ok) {
      showMsg(debtsUI.editId ? 'Debt updated.' : 'Debt added.');
      debtsUI.editId = null;
      debtsUI.formOpen = false;
      document.dispatchEvent(new CustomEvent('dt:reload'));
    } else {
      showMsg('Save failed: ' + (res.error || 'unknown error'), 'warn');
      el('dSaveBtn').disabled = false;
      el('dFormSpinner').classList.add('hidden');
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    el('dSaveBtn').disabled = false;
    el('dFormSpinner').classList.add('hidden');
  }
}

function startDeleteDebt(id)  { debtsUI.deleteId = id; renderDebts(); }
function cancelDeleteDebt()   { debtsUI.deleteId = null; renderDebts(); }

async function confirmDeleteDebt() {
  const id = debtsUI.deleteId;
  debtsUI.deleteId = null;
  const btn = document.querySelector('[data-action="confirm-delete"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    const res = await DebtAPI.deleteDebt(id);
    if (res.ok) {
      showMsg('Debt deleted.');
      document.dispatchEvent(new CustomEvent('dt:reload'));
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      renderDebts();
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    renderDebts();
  }
}
