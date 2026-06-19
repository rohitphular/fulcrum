import { state } from '../core/state.js';
import { el, esc, getSymbol, toBase } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { ExpenseAPI } from '../core/api.js';
import { renderDashboard } from './dashboard.js';

// Schema is loaded at boot into state.accountSchema — no hardcoded constants here.
function _sch()          { return state.accountSchema || {}; }
function _accountTypes() { return _sch().types || []; }
function _liabSet()      { return new Set(_sch().liability_types  || []); }
function _loanSet()      { return new Set(_sch().loan_types        || []); }
function _invSubTypes()  { return _sch().investment_sub_types || []; }
function _mortSubTypes() { return _sch().mortgage_sub_types   || []; }
function _validTypes()   { return new Set(_accountTypes().map(t => t.value)); }

function isActive(a) {
  return a.is_active === true || a.is_active === 'TRUE' || a.is_active === 'true';
}

function isLiability(a) { return _liabSet().has(a.type); }

function typeLabel(type) {
  return _accountTypes().find(t => t.value === type)?.label || type || '—';
}

function typeOptgroupHtml(selected) {
  const groups = [
    { key: 'liquid',         label: 'Liquid' },
    { key: 'investment',     label: 'Investment' },
    { key: 'secured_loan',   label: 'Secured Loans' },
    { key: 'unsecured_loan', label: 'Unsecured Loans' },
    { key: 'credit_card',    label: 'Credit Card' },
    { key: 'overdraft',      label: 'Overdraft' },
  ];
  const types = _accountTypes();
  return groups.map(g => {
    const opts = types.filter(t => t.group === g.key).map(t =>
      `<option value="${esc(t.value)}" ${selected === t.value ? 'selected' : ''}>${esc(t.label)}</option>`
    ).join('');
    return opts ? `<optgroup label="${g.label}">${opts}</optgroup>` : '';
  }).join('');
}

function fmtBal(n) {
  return Math.abs(parseFloat(n || 0)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function progressBar(pct, highIsRed) {
  const fill = highIsRed
    ? (pct > 90 ? 'var(--ember)' : pct > 60 ? '#D97706' : pct > 30 ? '#F59E0B' : 'var(--teal)')
    : (pct > 90 ? 'var(--teal)' : pct > 60 ? '#10B981' : pct > 30 ? '#F59E0B' : 'var(--ember)');
  return `<div style="height:3px;background:var(--hair);border-radius:2px;margin-top:3px;overflow:hidden">
    <div style="height:100%;width:${Math.min(pct,100).toFixed(1)}%;background:${fill};border-radius:2px"></div>
  </div>`;
}

function balanceCell(a) {
  const bal = parseFloat(a.current_balance || 0);
  const sym = getSymbol(a.currency);
  if (isLiability(a)) {
    const html = `<span class="summary-card-value negative" style="font-size:13px">${sym}${fmtBal(bal)} owed</span>`;

    if (a.type === 'credit_card' && Number(a.credit_card_limit) > 0) {
      const pct = a.utilisation_pct ?? 0;
      return `${html}
        <div style="margin-top:4px;font-size:10px;color:var(--muted);font-family:var(--mono)">${sym}${fmtBal(Math.abs(bal))} of ${sym}${fmtBal(a.credit_card_limit)} (${pct.toFixed(1)}%)</div>
        ${progressBar(pct, true)}`;
    }

    if (a.type === 'overdraft' && Number(a.overdraft_limit) > 0) {
      const pct = a.utilisation_pct ?? 0;
      return `${html}
        <div style="margin-top:4px;font-size:10px;color:var(--muted);font-family:var(--mono)">${sym}${fmtBal(Math.abs(bal))} of ${sym}${fmtBal(a.overdraft_limit)} (${pct.toFixed(1)}%)</div>
        ${progressBar(pct, true)}`;
    }

    if (_loanSet().has(a.type) && a.repayment_pct != null) {
      const pct = a.repayment_pct;
      return `${html}
        <div style="margin-top:4px;font-size:10px;color:var(--muted);font-family:var(--mono)">${pct.toFixed(1)}% repaid${a.next_payment_date ? ` · next ${a.next_payment_date}` : ''}</div>
        ${progressBar(pct, false)}`;
    }

    return html;
  }
  const cls = bal < 0 ? 'negative' : '';
  return `<span class="${cls}" style="font-family:var(--mono)">${bal < 0 ? '−' : ''}${sym}${fmtBal(bal)}</span>`;
}

export function renderAccounts() {
  el('accountsContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Accounts</h2></div>
      <button class="btn btn-primary btn-sm" id="accAddBtn">${state.accAddOpen ? '× Close' : '+ Add account'}</button>
    </div>
    ${state.accAddOpen ? renderAddForm() : ''}
    ${renderNetWorth()}
    ${renderTable()}
  `;
  attachEvents();
}

function renderNetWorth() {
  if (!state.accounts.length) return '';
  const sym = getSymbol(state.quoteCurrency);
  const fmt = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const totalAssets = state.accounts
    .filter(a => !isLiability(a))
    .reduce((s, a) => s + toBase(a.current_balance, a.currency, null), 0);
  const totalLiab = state.accounts
    .filter(a => isLiability(a))
    .reduce((s, a) => s + Math.abs(toBase(a.current_balance, a.currency, null)), 0);
  const netWorth = totalAssets - totalLiab;

  return `
    <div class="summary-grid" style="margin-bottom:20px">
      <div class="summary-card">
        <div class="summary-card-label">Total Assets</div>
        <div class="summary-card-value positive">${fmt(totalAssets)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Total Liabilities</div>
        <div class="summary-card-value negative">${fmt(totalLiab)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Net Worth</div>
        <div class="summary-card-value ${netWorth >= 0 ? 'positive' : 'negative'}">${netWorth < 0 ? '−' : ''}${fmt(netWorth)}</div>
      </div>
    </div>`;
}

function subTypeOptsHtml(type, selected) {
  const opts = type === 'investment' ? _invSubTypes()
             : type === 'mortgage'   ? _mortSubTypes()
             : [];
  return `<option value="">— select —</option>` +
    opts.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v.replace(/_/g, ' '))}</option>`).join('');
}

function renderAddForm() {
  const currencyOpts = state.rates.map(r =>
    `<option value="${esc(r.currency)}">${esc(r.currency)}</option>`
  ).join('');

  return `
  <div class="card" style="margin-bottom:20px">
    <div class="form-grid" style="margin-bottom:16px">
      <div class="field">
        <label for="accNewName">Name *</label>
        <input type="text" id="accNewName" placeholder="e.g. Barclays Current">
      </div>
      <div class="field">
        <label for="accNewCurrency">Currency *</label>
        <select id="accNewCurrency">${currencyOpts}</select>
      </div>
      <div class="field">
        <label for="accNewType">Type *</label>
        <select id="accNewType">${typeOptgroupHtml('current')}</select>
      </div>
    </div>

    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label for="accNewOpeningBal">Opening balance</label>
        <input type="number" id="accNewOpeningBal" step="0.01" placeholder="0.00">
      </div>
      <div class="field">
        <label for="accNewInstitution">Institution</label>
        <input type="text" id="accNewInstitution" placeholder="e.g. Barclays">
      </div>
      <div class="field">
        <label for="accNewAccNum">Account no. (last 4)</label>
        <input type="text" id="accNewAccNum" maxlength="4" placeholder="0000">
      </div>
      <div class="field">
        <label for="accNewNotes">Notes</label>
        <input type="text" id="accNewNotes" placeholder="Optional notes">
      </div>
    </div>

    <div id="accNewSubTypeWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewSubType">Sub-type</label>
          <select id="accNewSubType"><option value="">— select —</option></select>
        </div>
      </div>
    </div>

    <div id="accNewSavingsWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewInterestRate">Interest rate (%)</label>
          <input type="number" id="accNewInterestRate" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="field">
          <label for="accNewInterestFreq">Interest frequency</label>
          <select id="accNewInterestFreq">
            <option value="">— select —</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
      </div>
    </div>

    <div id="accNewInvestmentWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewInvPlatform">Platform / Broker</label>
          <input type="text" id="accNewInvPlatform" placeholder="e.g. Vanguard">
        </div>
        <div class="field">
          <label for="accNewInvRisk">Risk level</label>
          <select id="accNewInvRisk">
            <option value="">— select —</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div class="field">
          <label for="accNewInvMaturity">Maturity date</label>
          <input type="date" id="accNewInvMaturity">
        </div>
      </div>
    </div>

    <div id="accNewLoanWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start;margin-bottom:12px">
        <div class="field">
          <label for="accNewLoanOriginal">Original loan amount *</label>
          <input type="number" id="accNewLoanOriginal" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="field">
          <label for="accNewLoanRate">Interest rate (%)</label>
          <input type="number" id="accNewLoanRate" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="field">
          <label for="accNewLoanInterestType">Interest type</label>
          <select id="accNewLoanInterestType">
            <option value="">— select —</option>
            <option value="fixed">Fixed</option>
            <option value="variable">Variable</option>
            <option value="tracker">Tracker</option>
          </select>
        </div>
        <div class="field">
          <label for="accNewLoanTenure">Tenure (months)</label>
          <input type="number" id="accNewLoanTenure" step="1" min="1" placeholder="0">
        </div>
      </div>
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewLoanStart">Start date</label>
          <input type="date" id="accNewLoanStart">
        </div>
        <div class="field">
          <label for="accNewLoanEnd">End date</label>
          <input type="date" id="accNewLoanEnd">
        </div>
        <div class="field">
          <label for="accNewLoanFirstRepay">First repayment date</label>
          <input type="date" id="accNewLoanFirstRepay">
        </div>
        <div class="field">
          <label for="accNewLoanMonthly">Monthly repayment</label>
          <input type="number" id="accNewLoanMonthly" step="0.01" min="0" placeholder="0.00">
        </div>
      </div>
    </div>

    <div id="accNewCollateralWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewCollateral">Collateral description</label>
          <input type="text" id="accNewCollateral" placeholder="e.g. 123 High Street">
        </div>
      </div>
    </div>

    <div id="accNewCreditCardWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start;margin-bottom:12px">
        <div class="field">
          <label for="accNewCCLimit">Credit limit</label>
          <input type="number" id="accNewCCLimit" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="field">
          <label for="accNewCCApr">APR (%)</label>
          <input type="number" id="accNewCCApr" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="field">
          <label for="accNewCCFreeDays">Interest-free days</label>
          <input type="number" id="accNewCCFreeDays" step="1" min="0" placeholder="0">
        </div>
        <div class="field">
          <label for="accNewCCAnnualFee">Annual fee</label>
          <input type="number" id="accNewCCAnnualFee" step="0.01" min="0" placeholder="0.00">
        </div>
      </div>
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewCCBillingDate">Billing date (day of month)</label>
          <input type="number" id="accNewCCBillingDate" step="1" min="1" max="31" placeholder="1–31">
        </div>
        <div class="field">
          <label for="accNewCCDueDate">Due date (day of month)</label>
          <input type="number" id="accNewCCDueDate" step="1" min="1" max="31" placeholder="1–31">
        </div>
        <div class="field">
          <label for="accNewCCMinPct">Min. payment (%)</label>
          <input type="number" id="accNewCCMinPct" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="field">
          <label for="accNewCCMinFixed">Min. payment (fixed)</label>
          <input type="number" id="accNewCCMinFixed" step="0.01" min="0" placeholder="0.00">
        </div>
      </div>
    </div>

    <div id="accNewOverdraftWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewODLimit">Overdraft limit</label>
          <input type="number" id="accNewODLimit" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="field">
          <label for="accNewODArranged">Arranged</label>
          <select id="accNewODArranged">
            <option value="true" selected>Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        <div class="field">
          <label for="accNewODApr">APR (%)</label>
          <input type="number" id="accNewODApr" step="0.01" min="0" placeholder="0.00">
        </div>
      </div>
    </div>

    <div class="form-actions" style="margin-top:20px">
      <button class="btn btn-primary" id="accSaveNew">Save</button>
      <button class="btn btn-secondary" id="accCancelNew">Cancel</button>
    </div>
    <div class="pin-error" id="accAddError"></div>
  </div>`;
}

function activeBadge(a) {
  return isActive(a)
    ? `<span class="badge badge-in">active</span>`
    : `<span class="badge badge-out">archived</span>`;
}

function renderAccountRow(a) {
  if (state.accDeleteRow === a._row) {
    return `<tr>
      <td colspan="6"><span class="confirm-text">Delete <strong>${esc(a.name)}</strong>? Existing transactions linked to this account are not affected.</span></td>
      <td><div class="row-actions">
        <button class="btn-link danger" data-action="acc-confirm-delete" data-row="${a._row}">Yes, delete</button>
        <button class="btn-link" data-action="acc-cancel-delete">Cancel</button>
      </div></td>
    </tr>`;
  }
  if (state.accEditRow === a._row) return renderEditRow(a);

  return `<tr>
    <td class="td-mono" style="color:var(--muted);font-size:11px">${esc(a.id)}</td>
    <td>${esc(a.name)}${a.notes ? `<span class="info-icon-wrap"><span style="cursor:help;color:var(--teal);font-size:13px">ⓘ</span><span class="info-tooltip">${esc(a.notes)}</span></span>` : ''}</td>
    <td style="color:var(--muted);font-size:12px">${esc(typeLabel(a.type))}</td>
    <td>${esc(a.currency)}</td>
    <td>${balanceCell(a)}</td>
    <td>${activeBadge(a)}</td>
    <td><div class="row-actions">
      <button class="btn-link" data-action="acc-edit" data-row="${a._row}">Edit</button>
      <button class="btn-link danger" data-action="acc-delete" data-row="${a._row}">Delete</button>
    </div></td>
  </tr>`;
}

function groupHeader(label, total, sym, isLiab) {
  const sign = isLiab ? '−' : '';
  return `<tr class="acc-group-header">
    <td colspan="7" style="background:var(--canvas);padding:10px 12px 4px;font-size:11px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-bottom:none">
      ${label}
      <span style="float:right;font-weight:600;color:${isLiab ? 'var(--ember)' : 'var(--teal)'}">${sign}${sym}${Math.abs(total).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
    </td>
  </tr>`;
}

const TABLE_GROUPS = [
  { key: 'liquid',         label: 'Liquid',          isLiab: false },
  { key: 'investment',     label: 'Investment',      isLiab: false },
  { key: 'secured_loan',   label: 'Secured Loans',   isLiab: true  },
  { key: 'unsecured_loan', label: 'Unsecured Loans', isLiab: true  },
  { key: 'credit_card',    label: 'Credit Cards',    isLiab: true  },
  { key: 'overdraft',      label: 'Overdrafts',      isLiab: true  },
];

function typeGroup(type) {
  return _accountTypes().find(t => t.value === type)?.group || 'liquid';
}

function renderTable() {
  if (!state.accounts.length) {
    return `<p class="placeholder">No accounts yet. Use &ldquo;+ Add account&rdquo; to create one.</p>`;
  }

  const sym = getSymbol(state.quoteCurrency);

  const byGroup = {};
  state.accounts.forEach(a => {
    const g = typeGroup(a.type);
    (byGroup[g] = byGroup[g] || []).push(a);
  });

  const bodyRows = TABLE_GROUPS.flatMap(g => {
    const accs = byGroup[g.key];
    if (!accs || !accs.length) return [];
    const total = g.isLiab
      ? accs.reduce((s, a) => s + Math.abs(toBase(a.current_balance, a.currency, null)), 0)
      : accs.reduce((s, a) => s + toBase(a.current_balance, a.currency, null), 0);
    return [groupHeader(g.label, total, sym, g.isLiab), ...accs.map(renderAccountRow)];
  }).join('');

  return `
    <div class="table-wrap">
      <table class="acc-table">
        <thead><tr>
          <th style="width:90px">ID</th>
          <th style="width:160px">Name</th>
          <th style="width:140px">Type</th>
          <th style="width:70px">CCY</th>
          <th style="width:180px">Balance</th>
          <th style="width:80px">Status</th>
          <th style="width:100px">Actions</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

function renderEditRow(a) {
  const r    = a._row;
  const type = a.type;
  const isCC   = type === 'credit_card';
  const isOD   = type === 'overdraft';
  const isLoan = _loanSet().has(type);
  const isInv  = type === 'investment';
  const isSav  = type === 'current' || type === 'savings';
  const hasCollateral = type === 'mortgage' || type === 'auto_loan';

  const f = (id, label, content) => `<div class="field" style="margin:0"><label>${label}</label>${content}</div>`;
  const inp  = (id, val, extra='') => `<input class="rate-edit-input" style="width:100%" id="${id}" value="${esc(String(val ?? ''))}" ${extra}>`;
  const num  = (id, val, extra='') => `<input class="rate-edit-input" style="width:100%" type="number" step="0.01" id="${id}" value="${esc(String(val ?? ''))}" ${extra}>`;
  const date = (id, val)           => `<input class="rate-edit-input" style="width:100%" type="date" id="${id}" value="${esc(String(val ?? ''))}">`;
  const ro   = (val)               => `<div style="padding:6px 0;font-size:13px;color:var(--muted)">${esc(String(val ?? '—'))}</div>`;
  const sel  = (id, opts, val)     => `<select class="cat-edit-select" style="width:100%" id="${id}">${opts.map(([v,l]) => `<option value="${esc(v)}" ${String(val)===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;

  return `<tr>
    <td class="td-mono" style="color:var(--muted);font-size:11px">${esc(a.id)}</td>
    <td colspan="5">
      <div style="padding:4px 0;display:flex;flex-direction:column;gap:16px">

        <div class="form-grid" style="gap:10px 12px">
          ${f(`accEditName-${r}`,     'Name',             inp(`accEditName-${r}`, a.name))}
          ${f(`accEditIsActive-${r}`, 'Status',           sel(`accEditIsActive-${r}`, [['true','active'],['false','archived']], a.is_active))}
          ${f(`accEditInst-${r}`,     'Institution',      inp(`accEditInst-${r}`, a.institution || ''))}
          ${f(`accEditAccNum-${r}`,   'Acc. no. (last 4)',inp(`accEditAccNum-${r}`, a.account_number_last4 || '', 'maxlength="4"'))}
          ${f(`accEditNotes-${r}`,    'Notes',            inp(`accEditNotes-${r}`, a.notes || ''))}
        </div>

        ${isSav ? `<div class="form-grid" style="gap:10px 12px">
          ${f(`accEditIntRate-${r}`,  'Interest rate (%)',   num(`accEditIntRate-${r}`, a.savings_interest_rate))}
          ${f(`accEditIntFreq-${r}`,  'Interest frequency',  sel(`accEditIntFreq-${r}`, [['','— select —'],['monthly','Monthly'],['quarterly','Quarterly'],['annual','Annual']], a.savings_interest_frequency || ''))}
        </div>` : ''}

        ${isInv ? `<div class="form-grid" style="gap:10px 12px">
          ${f(`accEditInvPlat-${r}`,    'Platform / Broker',  inp(`accEditInvPlat-${r}`, a.investment_platform || ''))}
          ${f(`accEditInvRisk-${r}`,    'Risk level',          sel(`accEditInvRisk-${r}`, [['','— select —'],['low','Low'],['medium','Medium'],['high','High']], a.investment_risk_level || ''))}
          ${f(`accEditInvMaturity-${r}`,'Maturity date',        date(`accEditInvMaturity-${r}`, a.savings_maturity_date || ''))}
        </div>` : ''}

        ${isLoan ? `<div class="form-grid" style="gap:10px 12px">
          ${f('',                          'Orig. loan amt',    ro(getSymbol(a.currency) + fmtBal(a.loan_original_amount || 0)))}
          ${f(`accEditLoanRate-${r}`,       'Interest rate (%)', num(`accEditLoanRate-${r}`, a.loan_interest_rate))}
          ${f(`accEditLoanIType-${r}`,      'Interest type',     sel(`accEditLoanIType-${r}`, [['','— select —'],['fixed','Fixed'],['variable','Variable'],['tracker','Tracker']], a.loan_interest_type || ''))}
          ${f(`accEditLoanTenure-${r}`,     'Tenure (months)',   `<input class="rate-edit-input" style="width:100%" type="number" step="1" min="1" id="accEditLoanTenure-${r}" value="${esc(String(a.loan_tenure_months ?? ''))}">`)  }
          ${f(`accEditLoanEnd-${r}`,        'End date',          date(`accEditLoanEnd-${r}`, a.loan_end_date || ''))}
          ${f(`accEditLoanMonthly-${r}`,    'Monthly repayment', num(`accEditLoanMonthly-${r}`, a.loan_monthly_repayment))}
        </div>` : ''}

        ${hasCollateral ? `<div class="form-grid" style="gap:10px 12px">
          ${f(`accEditCollateral-${r}`, 'Collateral', inp(`accEditCollateral-${r}`, a.loan_collateral || ''))}
        </div>` : ''}

        ${isCC ? `<div class="form-grid" style="gap:10px 12px">
          ${f(`accEditCCLimit-${r}`,    'Credit limit',          num(`accEditCCLimit-${r}`, a.credit_card_limit))}
          ${f(`accEditCCApr-${r}`,      'APR (%)',               num(`accEditCCApr-${r}`, a.credit_card_apr))}
          ${f(`accEditCCFreeDays-${r}`, 'Interest-free days',    `<input class="rate-edit-input" style="width:100%" type="number" step="1" min="0" id="accEditCCFreeDays-${r}" value="${esc(String(a.credit_card_interest_free_days ?? ''))}">`)  }
          ${f(`accEditCCBill-${r}`,     'Billing date',          `<input class="rate-edit-input" style="width:100%" type="number" step="1" min="1" max="31" id="accEditCCBill-${r}" value="${esc(String(a.credit_card_billing_date ?? ''))}">`)  }
          ${f(`accEditCCDue-${r}`,      'Due date',              `<input class="rate-edit-input" style="width:100%" type="number" step="1" min="1" max="31" id="accEditCCDue-${r}" value="${esc(String(a.credit_card_due_date ?? ''))}">`)  }
          ${f(`accEditCCMinPct-${r}`,   'Min. payment (%)',      num(`accEditCCMinPct-${r}`, a.credit_card_minimum_payment_pct))}
          ${f(`accEditCCMinFixed-${r}`, 'Min. payment (fixed)',  num(`accEditCCMinFixed-${r}`, a.credit_card_minimum_payment_fixed))}
          ${f(`accEditCCAnnFee-${r}`,   'Annual fee',            num(`accEditCCAnnFee-${r}`, a.credit_card_annual_fee))}
        </div>` : ''}

        ${isOD ? `<div class="form-grid" style="gap:10px 12px">
          ${f(`accEditODLimit-${r}`,    'Overdraft limit', num(`accEditODLimit-${r}`, a.overdraft_limit))}
          ${f(`accEditODArr-${r}`,      'Arranged',        sel(`accEditODArr-${r}`, [['true','Yes'],['false','No']], a.overdraft_arranged))}
          ${f(`accEditODApr-${r}`,      'APR (%)',         num(`accEditODApr-${r}`, a.overdraft_apr))}
        </div>` : ''}

        <div class="form-grid form-grid-4" style="gap:10px 12px">
          ${f('', 'Type',        ro(typeLabel(a.type)))}
          ${f('', 'Currency',    ro(a.currency))}
          ${f('', 'Opening bal.',ro(getSymbol(a.currency) + fmtBal(a.opening_balance || 0)))}
          ${f('', 'Current bal.',`<div style="padding:6px 0;font-size:13px">${balanceCell(a)}</div>`)}
        </div>

      </div>
    </td>
    <td><div class="row-actions" style="margin-top:4px">
      <button class="btn-link" data-action="acc-save-edit" data-row="${r}">Save</button>
      <button class="btn-link" data-action="acc-cancel-edit">Cancel</button>
    </div></td>
  </tr>`;
}

function _refreshAddTypeUI() {
  const type = el('accNewType')?.value || '';

  const show = id => { const e = el(id); if (e) e.style.display = ''; };
  const hide = id => { const e = el(id); if (e) e.style.display = 'none'; };

  // Sub-type
  const hasSubType = type === 'investment' || type === 'mortgage';
  hasSubType ? show('accNewSubTypeWrap') : hide('accNewSubTypeWrap');
  if (hasSubType) {
    const sel = el('accNewSubType');
    if (sel) sel.innerHTML = subTypeOptsHtml(type, '');
  }

  // Savings fields (current + savings)
  type === 'current' || type === 'savings' ? show('accNewSavingsWrap') : hide('accNewSavingsWrap');

  // Investment fields
  type === 'investment' ? show('accNewInvestmentWrap') : hide('accNewInvestmentWrap');

  // Loan fields
  _loanSet().has(type) ? show('accNewLoanWrap') : hide('accNewLoanWrap');

  // Collateral (mortgage + auto_loan)
  type === 'mortgage' || type === 'auto_loan' ? show('accNewCollateralWrap') : hide('accNewCollateralWrap');

  // Credit card fields
  type === 'credit_card' ? show('accNewCreditCardWrap') : hide('accNewCreditCardWrap');

  // Overdraft fields
  type === 'overdraft' ? show('accNewOverdraftWrap') : hide('accNewOverdraftWrap');
}


function attachEvents() {
  el('accAddBtn')?.addEventListener('click', () => {
    state.accAddOpen = !state.accAddOpen;
    renderAccounts();
  });

  el('accSaveNew')?.addEventListener('click', saveNew);
  el('accCancelNew')?.addEventListener('click', () => { state.accAddOpen = false; renderAccounts(); });
  if (el('accNewType')) {
    el('accNewType').addEventListener('change', _refreshAddTypeUI);
    _refreshAddTypeUI(); // apply initial state for the pre-selected type
  }

  el('accountsContent')?.querySelector('.table-wrap')?.addEventListener('click', e => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row ? Number(btn.dataset.row) : null;

    if (action === 'acc-edit') {
      state.accEditRow = row; state.accDeleteRow = null; renderAccounts();
      return;
    }
    if (action === 'acc-cancel-edit')    { state.accEditRow = null; renderAccounts(); }
    if (action === 'acc-save-edit')      { saveEdit(row); }
    if (action === 'acc-delete')         { state.accDeleteRow = row; state.accEditRow = null; renderAccounts(); }
    if (action === 'acc-cancel-delete')  { state.accDeleteRow = null; renderAccounts(); }
    if (action === 'acc-confirm-delete') { confirmDelete(row); }
  });

}

function _v(id)  { return el(id)?.value ?? ''; }
function _n(id)  { const v = _v(id); return v === '' ? undefined : parseFloat(v); }
function _ni(id) { const v = _v(id); return v === '' ? undefined : parseInt(v, 10); }

async function saveNew() {
  const name       = _v('accNewName').trim();
  const currency   = _v('accNewCurrency');
  const type       = _v('accNewType');
  const notes      = _v('accNewNotes').trim();
  const errEl      = el('accAddError');

  if (!name)                                             { if (errEl) errEl.textContent = 'Name is required.';     return; }
  if (!type || !_validTypes().has(type))           { if (errEl) errEl.textContent = 'Type is required.';     return; }
  if (!currency || !(currency in (state.rateMap || {}))) { if (errEl) errEl.textContent = 'Currency is required.'; return; }
  if (errEl) errEl.textContent = '';

  const opening_bal = _v('accNewOpeningBal');
  const payload = {
    name, currency, type, notes,
    institution:          _v('accNewInstitution').trim() || undefined,
    account_number_last4: _v('accNewAccNum').trim()      || undefined,
    opening_balance: _liabSet().has(type)
      ? -(Math.abs(parseFloat(opening_bal) || 0))
      : parseFloat(opening_bal) || 0,
  };

  if (type === 'current' || type === 'savings') {
    const rate = _n('accNewInterestRate'); if (rate !== undefined) payload.savings_interest_rate = rate;
    const freq = _v('accNewInterestFreq'); if (freq) payload.savings_interest_frequency = freq;
  }

  if (type === 'investment') {
    const plat = _v('accNewInvPlatform').trim(); if (plat) payload.investment_platform = plat;
    const risk = _v('accNewInvRisk');            if (risk) payload.investment_risk_level = risk;
    const mat  = _v('accNewInvMaturity');        if (mat)  payload.savings_maturity_date = mat;
    const sub  = _v('accNewSubType');            if (sub)  payload.sub_type = sub;
  }

  if (_loanSet().has(type)) {
    const orig = _n('accNewLoanOriginal');
    if (!orig) { if (errEl) errEl.textContent = 'Original loan amount is required.'; return; }
    payload.loan_original_amount = orig;
    const rate  = _n('accNewLoanRate');    if (rate  !== undefined) payload.loan_interest_rate    = rate;
    const itype = _v('accNewLoanInterestType'); if (itype) payload.loan_interest_type = itype;
    const ten   = _ni('accNewLoanTenure'); if (ten   !== undefined) payload.loan_tenure_months    = ten;
    const start = _v('accNewLoanStart');   if (start) payload.loan_start_date           = start;
    const end   = _v('accNewLoanEnd');     if (end)   payload.loan_end_date             = end;
    const first = _v('accNewLoanFirstRepay'); if (first) payload.loan_first_repayment_date = first;
    const mon   = _n('accNewLoanMonthly'); if (mon   !== undefined) payload.loan_monthly_repayment = mon;
    if (type === 'mortgage') {
      const sub = _v('accNewSubType'); if (sub) payload.sub_type = sub;
    }
  }

  if (type === 'mortgage' || type === 'auto_loan') {
    const coll = _v('accNewCollateral').trim(); if (coll) payload.loan_collateral = coll;
  }

  if (type === 'credit_card') {
    const lim = _n('accNewCCLimit');     if (lim  !== undefined) payload.credit_card_limit                  = lim;
    const apr = _n('accNewCCApr');       if (apr  !== undefined) payload.credit_card_apr                    = apr;
    const fd  = _ni('accNewCCFreeDays'); if (fd   !== undefined) payload.credit_card_interest_free_days     = fd;
    const bd  = _ni('accNewCCBillingDate'); if (bd !== undefined) payload.credit_card_billing_date          = bd;
    const dd  = _ni('accNewCCDueDate');  if (dd   !== undefined) payload.credit_card_due_date               = dd;
    const mp  = _n('accNewCCMinPct');    if (mp   !== undefined) payload.credit_card_minimum_payment_pct    = mp;
    const mf  = _n('accNewCCMinFixed');  if (mf   !== undefined) payload.credit_card_minimum_payment_fixed  = mf;
    const af  = _n('accNewCCAnnualFee'); if (af   !== undefined) payload.credit_card_annual_fee             = af;
  }

  if (type === 'overdraft') {
    const lim = _n('accNewODLimit');  if (lim !== undefined) payload.overdraft_limit    = lim;
    const arr = _v('accNewODArranged');                      payload.overdraft_arranged = arr !== 'false';
    const apr = _n('accNewODApr');    if (apr !== undefined) payload.overdraft_apr       = apr;
  }

  const btn = el('accSaveNew');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  showLoading();
  try {
    const res = await ExpenseAPI.createAccount(payload);
    if (res.ok) {
      showMsg('Account added.');
      state.accAddOpen = false;
      await refreshAccounts();
      renderAccounts();
      renderDashboard();
    } else {
      if (errEl) errEl.textContent = 'Error: ' + (res.error || 'unknown');
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  } finally {
    hideLoading();
  }
}

async function saveEdit(rowNum) {
  const r    = rowNum;
  const name = el(`accEditName-${r}`)?.value.trim();
  if (!name) { showMsg('Name is required.', 'warn'); return; }

  const acc = state.accounts.find(a => a._row === rowNum);
  const type = acc?.type || '';

  const payload = {
    row_num:              rowNum,
    name,
    is_active:            el(`accEditIsActive-${r}`)?.value === 'true',
    institution:          el(`accEditInst-${r}`)?.value.trim()   || '',
    account_number_last4: el(`accEditAccNum-${r}`)?.value.trim() || '',
    notes:                el(`accEditNotes-${r}`)?.value.trim()  || '',
  };

  if (type === 'current' || type === 'savings') {
    const rate = _n(`accEditIntRate-${r}`); if (rate !== undefined) payload.savings_interest_rate = rate;
    const freq = _v(`accEditIntFreq-${r}`); if (freq) payload.savings_interest_frequency = freq;
  }

  if (type === 'investment') {
    const plat    = el(`accEditInvPlat-${r}`)?.value.trim();    payload.investment_platform   = plat || '';
    const risk    = _v(`accEditInvRisk-${r}`);                   if (risk)                 payload.investment_risk_level = risk;
    const maturity= _v(`accEditInvMaturity-${r}`);               if (maturity)             payload.savings_maturity_date = maturity;
  }

  if (_loanSet().has(type)) {
    const rate  = _n(`accEditLoanRate-${r}`);    if (rate  !== undefined) payload.loan_interest_rate    = rate;
    const itype = _v(`accEditLoanIType-${r}`);   if (itype)               payload.loan_interest_type    = itype;
    const ten   = _ni(`accEditLoanTenure-${r}`); if (ten   !== undefined) payload.loan_tenure_months    = ten;
    const end   = _v(`accEditLoanEnd-${r}`);     if (end)                 payload.loan_end_date         = end;
    const mon   = _n(`accEditLoanMonthly-${r}`); if (mon   !== undefined) payload.loan_monthly_repayment = mon;
  }

  if (type === 'mortgage' || type === 'auto_loan') {
    const coll = el(`accEditCollateral-${r}`)?.value.trim(); if (coll !== undefined) payload.loan_collateral = coll;
  }

  if (type === 'credit_card') {
    const lim = _n(`accEditCCLimit-${r}`);    if (lim !== undefined) payload.credit_card_limit                 = lim;
    const apr = _n(`accEditCCApr-${r}`);      if (apr !== undefined) payload.credit_card_apr                   = apr;
    const fd  = _ni(`accEditCCFreeDays-${r}`);if (fd  !== undefined) payload.credit_card_interest_free_days    = fd;
    const bd  = _ni(`accEditCCBill-${r}`);    if (bd  !== undefined) payload.credit_card_billing_date          = bd;
    const dd  = _ni(`accEditCCDue-${r}`);     if (dd  !== undefined) payload.credit_card_due_date              = dd;
    const mp  = _n(`accEditCCMinPct-${r}`);   if (mp  !== undefined) payload.credit_card_minimum_payment_pct   = mp;
    const mf  = _n(`accEditCCMinFixed-${r}`); if (mf  !== undefined) payload.credit_card_minimum_payment_fixed = mf;
    const af  = _n(`accEditCCAnnFee-${r}`);   if (af  !== undefined) payload.credit_card_annual_fee            = af;
  }

  if (type === 'overdraft') {
    const lim = _n(`accEditODLimit-${r}`);  if (lim !== undefined) payload.overdraft_limit    = lim;
    const arr = _v(`accEditODArr-${r}`);                            payload.overdraft_arranged = arr !== 'false';
    const apr = _n(`accEditODApr-${r}`);    if (apr !== undefined) payload.overdraft_apr       = apr;
  }

  showLoading();
  try {
    const res = await ExpenseAPI.updateAccount(payload);
    if (res.ok) {
      showMsg('Account updated.');
      state.accEditRow = null;
      await refreshAccounts();
      renderAccounts();
      renderDashboard();
    } else {
      showMsg('Update failed: ' + (res.error || 'unknown'), 'warn');
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
  } finally {
    hideLoading();
  }
}

async function confirmDelete(rowNum) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteAccount({ row_num: rowNum });
    if (res.ok) {
      showMsg('Account deleted.');
      state.accDeleteRow = null;
      await refreshAccounts();
      renderAccounts();
      renderDashboard();
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      state.accDeleteRow = null;
      renderAccounts();
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
    state.accDeleteRow = null;
    renderAccounts();
  } finally {
    hideLoading();
  }
}

async function refreshAccounts() {
  const r = await ExpenseAPI.listAccounts();
  if (r.ok) {
    state.accounts   = r.data || [];
    state.accountMap = Object.fromEntries(state.accounts.map(a => [a.id, a]));
  }
}
