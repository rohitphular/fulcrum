import { state } from '../core/state.js';
import { el, esc, fmtDate } from '../core/utils.js';
import { showMsg } from '../core/ui.js';
import { StarterAPI } from '../core/api.js';

// ── Form ──────────────────────────────────────────────────────────────────────

export function resetForm() {
  state.editingId = null;
  el('itemForm').reset();
  el('formTitle').textContent = 'Add Item';
  el('submitBtn').textContent = 'Add Item';
  el('cancelEditBtn').classList.add('hidden');
  el('fieldNameWrap').classList.remove('error');
}

export function startEdit(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  state.editingId = id;
  el('fieldName').value        = item.name        || '';
  el('fieldDescription').value = item.description || '';
  el('fieldStatus').value      = item.status      || 'active';
  el('formTitle').textContent  = 'Edit Item';
  el('submitBtn').textContent  = 'Update Item';
  el('cancelEditBtn').classList.remove('hidden');
  el('fieldNameWrap').classList.remove('error');
  el('fieldName').focus();
  el('fieldName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function handleSubmit(e) {
  e.preventDefault();

  const name        = el('fieldName').value.trim();
  const description = el('fieldDescription').value.trim();
  const status      = el('fieldStatus').value;

  if (!name) { el('fieldNameWrap').classList.add('error'); el('fieldName').focus(); return; }
  el('fieldNameWrap').classList.remove('error');

  el('submitBtn').disabled = true;
  el('formSpinner').classList.remove('hidden');

  try {
    const res = state.editingId
      ? await StarterAPI.update(state.editingId, { name, description, status })
      : await StarterAPI.create({ name, description, status });

    if (res.ok) {
      showMsg(state.editingId ? 'Item updated.' : 'Item added.');
      resetForm();
      document.dispatchEvent(new CustomEvent('sm:reload'));
    } else {
      showMsg('Save failed: ' + (res.error || 'unknown error'), 'warn');
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
  } finally {
    el('submitBtn').disabled = false;
    el('formSpinner').classList.add('hidden');
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function startDelete(id) { state.deletingId = id; renderItems(); }
export function cancelDelete()  { state.deletingId = null; renderItems(); }

export async function confirmDelete() {
  const id = state.deletingId;
  state.deletingId = null;
  const btn = document.querySelector('[data-action="confirm-delete"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    const res = await StarterAPI.remove(id);
    if (res.ok) {
      showMsg('Item deleted.');
      document.dispatchEvent(new CustomEvent('sm:reload'));
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown error'), 'warn');
      renderItems();
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    renderItems();
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderItems() {
  const tbody = el('tableBody');

  if (!state.items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No items yet — add one above.</td></tr>';
    return;
  }

  tbody.innerHTML = state.items.map(item => {
    const badge = `<span class="badge badge-${esc(item.status)}">${esc(item.status)}</span>`;
    const desc  = item.description ? esc(item.description) : '<span style="color:var(--muted)">—</span>';

    if (state.deletingId === item.id) {
      return `<tr>
        <td class="td-name">${esc(item.name)}</td>
        <td colspan="3"><span class="confirm-text">Delete &ldquo;<strong>${esc(item.name)}</strong>&rdquo;?</span></td>
        <td><div class="row-actions">
          <button class="btn-link danger" data-action="confirm-delete">Yes, delete</button>
          <button class="btn-link" data-action="cancel-delete">Cancel</button>
        </div></td>
      </tr>`;
    }

    return `<tr>
      <td class="td-name">${esc(item.name)}</td>
      <td class="td-desc">${desc}</td>
      <td>${badge}</td>
      <td class="td-mono">${fmtDate(item.created_at)}</td>
      <td><div class="row-actions">
        <button class="btn-link" data-action="edit" data-id="${esc(item.id)}">Edit</button>
        <button class="btn-link danger" data-action="delete" data-id="${esc(item.id)}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}
