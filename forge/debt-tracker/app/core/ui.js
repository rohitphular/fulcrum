import { el } from './utils.js';

export function showLoading() { el('loadingBar').classList.remove('hidden'); }
export function hideLoading() { el('loadingBar').classList.add('hidden'); }

export function showMsg(text, type = 'success') {
  const b = el('msgBanner');
  el('msgText').innerHTML = text;
  el('msgIco').textContent = type === 'warn' ? '!' : '›';
  b.className = `banner ${type === 'warn' ? 'warn' : 'success'}`;
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(() => b.classList.add('hidden'), 4500);
}
