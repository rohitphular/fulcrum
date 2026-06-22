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

function _isActive(a)    { return a.is_active === true; }
function _isLiability(a) { return _liabSet().has(a.type); }

function _typeLabel(type) {
  return _accountTypes().find(t => t.value === type)?.label || type || '—';
}

function _typeOptgroupHtml(selected) {
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

function _fmtBal(n) {
  return Math.abs(parseFloat(n || 0)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _progressBar(pct, highIsRed) {
  const fill = highIsRed
    ? (pct > 90 ? 'var(--ember)' : pct > 60 ? '#D97706' : pct > 30 ? '#F59E0B' : 'var(--teal)')
    : (pct > 90 ? 'var(--teal)' : pct > 60 ? '#10B981' : pct > 30 ? '#F59E0B' : 'var(--ember)');
  return `<div class="acc-prog-track">
    <div class="acc-prog-fill" style="width:${Math.min(pct,100).toFixed(1)}%;background:${fill}"></div>
  </div>`;
}

// compact = true → just the headline number, no detail line or progress bar (table / cards)
// compact = false → full detail with progress bar (view form)
function _balanceCell(a, compact = false) {
  const bal = parseFloat(a.current_balance || 0);
  const sym = getSymbol(a.currency);
  if (_isLiability(a)) {
    const html = `<span class="acc-bal-owed">${sym}${_fmtBal(bal)} owed</span>`;
    if (!compact) {
      if (a.type === 'credit_card' && Number(a.credit_card_limit) > 0) {
        const pct = a.utilisation_pct ?? 0;
        return `${html}
          <div class="acc-bal-detail">${sym}${_fmtBal(Math.abs(bal))} of ${sym}${_fmtBal(a.credit_card_limit)} (${pct.toFixed(1)}%)</div>
          ${_progressBar(pct, true)}`;
      }
      if (a.type === 'overdraft' && Number(a.overdraft_limit) > 0) {
        const pct = a.utilisation_pct ?? 0;
        return `${html}
          <div class="acc-bal-detail">${sym}${_fmtBal(Math.abs(bal))} of ${sym}${_fmtBal(a.overdraft_limit)} (${pct.toFixed(1)}%)</div>
          ${_progressBar(pct, true)}`;
      }
      if (_loanSet().has(a.type) && a.repayment_pct != null) {
        const pct = a.repayment_pct;
        return `${html}
          <div class="acc-bal-detail">${pct.toFixed(1)}% repaid${a.next_payment_date ? ` · next ${a.next_payment_date}` : ''}</div>
          ${_progressBar(pct, false)}`;
      }
    }
    return html;
  }
  if (a.type === 'investment') {
    const curVal = Number(a.investment_current_value);
    if (curVal > 0) {
      const invested = Math.abs(bal);
      const gain     = curVal - invested;
      const gainPct  = invested !== 0 ? gain / invested * 100 : 0;
      const gainCol  = gain >= 0 ? 'var(--teal)' : 'var(--ember)';
      const gainSign = gain >= 0 ? '+' : '−';
      if (compact) {
        return `<span class="acc-bal-mono">${sym}${_fmtBal(curVal)}</span>`;
      }
      const asOf = a.investment_as_of_date ? ` · as of ${esc(a.investment_as_of_date)}` : '';
      return `<span class="acc-bal-mono">${sym}${_fmtBal(curVal)}</span>
        <div class="acc-bal-detail">invested ${sym}${_fmtBal(invested)}${asOf}</div>
        <div class="acc-bal-detail" style="color:${gainCol}">${gainSign}${sym}${_fmtBal(Math.abs(gain))} (${gainSign}${Math.abs(gainPct).toFixed(1)}%)</div>`;
    }
  }
  const cls = bal < 0 ? 'negative acc-bal-mono' : 'acc-bal-mono';
  return `<span class="${cls}">${bal < 0 ? '−' : ''}${sym}${_fmtBal(bal)}</span>`;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderAccounts() {
  const viewAcc     = state.accViewRow !== null ? state.accounts.find(a => a._row === state.accViewRow) : null;
  const editAcc     = state.accEditRow !== null ? state.accounts.find(a => a._row === state.accEditRow) : null;
  const anyFormOpen = state.accAddOpen || viewAcc !== null || editAcc !== null;

  el('accountsContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Accounts</h2></div>
      <button class="btn btn-primary btn-sm" id="accAddBtn">${anyFormOpen ? '× Close' : '+ Add'}</button>
    </div>
    ${state.accAddOpen ? _renderAccountForm(null,    'add')  : ''}
    ${viewAcc          ? _renderAccountForm(viewAcc, 'view') : ''}
    ${editAcc          ? _renderAccountForm(editAcc, 'edit') : ''}
    ${_renderNetWorth()}
    ${_renderTable()}
  `;
  _attachEvents();
}

// ── Net worth summary ─────────────────────────────────────────────────────────

function _renderNetWorth() {
  if (!state.accounts.length) return '';
  const sym = getSymbol(state.quoteCurrency);
  const fmt = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const LIQUID_TYPES = new Set(['current', 'savings', 'cash']);

  const totalAssets = state.accounts
    .filter(a => !_isLiability(a))
    .reduce((s, a) => {
      const bal = (a.type === 'investment' && Number(a.investment_current_value) > 0)
        ? Number(a.investment_current_value)
        : parseFloat(a.current_balance || 0);
      return s + toBase(bal, a.currency, null);
    }, 0);
  const totalLiab = state.accounts
    .filter(a => _isLiability(a))
    .reduce((s, a) => s + Math.abs(toBase(a.current_balance, a.currency, null)), 0);
  const liquidCash = state.accounts
    .filter(a => LIQUID_TYPES.has(a.type))
    .reduce((s, a) => s + toBase(parseFloat(a.current_balance || 0), a.currency, null), 0);
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
      <div class="summary-card">
        <div class="summary-card-label">Liquid Cash</div>
        <div class="summary-card-value ${liquidCash >= 0 ? 'positive' : 'negative'}">${liquidCash < 0 ? '−' : ''}${fmt(liquidCash)}</div>
      </div>
    </div>`;
}

// ── Sub-type options ──────────────────────────────────────────────────────────

function _subTypeOptsHtml(type, selected) {
  const opts = type === 'investment' ? _invSubTypes()
             : type === 'mortgage'   ? _mortSubTypes()
             : [];
  return `<option value="">— select —</option>` +
    opts.map(v => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(v.replace(/_/g, ' '))}</option>`).join('');
}

// ── Unified form (Add / View / Edit) ─────────────────────────────────────────

function _renderAccountForm(a, mode) {
  const isAdd  = mode === 'add';
  const isView = mode === 'view';
  const isEdit = mode === 'edit';
  const dis    = isView ? ' disabled' : '';
  const pfx    = isAdd  ? 'accNew' : 'accEdit';

  const type          = isAdd ? null : a.type;
  const sym           = isAdd ? '' : getSymbol(a.currency);
  const isCC          = type === 'credit_card';
  const isOD          = type === 'overdraft';
  const isLoan        = type ? _loanSet().has(type) : false;
  const isInv         = type === 'investment';
  const isSav         = type === 'current' || type === 'savings';
  const hasCollateral = type === 'mortgage' || type === 'auto_loan';
  const hasSubType    = type === 'investment' || type === 'mortgage';

  const v = val => esc(String(val ?? ''));

  const currencyOpts = state.rates.map(r =>
    `<option value="${esc(r.currency)}" ${(!isAdd && a.currency === r.currency) ? 'selected' : ''}>${esc(r.currency)}</option>`
  ).join('');

  const header = (isView || isEdit) ? `
    <div class="cat-form-header">
      ${isView ? 'Viewing' : 'Editing'} — <strong>${esc(a.name)}</strong>
    </div>` : '';

  return `
  <div class="card" style="margin-bottom:20px">
    ${header}

    <div class="form-grid" style="margin-bottom:16px">
      <div class="field">
        <label for="${pfx}Name">Name *</label>
        <input type="text" id="${pfx}Name"
               value="${isAdd ? '' : v(a.name)}"
               ${isAdd ? 'placeholder="e.g. Barclays Current"' : ''}${dis}>
      </div>
      <div class="field">
        <label for="${pfx}Currency">Currency${isAdd ? ' *' : ''}</label>
        ${isAdd
          ? `<select id="accNewCurrency">${currencyOpts}</select>`
          : `<input type="text" id="accEditCurrency" value="${v(a.currency)}" disabled>`}
      </div>
      <div class="field">
        <label for="${pfx}Type">Type${isAdd ? ' *' : ''}</label>
        ${isAdd
          ? `<select id="accNewType">${_typeOptgroupHtml('current')}</select>`
          : `<input type="text" id="accEditType" value="${esc(_typeLabel(a.type))}" disabled>`}
      </div>
      ${!isAdd ? `
      <div class="field">
        <label for="accEditIsActive">Status</label>
        <select id="accEditIsActive"${dis}>
          <option value="true"  ${a.is_active !== false ? 'selected' : ''}>Active</option>
          <option value="false" ${a.is_active === false ? 'selected' : ''}>Archived</option>
        </select>
      </div>` : ''}
    </div>

    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label for="${pfx}OpeningBal">Opening balance</label>
        ${isAdd
          ? `<input type="number" id="accNewOpeningBal" step="0.01" placeholder="0.00">`
          : `<input type="text" id="accEditOpeningBal" value="${v(sym + _fmtBal(a.opening_balance || 0))}" disabled>`}
      </div>
      <div class="field">
        <label for="${pfx}${isAdd ? 'Institution' : 'Inst'}">Institution</label>
        <input type="text" id="${pfx}${isAdd ? 'Institution' : 'Inst'}"
               value="${isAdd ? '' : v(a.institution || '')}"
               ${isAdd ? 'placeholder="e.g. Barclays"' : ''}${dis}>
      </div>
      <div class="field">
        <label for="${pfx}AccNum">Account no. (last 4)</label>
        <input type="text" id="${pfx}AccNum" maxlength="4"
               value="${isAdd ? '' : v(a.account_number_last4 || '')}"
               ${isAdd ? 'placeholder="0000"' : ''}${dis}>
      </div>
      <div class="field">
        <label for="${pfx}Notes">Notes</label>
        <input type="text" id="${pfx}Notes"
               value="${isAdd ? '' : v(a.notes || '')}"
               ${isAdd ? 'placeholder="Optional notes"' : ''}${dis}>
      </div>
    </div>

    ${!isAdd ? `
    <div class="form-grid form-grid-4" style="margin-bottom:16px">
      <div class="field">
        <label>Current balance</label>
        <div style="padding:6px 0;font-size:13px">${_balanceCell(a)}</div>
      </div>
    </div>` : ''}

    ${isAdd ? `
    <div id="accNewSubTypeWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewSubType">Sub-type</label>
          <select id="accNewSubType"><option value="">— select —</option></select>
        </div>
      </div>
    </div>` : hasSubType ? `
    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label for="accEditSubType">Sub-type</label>
        <select id="accEditSubType"${dis}>${_subTypeOptsHtml(type, a.sub_type || '')}</select>
      </div>
    </div>` : ''}

    ${isAdd ? `
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
    </div>` : isSav ? `
    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label for="accEditIntRate">Interest rate (%)</label>
        <input type="number" id="accEditIntRate" step="0.01" min="0" value="${v(a.savings_interest_rate ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditIntFreq">Interest frequency</label>
        <select id="accEditIntFreq"${dis}>
          <option value="">— select —</option>
          <option value="monthly"   ${a.savings_interest_frequency === 'monthly'   ? 'selected' : ''}>Monthly</option>
          <option value="quarterly" ${a.savings_interest_frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
          <option value="annual"    ${a.savings_interest_frequency === 'annual'    ? 'selected' : ''}>Annual</option>
        </select>
      </div>
    </div>` : ''}

    ${isAdd ? `
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
        <div class="field">
          <label for="accNewInvCurrentVal">Current value</label>
          <input type="number" id="accNewInvCurrentVal" step="0.01" min="0" placeholder="0.00">
          <div class="field-hint">Market value today — update manually.</div>
        </div>
        <div class="field">
          <label for="accNewInvAsOfDate">Value as of</label>
          <input type="date" id="accNewInvAsOfDate">
        </div>
      </div>
    </div>` : isInv ? `
    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label for="accEditInvPlat">Platform / Broker</label>
        <input type="text" id="accEditInvPlat" value="${v(a.investment_platform || '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditInvRisk">Risk level</label>
        <select id="accEditInvRisk"${dis}>
          <option value="">— select —</option>
          <option value="low"    ${a.investment_risk_level === 'low'    ? 'selected' : ''}>Low</option>
          <option value="medium" ${a.investment_risk_level === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="high"   ${a.investment_risk_level === 'high'   ? 'selected' : ''}>High</option>
        </select>
      </div>
      <div class="field">
        <label for="accEditInvMaturity">Maturity date</label>
        <input type="date" id="accEditInvMaturity" value="${v(a.savings_maturity_date || '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditInvCurrentVal">Current value</label>
        <input type="number" id="accEditInvCurrentVal" step="0.01" min="0" value="${v(a.investment_current_value || '')}"${dis}>
        <div class="field-hint">Market value today.</div>
      </div>
      <div class="field">
        <label for="accEditInvAsOfDate">Value as of</label>
        <input type="date" id="accEditInvAsOfDate" value="${v(a.investment_as_of_date || '')}"${dis}>
      </div>
    </div>` : ''}

    ${isAdd ? `
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
    </div>` : isLoan ? `
    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label>Original loan amount</label>
        <input type="text" value="${v(sym + _fmtBal(a.loan_original_amount || 0))}" disabled>
      </div>
      <div class="field">
        <label for="accEditLoanRate">Interest rate (%)</label>
        <input type="number" id="accEditLoanRate" step="0.01" min="0" value="${v(a.loan_interest_rate ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditLoanIType">Interest type</label>
        <select id="accEditLoanIType"${dis}>
          <option value="">— select —</option>
          <option value="fixed"    ${a.loan_interest_type === 'fixed'    ? 'selected' : ''}>Fixed</option>
          <option value="variable" ${a.loan_interest_type === 'variable' ? 'selected' : ''}>Variable</option>
          <option value="tracker"  ${a.loan_interest_type === 'tracker'  ? 'selected' : ''}>Tracker</option>
        </select>
      </div>
      <div class="field">
        <label for="accEditLoanTenure">Tenure (months)</label>
        <input type="number" id="accEditLoanTenure" step="1" min="1" value="${v(a.loan_tenure_months ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditLoanEnd">End date</label>
        <input type="date" id="accEditLoanEnd" value="${v(a.loan_end_date || '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditLoanMonthly">Monthly repayment</label>
        <input type="number" id="accEditLoanMonthly" step="0.01" min="0" value="${v(a.loan_monthly_repayment ?? '')}"${dis}>
      </div>
    </div>` : ''}

    ${isAdd ? `
    <div id="accNewCollateralWrap" style="display:none;margin-bottom:16px">
      <div class="form-grid" style="align-items:start">
        <div class="field">
          <label for="accNewCollateral">Collateral description</label>
          <input type="text" id="accNewCollateral" placeholder="e.g. 123 High Street">
        </div>
      </div>
    </div>` : hasCollateral ? `
    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label for="accEditCollateral">Collateral description</label>
        <input type="text" id="accEditCollateral" value="${v(a.loan_collateral || '')}"${dis}>
      </div>
    </div>` : ''}

    ${isAdd ? `
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
    </div>` : isCC ? `
    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label for="accEditCCLimit">Credit limit</label>
        <input type="number" id="accEditCCLimit" step="0.01" min="0" value="${v(a.credit_card_limit ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditCCApr">APR (%)</label>
        <input type="number" id="accEditCCApr" step="0.01" min="0" value="${v(a.credit_card_apr ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditCCFreeDays">Interest-free days</label>
        <input type="number" id="accEditCCFreeDays" step="1" min="0" value="${v(a.credit_card_interest_free_days ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditCCBill">Billing date (day)</label>
        <input type="number" id="accEditCCBill" step="1" min="1" max="31" value="${v(a.credit_card_billing_date ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditCCDue">Due date (day)</label>
        <input type="number" id="accEditCCDue" step="1" min="1" max="31" value="${v(a.credit_card_due_date ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditCCMinPct">Min. payment (%)</label>
        <input type="number" id="accEditCCMinPct" step="0.01" min="0" value="${v(a.credit_card_minimum_payment_pct ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditCCMinFixed">Min. payment (fixed)</label>
        <input type="number" id="accEditCCMinFixed" step="0.01" min="0" value="${v(a.credit_card_minimum_payment_fixed ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditCCAnnFee">Annual fee</label>
        <input type="number" id="accEditCCAnnFee" step="0.01" min="0" value="${v(a.credit_card_annual_fee ?? '')}"${dis}>
      </div>
    </div>` : ''}

    ${isAdd ? `
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
    </div>` : isOD ? `
    <div class="form-grid" style="margin-bottom:16px;align-items:start">
      <div class="field">
        <label for="accEditODLimit">Overdraft limit</label>
        <input type="number" id="accEditODLimit" step="0.01" min="0" value="${v(a.overdraft_limit ?? '')}"${dis}>
      </div>
      <div class="field">
        <label for="accEditODArr">Arranged</label>
        <select id="accEditODArr"${dis}>
          <option value="true"  ${a.overdraft_arranged !== false ? 'selected' : ''}>Yes</option>
          <option value="false" ${a.overdraft_arranged === false ? 'selected' : ''}>No</option>
        </select>
      </div>
      <div class="field">
        <label for="accEditODApr">APR (%)</label>
        <input type="number" id="accEditODApr" step="0.01" min="0" value="${v(a.overdraft_apr ?? '')}"${dis}>
      </div>
    </div>` : ''}

    <div class="form-actions" style="margin-top:${isAdd ? '20' : '16'}px">
      ${isView
        ? `<button class="btn btn-secondary" id="accCancelView">Close</button>
           <button class="btn btn-primary" id="accViewToEdit" data-row="${a._row}">Edit</button>`
        : `<button class="btn btn-primary" id="${isAdd ? 'accSaveNew' : 'accSaveEdit'}">Save</button>
           <button class="btn btn-secondary" id="${isAdd ? 'accCancelNew' : 'accCancelEdit'}">Cancel</button>`}
    </div>
    ${!isView ? `<div class="pin-error" id="${isAdd ? 'accAddError' : 'accEditError'}"></div>` : ''}
  </div>`;
}

// ── Table ─────────────────────────────────────────────────────────────────────

function _activeBadge(a) {
  return _isActive(a)
    ? `<span class="badge badge-in">active</span>`
    : `<span class="badge badge-out">archived</span>`;
}

function _renderAccountRow(a) {
  if (state.accDeleteRow === a._row) {
    return `<tr>
      <td colspan="6"><span class="confirm-text">Delete <strong>${esc(a.name)}</strong>? Existing transactions linked to this account are not affected.</span></td>
      <td><div class="row-actions">
        <button class="btn-link danger" data-action="acc-confirm-delete" data-row="${a._row}">Yes, delete</button>
        <button class="btn-link" data-action="acc-cancel-delete">Cancel</button>
      </div></td>
    </tr>`;
  }

  return `<tr>
    <td class="td-mono" style="color:var(--muted);font-size:11px">${esc(a.id)}</td>
    <td>${esc(a.name)}${a.notes ? `<span class="info-icon-wrap"><span style="cursor:help;color:var(--teal);font-size:13px">ⓘ</span><span class="info-tooltip">${esc(a.notes)}</span></span>` : ''}</td>
    <td style="color:var(--muted);font-size:12px">${esc(_typeLabel(a.type))}</td>
    <td>${esc(a.currency)}</td>
    <td>${_balanceCell(a, true)}</td>
    <td>${_activeBadge(a)}</td>
    <td><div class="row-actions">
      <button class="btn-link muted"  data-action="acc-view"   data-row="${a._row}">View</button>
      <button class="btn-link"        data-action="acc-edit"   data-row="${a._row}">Edit</button>
      <button class="btn-link danger" data-action="acc-delete" data-row="${a._row}">Delete</button>
    </div></td>
  </tr>`;
}

function _groupHeader(label, total, sym, isLiab) {
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

function _typeGroup(type) {
  return _accountTypes().find(t => t.value === type)?.group || 'liquid';
}

function _renderTable() {
  if (!state.accounts.length) {
    return `<p class="placeholder">No accounts yet. Use &ldquo;+ Add&rdquo; to create one.</p>`;
  }

  const sym = getSymbol(state.quoteCurrency);
  const byGroup = {};
  state.accounts.forEach(a => {
    const g = _typeGroup(a.type);
    (byGroup[g] = byGroup[g] || []).push(a);
  });

  const bodyRows = TABLE_GROUPS.flatMap(g => {
    const accs = byGroup[g.key];
    if (!accs || !accs.length) return [];
    const total = g.isLiab
      ? accs.reduce((s, a) => s + Math.abs(toBase(a.current_balance, a.currency, null)), 0)
      : accs.reduce((s, a) => s + toBase(a.current_balance, a.currency, null), 0);
    return [_groupHeader(g.label, total, sym, g.isLiab), ...accs.map(_renderAccountRow)];
  }).join('');

  const hasActiveAccRow = state.accDeleteRow !== null;

  const cardSections = TABLE_GROUPS.flatMap(g => {
    const accs = byGroup[g.key];
    if (!accs || !accs.length) return [];
    return [
      `<div class="acc-card-group">${g.label}</div>`,
      ...accs.map(a => {
        if (state.accDeleteRow === a._row) return '';
        return `<div class="acc-card">
          <div class="acc-card-top">
            <div class="acc-card-name">${esc(a.name)}</div>
            <div class="acc-card-bal">${_balanceCell(a, true)}</div>
          </div>
          <div class="acc-card-meta">${esc(_typeLabel(a.type))} · ${esc(a.currency)} · ${_activeBadge(a)}</div>
          <div class="row-actions">
            <button class="btn-link muted"  data-action="acc-view"   data-row="${a._row}">View</button>
            <button class="btn-link"        data-action="acc-edit"   data-row="${a._row}">Edit</button>
            <button class="btn-link danger" data-action="acc-delete" data-row="${a._row}">Delete</button>
          </div>
        </div>`;
      })
    ];
  }).join('');

  return `
    <div class="table-wrap acc-table-wrap${hasActiveAccRow ? ' acc-has-active' : ''}">
      <table class="acc-table">
        <thead><tr>
          <th style="width:90px">ID</th>
          <th style="width:160px">Name</th>
          <th style="width:140px">Type</th>
          <th style="width:70px">CCY</th>
          <th style="width:160px">Balance</th>
          <th style="width:80px">Status</th>
          <th style="width:100px">Actions</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="acc-cards">${cardSections}</div>`;
}

// ── Type-conditional visibility (Add form only) ───────────────────────────────

function _refreshAddTypeUI() {
  const type = el('accNewType')?.value || '';
  const show = id => { const e = el(id); if (e) e.style.display = ''; };
  const hide = id => { const e = el(id); if (e) e.style.display = 'none'; };

  const hasSubType = type === 'investment' || type === 'mortgage';
  hasSubType ? show('accNewSubTypeWrap') : hide('accNewSubTypeWrap');
  if (hasSubType) {
    const sel = el('accNewSubType');
    if (sel) sel.innerHTML = _subTypeOptsHtml(type, '');
  }
  type === 'current' || type === 'savings' ? show('accNewSavingsWrap')     : hide('accNewSavingsWrap');
  type === 'investment'                    ? show('accNewInvestmentWrap')   : hide('accNewInvestmentWrap');
  _loanSet().has(type)                     ? show('accNewLoanWrap')         : hide('accNewLoanWrap');
  type === 'mortgage' || type === 'auto_loan' ? show('accNewCollateralWrap') : hide('accNewCollateralWrap');
  type === 'credit_card'                   ? show('accNewCreditCardWrap')   : hide('accNewCreditCardWrap');
  type === 'overdraft'                     ? show('accNewOverdraftWrap')    : hide('accNewOverdraftWrap');
}

// ── Events ────────────────────────────────────────────────────────────────────

function _attachEvents() {
  el('accAddBtn')?.addEventListener('click', () => {
    if (state.accAddOpen || state.accViewRow !== null || state.accEditRow !== null) {
      state.accAddOpen = false;
      state.accViewRow = null;
      state.accEditRow = null;
    } else {
      state.accAddOpen = true;
    }
    renderAccounts();
  });

  el('accSaveNew')?.addEventListener('click', _saveNew);
  el('accCancelNew')?.addEventListener('click', () => { state.accAddOpen = false; renderAccounts(); });
  if (el('accNewType')) {
    el('accNewType').addEventListener('change', _refreshAddTypeUI);
    _refreshAddTypeUI();
  }

  el('accSaveEdit')?.addEventListener('click', _saveEdit);
  el('accCancelEdit')?.addEventListener('click', () => { state.accEditRow = null; renderAccounts(); });

  el('accCancelView')?.addEventListener('click', () => { state.accViewRow = null; renderAccounts(); });
  el('accViewToEdit')?.addEventListener('click', e => {
    const row = Number(e.currentTarget.dataset.row);
    state.accViewRow = null;
    state.accEditRow = row;
    renderAccounts();
  });

  const handleAccAction = e => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row ? Number(btn.dataset.row) : null;
    if (action === 'acc-view')           { state.accViewRow = row; state.accEditRow = null; state.accDeleteRow = null; state.accAddOpen = false; renderAccounts(); return; }
    if (action === 'acc-edit')           { state.accEditRow = row; state.accViewRow = null; state.accDeleteRow = null; state.accAddOpen = false; renderAccounts(); return; }
    if (action === 'acc-delete')         { state.accDeleteRow = row; state.accViewRow = null; state.accEditRow = null; renderAccounts(); }
    if (action === 'acc-cancel-delete')  { state.accDeleteRow = null; renderAccounts(); }
    if (action === 'acc-confirm-delete') { _confirmDelete(row); }
  };
  el('accountsContent')?.querySelector('.acc-table-wrap')?.addEventListener('click', handleAccAction);
  el('accountsContent')?.querySelector('.acc-cards')?.addEventListener('click', handleAccAction);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _v(id)  { return el(id)?.value ?? ''; }
function _n(id)  { const v = _v(id); return v === '' ? undefined : parseFloat(v); }
function _ni(id) { const v = _v(id); return v === '' ? undefined : parseInt(v, 10); }

// ── Save new ──────────────────────────────────────────────────────────────────

async function _saveNew() {
  const name     = _v('accNewName').trim();
  const currency = _v('accNewCurrency');
  const type     = _v('accNewType');
  const notes    = _v('accNewNotes').trim();
  const errEl    = el('accAddError');

  if (!name)                                              { if (errEl) errEl.textContent = 'Name is required.';     return; }
  if (!type || !_validTypes().has(type))                  { if (errEl) errEl.textContent = 'Type is required.';     return; }
  if (!currency || !(currency in (state.rateMap || {})))  { if (errEl) errEl.textContent = 'Currency is required.'; return; }
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
    const cv   = _n('accNewInvCurrentVal');      if (cv  !== undefined) payload.investment_current_value = cv;
    const aod  = _v('accNewInvAsOfDate');        if (aod) payload.investment_as_of_date = aod;
  }
  if (_loanSet().has(type)) {
    const orig = _n('accNewLoanOriginal');
    if (!orig) { if (errEl) errEl.textContent = 'Original loan amount is required.'; return; }
    payload.loan_original_amount = orig;
    const rate  = _n('accNewLoanRate');         if (rate  !== undefined) payload.loan_interest_rate        = rate;
    const itype = _v('accNewLoanInterestType'); if (itype)               payload.loan_interest_type        = itype;
    const ten   = _ni('accNewLoanTenure');      if (ten   !== undefined) payload.loan_tenure_months        = ten;
    const start = _v('accNewLoanStart');        if (start)               payload.loan_start_date           = start;
    const end   = _v('accNewLoanEnd');          if (end)                 payload.loan_end_date             = end;
    const first = _v('accNewLoanFirstRepay');   if (first)               payload.loan_first_repayment_date = first;
    const mon   = _n('accNewLoanMonthly');      if (mon   !== undefined) payload.loan_monthly_repayment    = mon;
    if (type === 'mortgage') { const sub = _v('accNewSubType'); if (sub) payload.sub_type = sub; }
  }
  if (type === 'mortgage' || type === 'auto_loan') {
    const coll = _v('accNewCollateral').trim(); if (coll) payload.loan_collateral = coll;
  }
  if (type === 'credit_card') {
    const lim = _n('accNewCCLimit');        if (lim !== undefined) payload.credit_card_limit                 = lim;
    const apr = _n('accNewCCApr');          if (apr !== undefined) payload.credit_card_apr                   = apr;
    const fd  = _ni('accNewCCFreeDays');    if (fd  !== undefined) payload.credit_card_interest_free_days    = fd;
    const bd  = _ni('accNewCCBillingDate'); if (bd  !== undefined) payload.credit_card_billing_date          = bd;
    const dd  = _ni('accNewCCDueDate');     if (dd  !== undefined) payload.credit_card_due_date              = dd;
    const mp  = _n('accNewCCMinPct');       if (mp  !== undefined) payload.credit_card_minimum_payment_pct   = mp;
    const mf  = _n('accNewCCMinFixed');     if (mf  !== undefined) payload.credit_card_minimum_payment_fixed = mf;
    const af  = _n('accNewCCAnnualFee');    if (af  !== undefined) payload.credit_card_annual_fee            = af;
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
      await _refreshAccounts();
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

// ── Save edit ─────────────────────────────────────────────────────────────────

async function _saveEdit() {
  const rowNum = state.accEditRow;
  if (!rowNum) return;

  const name  = el('accEditName')?.value.trim();
  const errEl = el('accEditError');
  if (!name) { if (errEl) errEl.textContent = 'Name is required.'; return; }
  if (errEl) errEl.textContent = '';

  const acc  = state.accounts.find(a => a._row === rowNum);
  const type = acc?.type || '';

  const payload = {
    row_num:              rowNum,
    name,
    is_active:            el('accEditIsActive')?.value === 'true',
    institution:          el('accEditInst')?.value.trim()   || '',
    account_number_last4: el('accEditAccNum')?.value.trim() || '',
    notes:                el('accEditNotes')?.value.trim()  || '',
  };

  if (type === 'current' || type === 'savings') {
    const rate = _n('accEditIntRate'); if (rate !== undefined) payload.savings_interest_rate = rate;
    const freq = _v('accEditIntFreq'); if (freq) payload.savings_interest_frequency = freq;
  }
  if (type === 'investment') {
    const plat = el('accEditInvPlat')?.value.trim(); payload.investment_platform = plat || '';
    const risk = _v('accEditInvRisk');               if (risk) payload.investment_risk_level    = risk;
    const mat  = _v('accEditInvMaturity');           if (mat)  payload.savings_maturity_date    = mat;
    const sub  = _v('accEditSubType');               if (sub)  payload.sub_type                 = sub;
    const cv   = _n('accEditInvCurrentVal');         if (cv  !== undefined) payload.investment_current_value = cv;
    const aod  = _v('accEditInvAsOfDate');           if (aod) payload.investment_as_of_date     = aod;
  }
  if (_loanSet().has(type)) {
    const rate  = _n('accEditLoanRate');    if (rate  !== undefined) payload.loan_interest_rate    = rate;
    const itype = _v('accEditLoanIType');   if (itype)               payload.loan_interest_type    = itype;
    const ten   = _ni('accEditLoanTenure'); if (ten   !== undefined) payload.loan_tenure_months    = ten;
    const end   = _v('accEditLoanEnd');     if (end)                 payload.loan_end_date         = end;
    const mon   = _n('accEditLoanMonthly'); if (mon   !== undefined) payload.loan_monthly_repayment = mon;
    if (type === 'mortgage') { const sub = _v('accEditSubType'); if (sub) payload.sub_type = sub; }
  }
  if (type === 'mortgage' || type === 'auto_loan') {
    const coll = el('accEditCollateral')?.value.trim(); if (coll !== undefined) payload.loan_collateral = coll;
  }
  if (type === 'credit_card') {
    const lim = _n('accEditCCLimit');    if (lim !== undefined) payload.credit_card_limit                 = lim;
    const apr = _n('accEditCCApr');      if (apr !== undefined) payload.credit_card_apr                   = apr;
    const fd  = _ni('accEditCCFreeDays');if (fd  !== undefined) payload.credit_card_interest_free_days    = fd;
    const bd  = _ni('accEditCCBill');    if (bd  !== undefined) payload.credit_card_billing_date          = bd;
    const dd  = _ni('accEditCCDue');     if (dd  !== undefined) payload.credit_card_due_date              = dd;
    const mp  = _n('accEditCCMinPct');   if (mp  !== undefined) payload.credit_card_minimum_payment_pct   = mp;
    const mf  = _n('accEditCCMinFixed'); if (mf  !== undefined) payload.credit_card_minimum_payment_fixed = mf;
    const af  = _n('accEditCCAnnFee');   if (af  !== undefined) payload.credit_card_annual_fee            = af;
  }
  if (type === 'overdraft') {
    const lim = _n('accEditODLimit'); if (lim !== undefined) payload.overdraft_limit    = lim;
    const arr = _v('accEditODArr');                           payload.overdraft_arranged = arr !== 'false';
    const apr = _n('accEditODApr');   if (apr !== undefined) payload.overdraft_apr       = apr;
  }

  const btn = el('accSaveEdit');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  showLoading();
  try {
    const res = await ExpenseAPI.updateAccount(payload);
    if (res.ok) {
      showMsg('Account updated.');
      state.accEditRow = null;
      await _refreshAccounts();
      renderAccounts();
      renderDashboard();
    } else {
      if (errEl) errEl.textContent = 'Update failed: ' + (res.error || 'unknown');
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  } finally {
    hideLoading();
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function _confirmDelete(rowNum) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteAccount({ row_num: rowNum });
    if (res.ok) {
      showMsg('Account deleted.');
      state.accDeleteRow = null;
      await _refreshAccounts();
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

async function _refreshAccounts() {
  const r = await ExpenseAPI.listAccounts();
  if (r.ok) {
    state.accounts   = r.data || [];
    state.accountMap = Object.fromEntries(state.accounts.map(a => [a.id, a]));
  }
}
