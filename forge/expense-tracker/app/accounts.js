import { state } from './state.js';
import { el, esc } from './utils.js';

export function renderAccounts() {
  const el2 = el('accountsContent');
  if (!state.accounts.length) {
    el2.innerHTML = `<div class="empty-state"><strong>No accounts yet</strong>Add rows to the <code>accounts</code> tab in your Google Sheet, then reload.</div>`;
    return;
  }
  el2.innerHTML = `
    <div class="sec-head"><div class="sec-head-left"><h2>Accounts</h2></div></div>
    <div class="accounts-list">
      ${state.accounts.map(a => `
        <div class="account-item">
          <div>
            <div class="account-name">${esc(a.name)}</div>
            <div class="account-meta">${esc(a.currency)}${a.notes ? ' · ' + esc(a.notes) : ''}</div>
          </div>
          <span class="account-type">${esc(a.type || 'other')}</span>
        </div>`).join('')}
    </div>`;
}
