import { el } from './utils.js';
import { DebtAPI } from './api.js';

export function showPinGate() {
  el('pinOverlay').classList.remove('hidden');
  el('pinInput').focus();
}

export function hidePinGate() { el('pinOverlay').classList.add('hidden'); }

export function pinError(msg) {
  el('pinError').textContent = msg;
  const inp = el('pinInput');
  inp.classList.add('shake');
  inp.addEventListener('animationend', () => inp.classList.remove('shake'), { once: true });
}

async function fetchGeo() {
  try {
    const data = await fetch('https://ipapi.co/json/').then(r => r.json());
    return { ip: data.ip || 'unknown', city: data.city || '', country: data.country_name || '', ua: navigator.userAgent };
  } catch (_) {
    return { ip: 'unknown', city: '', country: '', ua: navigator.userAgent };
  }
}

export async function submitPin() {
  const pin  = el('pinInput').value.trim();
  const totp = el('totpInput').value.trim();

  if (!pin)                   { pinError('Enter your PIN.');                el('pinInput').focus();  return; }
  if (!totp)                  { pinError('Enter your authenticator code.'); el('totpInput').focus(); return; }
  if (!/^\d{6}$/.test(totp)) { pinError('Code must be 6 digits.');         el('totpInput').focus(); return; }

  el('pinSubmit').disabled = true;
  el('pinError').textContent = 'Connecting…';

  const meta = await fetchGeo();
  SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin, meta });

  try {
    const res = await DebtAPI.verify(totp);
    if (res.ok) {
      sessionStorage.setItem('dt_pin', pin);
      hidePinGate();
      document.dispatchEvent(new CustomEvent('dt:reload'));
    } else if (res.error === 'locked') {
      pinError('Access locked. Contact admin to unlock.');
    } else if (res.error === 'totp_invalid') {
      pinError('Wrong authenticator code. Try again.');
      el('totpInput').value = '';
      el('totpInput').focus();
      el('pinSubmit').disabled = false;
    } else {
      pinError('Wrong PIN. Try again.');
      el('pinInput').focus();
      el('pinSubmit').disabled = false;
    }
  } catch (_) {
    pinError('Connection failed. Check the Script URL in config.js.');
    el('pinSubmit').disabled = false;
  }
}
