// Committed file. Picks the backend /exec URL based on where the page is loaded.
// Local file:// or localhost → dev. Hosted (GitHub Pages) → prod.
// Fill in PROD_SCRIPT_URL when you set up the prod GAS deployment.
window.CONFIG = (() => {
  const isHosted = location.hostname.endsWith('.github.io');
  const DEV_SCRIPT_URL  = 'https://script.google.com/macros/s/AKfycbykwDFrvKj5vnScj16Y1cb9FA5TkS5I0yss1RrX6ps8N04seU1Tlhi5s_V8ZuNzgvlK/exec';
  const PROD_SCRIPT_URL = 'TODO';
  return {
    SCRIPT_URL: isHosted ? PROD_SCRIPT_URL : DEV_SCRIPT_URL,
  };
})();
