export function showLoading() { document.getElementById('loadingBar').classList.remove('hidden'); }
export function hideLoading() { document.getElementById('loadingBar').classList.add('hidden');    }

export function showMsg(text, type = 'success') {
  const b = document.getElementById('msgBanner');
  document.getElementById('msgText').innerHTML = text;
  document.getElementById('msgIco').textContent = type === 'warn' ? '!' : '›';
  b.className = `banner ${type === 'warn' ? 'warn' : 'success'}`;
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(() => b.classList.add('hidden'), 4500);
}
