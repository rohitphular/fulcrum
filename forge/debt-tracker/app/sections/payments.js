import { state } from '../core/state.js';
import { el, esc, fmtAmount, todayISO, fmtPayDate } from '../core/utils.js';
import { showMsg } from '../core/ui.js';
import { DebtAPI } from '../core/api.js';

const paymentsUI = { deleteId: null, filterDebtId: '' };

function updatePayCurrencyLabel() {
  const debt = state.debts.find(d => d.id === el('pDebt')?.value);
  const lbl  = el('pCurrencyLabel');
  if (lbl) lbl.textContent = debt?.currency ? `(${debt.currency})` : '';
}

function payFormHTML() {
  const activeDebts = state.debts.filter(d => d.status === 'active');
  if (!activeDebts.length) {
    return `<div class="card" style="margin-bottom:22px;">
      <p style="color:var(--muted);font-size:13.5px;margin:0;">
        No active debts found.
        <a href="#" id="goToDebts" style="color:var(--teal);">Add a debt first</a>
        before logging payments.
      </p>
    </div>`;
  }
  return `
<div class="card" style="margin-bottom:22px;">
  <p class="sec-sub" style="margin:0 0 16px;">Log a payment against one of your active debts.</p>
  <form id="payForm" novalidate>
    <div class="form-grid">
      <div class="field" id="pDebtWrap">
        <label for="pDebt">Debt *</label>
        <select id="pDebt">
          <option value="">&#8212; select a debt &#8212;</option>
          ${activeDebts.map(d => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.currency)})</option>`).join('')}
        </select>
        <div class="err-msg">Select a debt.</div>
      </div>
      <div class="field" id="pAmountWrap">
        <label for="pAmount">Amount * <span id="pCurrencyLabel" class="field-currency"></span></label>
        <input type="number" id="pAmount" placeholder="0.00" min="0.01" step="0.01">
        <div class="err-msg">Enter a valid amount greater than zero.</div>
      </div>
      <div class="field">
        <label for="pDate">Date *</label>
        <input type="date" id="pDate" value="${esc(todayISO())}">
      </div>
      <div class="field">
        <label for="pNote">Note</label>
        <input type="text" id="pNote" placeholder="Optional" maxlength="500">
      </div>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="pSaveBtn">Log Payment</button>
      <span class="hidden" id="pFormSpinner"><span class="spinner"></span>Saving&hellip;</span>
    </div>
  </form>
</div>`;
}

function payHistoryHTML() {
  const seen = new Set();
  const debtOptions = [];
  state.payments.forEach(p => {
    if (!seen.has(p.debt_id)) {
      seen.add(p.debt_id);
      debtOptions.push({ id: p.debt_id, name: p.debt_name });
    }
  });
  debtOptions.sort((a, b) => a.name.localeCompare(b.name));

  const filtered = paymentsUI.filterDebtId
    ? state.payments.filter(p => p.debt_id === paymentsUI.filterDebtId)
    : state.payments;

  const sorted = [...filtered].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    return byDate !== 0 ? byDate : (b.created_at || '').localeCompare(a.created_at || '');
  });

  const rows = sorted.length
    ? sorted.map(payRowHTML).join('')
    : `<tr class="empty-row"><td colspan="6">${
        paymentsUI.filterDebtId ? 'No payments for this debt.' : 'No payments logged yet.'
      }</td></tr>`;

  const filterSelect = debtOptions.length ? `
    <div class="field" style="margin:0;min-width:190px;">
      <select id="pFilterDebt">
        <option value="">All debts</option>
        ${debtOptions.map(d =>
          `<option value="${esc(d.id)}" ${paymentsUI.filterDebtId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`
        ).join('')}
      </select>
    </div>` : '';

  return `
<div class="sec-head" style="margin-top:28px;">
  <div class="sec-head-left"><h2>History</h2></div>
  ${filterSelect}
</div>
<div class="table-wrap">
  <table>
    <thead><tr>
      <th>Date</th><th>Debt</th><th>Amount</th><th>CCY</th><th>Note</th><th>Actions</th>
    </tr></thead>
    <tbody id="payHistoryBody">${rows}</tbody>
  </table>
</div>`;
}

function payRowHTML(p) {
  if (paymentsUI.deleteId === p.id) {
    return `<tr>
      <td class="td-mono">${fmtPayDate(p.date)}</td>
      <td class="td-name">${esc(p.debt_name)}</td>
      <td colspan="3"><span class="confirm-text">Delete payment of <strong>${fmtAmount(p.amount, p.currency)}</strong>? The balance will be restored.</span></td>
      <td><div class="row-actions">
        <button class="btn-link danger" data-action="pay-confirm-delete">Yes, delete</button>
        <button class="btn-link" data-action="pay-cancel-delete">Cancel</button>
      </div></td>
    </tr>`;
  }
  return `<tr>
    <td class="td-mono">${fmtPayDate(p.date)}</td>
    <td class="td-name">${esc(p.debt_name)}</td>
    <td class="td-amount">${fmtAmount(p.amount, p.currency)}</td>
    <td>${esc(p.currency)}</td>
    <td class="td-muted">${esc(p.note || '') || '&mdash;'}</td>
    <td><div class="row-actions">
      <button class="btn-link danger" data-action="pay-delete" data-id="${esc(p.id)}">Delete</button>
    </div></td>
  </tr>`;
}

export function renderPayments() {
  el('paymentsContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Payments</h2></div>
    </div>
    ${payFormHTML()}
    ${payHistoryHTML()}
  `;
  wirePaymentsEvents();
}

function wirePaymentsEvents() {
  el('goToDebts')?.addEventListener('click', e => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('dt:show-section', { detail: 'debts' }));
  });

  const form = el('payForm');
  if (form) {
    form.addEventListener('submit', e => { e.preventDefault(); savePayment(); });
    el('pDebt').addEventListener('change', updatePayCurrencyLabel);
  }

  el('pFilterDebt')?.addEventListener('change', e => {
    paymentsUI.filterDebtId = e.target.value;
    renderPayments();
  });

  el('payHistoryBody')?.addEventListener('click', payRowClick);
}

function payRowClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'pay-delete')         startDeletePayment(id);
  if (action === 'pay-confirm-delete') confirmDeletePayment();
  if (action === 'pay-cancel-delete')  cancelDeletePayment();
}

async function savePayment() {
  const debtId = el('pDebt').value;
  const amount = el('pAmount').value.trim();
  const date   = el('pDate').value;
  const note   = el('pNote').value.trim();

  let valid = true;
  const dw = el('pDebtWrap'), aw = el('pAmountWrap');
  if (!debtId)                                                           { dw.classList.add('error'); valid = false; } else dw.classList.remove('error');
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) { aw.classList.add('error'); valid = false; } else aw.classList.remove('error');
  if (!valid) return;

  const debt = state.debts.find(d => d.id === debtId);

  el('pSaveBtn').disabled = true;
  el('pFormSpinner').classList.remove('hidden');

  try {
    const res = await DebtAPI.createPayment({
      debt_id:   debtId,
      debt_name: debt?.name     || '',
      amount:    parseFloat(amount),
      currency:  debt?.currency || '',
      date:      date || todayISO(),
      note,
    });
    if (res.ok) {
      showMsg('Payment logged. Debt balance updated.');
      document.dispatchEvent(new CustomEvent('dt:reload'));
    } else {
      showMsg('Save failed: ' + (res.error || 'unknown'), 'warn');
      el('pSaveBtn').disabled = false;
      el('pFormSpinner').classList.add('hidden');
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    el('pSaveBtn').disabled = false;
    el('pFormSpinner').classList.add('hidden');
  }
}

function startDeletePayment(id)  { paymentsUI.deleteId = id; renderPayments(); }
function cancelDeletePayment()   { paymentsUI.deleteId = null; renderPayments(); }

async function confirmDeletePayment() {
  const id = paymentsUI.deleteId;
  paymentsUI.deleteId = null;
  const btn = document.querySelector('[data-action="pay-confirm-delete"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    const res = await DebtAPI.deletePayment(id);
    if (res.ok) {
      showMsg('Payment deleted. Debt balance restored.');
      document.dispatchEvent(new CustomEvent('dt:reload'));
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      renderPayments();
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    renderPayments();
  }
}
