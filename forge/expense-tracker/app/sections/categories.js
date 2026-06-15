import { state } from '../core/state.js';
import { el, esc } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { ExpenseAPI } from '../core/api.js';

export function renderCategories() {
  const el2 = el('categoriesContent');

  const filtered = state.catFilter === 'all'
    ? state.categories
    : state.categories.filter(c => c.transaction_type === state.catFilter);

  el2.innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Categories</h2></div>
      <button class="btn btn-primary btn-sm" id="catAddBtn">${state.catAddOpen ? '× Close' : '+ Add category'}</button>
    </div>
    ${state.catAddOpen ? renderCatAddForm() : ''}
    <div class="cat-filter" id="catTypeFilter">
      ${['all','money-in','money-out','money-transfer'].map(t =>
        `<button class="range-btn ${state.catFilter === t ? 'active' : ''}" data-cat-filter="${esc(t)}">${t === 'all' ? 'All' : t}</button>`
      ).join('')}
      <span class="cat-count">${filtered.length} ${filtered.length === 1 ? 'category' : 'categories'}</span>
    </div>
    ${renderCatTable(filtered)}
  `;

  attachCatEvents();
}

function renderCatAddForm() {
  return `
  <div class="card" style="margin-bottom:20px">
    <div class="form-grid">
      <div class="field">
        <label for="catNewType">Type *</label>
        <select id="catNewType">
          ${['money-in','money-out','money-transfer'].map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="catNewMajor">Major category *</label>
        <input type="text" id="catNewMajor" placeholder="e.g. Food">
      </div>
      <div class="field">
        <label for="catNewMinor">Minor category *</label>
        <input type="text" id="catNewMinor" placeholder="e.g. Groceries">
      </div>
      <div class="field form-grid-full">
        <label for="catNewKeywords">Keywords</label>
        <input type="text" id="catNewKeywords" placeholder="tesco, sainsbury, waitrose, lidl">
        <div class="field-hint">Comma-separated. Used to find the right category when adding transactions.</div>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="catSaveNew">Save category</button>
      <button class="btn btn-secondary" id="catCancelNew">Cancel</button>
    </div>
    <div class="pin-error" id="catAddError"></div>
  </div>`;
}

function renderCatTable(cats) {
  if (!cats.length) {
    return `<p class="placeholder">No categories for this type. Use &ldquo;+ Add category&rdquo; to create one.</p>`;
  }

  const rows = cats.map(cat => {
    if (state.catDeleteRow === cat._row) {
      return `<tr>
        <td>${catTypeBadge(cat.transaction_type)}</td>
        <td colspan="3"><span class="confirm-text">Delete <strong>${esc(cat.major_category)} → ${esc(cat.minor_category)}</strong>?</span></td>
        <td><div class="row-actions">
          <button class="btn-link danger" data-action="cat-confirm-delete" data-row="${cat._row}">Yes, delete</button>
          <button class="btn-link" data-action="cat-cancel-delete">Cancel</button>
        </div></td>
      </tr>`;
    }

    if (state.catEditRow === cat._row) return renderCatEditRow(cat);

    const kwHtml = cat.tag_keywords
      ? `<span class="cat-keywords">${esc(String(cat.tag_keywords))}</span>`
      : `<span style="color:var(--muted)">—</span>`;

    return `<tr>
      <td>${catTypeBadge(cat.transaction_type)}</td>
      <td class="td-name">${esc(cat.major_category)}</td>
      <td>${esc(cat.minor_category)}</td>
      <td class="td-keywords">${kwHtml}</td>
      <td><div class="row-actions">
        <button class="btn-link" data-action="cat-edit" data-row="${cat._row}">Edit</button>
        <button class="btn-link danger" data-action="cat-delete" data-row="${cat._row}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:80px">Type</th>
          <th>Major</th>
          <th>Minor</th>
          <th>Keywords</th>
          <th style="width:110px">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderCatEditRow(cat) {
  const r = cat._row;
  return `<tr>
    <td>
      <select class="cat-edit-select" id="catEditType-${r}">
        ${['money-in','money-out','money-transfer'].map(t =>
          `<option value="${esc(t)}" ${cat.transaction_type === t ? 'selected' : ''}>${esc(t)}</option>`
        ).join('')}
      </select>
    </td>
    <td><input class="rate-edit-input" id="catEditMajor-${r}" value="${esc(cat.major_category)}" placeholder="Major"></td>
    <td><input class="rate-edit-input" id="catEditMinor-${r}" value="${esc(cat.minor_category)}" placeholder="Minor"></td>
    <td><input class="rate-edit-input" style="width:100%;min-width:160px" id="catEditKeywords-${r}" value="${esc(String(cat.tag_keywords || ''))}" placeholder="tesco, sainsbury, …"></td>
    <td><div class="row-actions">
      <button class="btn-link" data-action="cat-save-edit" data-row="${r}">Save</button>
      <button class="btn-link" data-action="cat-cancel-edit">Cancel</button>
    </div></td>
  </tr>`;
}

function catTypeBadge(type) {
  const cls   = type === 'money-in' ? 'badge-in' : type === 'money-out' ? 'badge-out' : 'badge-transfer';
  const label = type === 'money-in' ? 'in'       : type === 'money-out' ? 'out'       : 'xfer';
  return `<span class="badge ${cls}">${label}</span>`;
}

function attachCatEvents() {
  el('catAddBtn')?.addEventListener('click', () => { state.catAddOpen = !state.catAddOpen; renderCategories(); });

  el('catSaveNew')?.addEventListener('click', saveNewCategory);
  el('catCancelNew')?.addEventListener('click', () => { state.catAddOpen = false; renderCategories(); });

  el('catTypeFilter')?.querySelectorAll('[data-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.catFilter    = btn.dataset.catFilter;
      state.catEditRow   = null;
      state.catDeleteRow = null;
      renderCategories();
    });
  });

  el('categoriesContent')?.querySelector('.table-wrap')?.addEventListener('click', e => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row ? Number(btn.dataset.row) : null;

    if (action === 'cat-edit')           { state.catEditRow = row; state.catDeleteRow = null; renderCategories(); }
    if (action === 'cat-cancel-edit')    { state.catEditRow = null; renderCategories(); }
    if (action === 'cat-save-edit')      { saveCatEdit(row); }
    if (action === 'cat-delete')         { state.catDeleteRow = row; state.catEditRow = null; renderCategories(); }
    if (action === 'cat-cancel-delete')  { state.catDeleteRow = null; renderCategories(); }
    if (action === 'cat-confirm-delete') { deleteCat(row); }
  });
}

async function saveNewCategory() {
  const transaction_type = el('catNewType')?.value;
  const major_category   = el('catNewMajor')?.value.trim();
  const minor_category   = el('catNewMinor')?.value.trim();
  const tag_keywords     = el('catNewKeywords')?.value.trim();
  const errEl            = el('catAddError');

  if (!major_category) { if (errEl) errEl.textContent = 'Major category is required.'; return; }
  if (!minor_category) { if (errEl) errEl.textContent = 'Minor category is required.'; return; }
  if (errEl) errEl.textContent = '';

  const btn = el('catSaveNew');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  showLoading();
  try {
    const res = await ExpenseAPI.createCategory({ transaction_type, major_category, minor_category, tag_keywords });
    if (res.ok) {
      showMsg('Category added.');
      state.catAddOpen = false;
      const catRes = await ExpenseAPI.listCategories();
      if (catRes.ok) state.categories = catRes.data || [];
      renderCategories();
    } else {
      if (errEl) errEl.textContent = 'Error: ' + (res.error || 'unknown');
      if (btn) { btn.disabled = false; btn.textContent = 'Save category'; }
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
    if (btn) { btn.disabled = false; btn.textContent = 'Save category'; }
  } finally {
    hideLoading();
  }
}

async function saveCatEdit(rowNum) {
  const transaction_type = el(`catEditType-${rowNum}`)?.value;
  const major_category   = el(`catEditMajor-${rowNum}`)?.value.trim();
  const minor_category   = el(`catEditMinor-${rowNum}`)?.value.trim();
  const tag_keywords     = el(`catEditKeywords-${rowNum}`)?.value.trim();

  if (!major_category || !minor_category) {
    showMsg('Major and minor category are required.', 'warn'); return;
  }

  showLoading();
  try {
    const res = await ExpenseAPI.updateCategory({ row_num: rowNum, transaction_type, major_category, minor_category, tag_keywords });
    if (res.ok) {
      showMsg('Category updated.');
      state.catEditRow = null;
      const catRes = await ExpenseAPI.listCategories();
      if (catRes.ok) state.categories = catRes.data || [];
      renderCategories();
    } else {
      showMsg('Update failed: ' + (res.error || 'unknown'), 'warn');
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
  } finally {
    hideLoading();
  }
}

async function deleteCat(rowNum) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteCategory({ row_num: rowNum });
    if (res.ok) {
      showMsg('Category deleted.');
      state.catDeleteRow = null;
      const catRes = await ExpenseAPI.listCategories();
      if (catRes.ok) state.categories = catRes.data || [];
      renderCategories();
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      state.catDeleteRow = null;
      renderCategories();
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
    state.catDeleteRow = null;
    renderCategories();
  } finally {
    hideLoading();
  }
}
