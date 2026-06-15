import { el } from './utils.js';

const SECTIONS = ['dashboard', 'debts', 'payments', 'rates', 'projector'];

export function showSection(id) {
  if (!SECTIONS.includes(id)) id = 'dashboard';
  SECTIONS.forEach(s => el(s).classList.toggle('hidden', s !== id));
  el('tabNav').querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.section === id)
  );
  sessionStorage.setItem('dt_section', id);
}
