export const CURRENCY_SYMBOLS = { GBP: '£', INR: '₹', USD: '$', EUR: '€', AED: 'AED ' };

export const state = {
  debts:         [],
  payments:      [],
  rates:         [],
  rateMap:       {},
  quoteCurrency: 'GBP',
  chart:         null,
};

export function setQuoteCurrency(ccy) {
  state.quoteCurrency = ccy;
  localStorage.setItem('dt_quote_currency', ccy);
  const sel = document.getElementById('quoteCurrencySelect');
  if (sel) sel.value = ccy;
  const rp = document.getElementById('ratesQuotePicker');
  if (rp) rp.value = ccy;
  document.dispatchEvent(new CustomEvent('dt:render-all'));
}
