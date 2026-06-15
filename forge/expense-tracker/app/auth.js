/* global SheetsClient */
import { el } from './utils.js';
import { showLoading, hideLoading } from './ui.js';
import { ExpenseAPI } from './api.js';

export function showPinGate() {
  el('pinOverlay').classList.remove('hidden');
  el('appShell').classList.add('hidden');
  el('pinInput').focus();
}

export function hidePinGate() {
  el('pinOverlay').classList.add('hidden');
  el('appShell').classList.remove('hidden');
}

function pinError(msg) {
  el('pinError').textContent = msg;
  const inp = el('pinInput');
  inp.classList.add('shake');
  inp.addEventListener('animationend', () => inp.classList.remove('shake'), { once: true });
}

export async function fetchGeo() {
  try {
    const d = await fetch('https://ipapi.co/json/').then(r => r.json());
    return { ip: d.ip || 'unknown', city: d.city || '', country: d.country_name || '', ua: navigator.userAgent };
  } catch (_) {
    return { ip: 'unknown', city: '', country: '', ua: navigator.userAgent };
  }
}

export async function submitPin() {
  const pin  = el('pinInput').value.trim();
  const totp = el('totpInput').value.trim();

  if (!pin)                    { pinError('Enter your PIN.');                el('pinInput').focus();  return; }
  if (!totp)                   { pinError('Enter your authenticator code.'); el('totpInput').focus(); return; }
  if (!/^\d{6}$/.test(totp))  { pinError('Code must be 6 digits.');         el('totpInput').focus(); return; }

  el('pinSubmit').disabled = true;
  el('pinError').textContent = 'Connecting…';

  const meta = await fetchGeo();
  SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin, meta });

  try {
    const res = await ExpenseAPI.verify(totp);
    if (res.ok) {
      sessionStorage.setItem('et_pin', pin);
      hidePinGate();
      document.dispatchEvent(new CustomEvent('et:reload'));
    } else if (res.error === 'locked') {
      pinError('Access locked. Contact admin to unlock.');
      el('pinSubmit').disabled = false;
    } else if (res.error === 'totp_invalid') {
      pinError('Wrong authenticator code. Try again.');
      el('totpInput').value = '';
      el('totpInput').focus();
      el('pinSubmit').disabled = false;
    } else {
      pinError('Wrong PIN. Try again.');
      el('pinInput').value = '';
      el('pinInput').focus();
      el('pinSubmit').disabled = false;
    }
  } catch (_) {
    pinError('Connection failed. Check the Script URL in config.js.');
    el('pinSubmit').disabled = false;
  }
}
