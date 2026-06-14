/* =============================================================================
   FULCRUM FORGE — SheetsClient
   Shared HTTP layer for all forge modules. Handles all communication with the
   Google Apps Script Web App. Module-specific code never calls fetch() directly.

   Usage:
     SheetsClient.init({ scriptUrl: '...', pin: '...' });
     const res = await SheetsClient.list();     // { ok, data }
     const res = await SheetsClient.create({}); // { ok, error? }
     const res = await SheetsClient.update(id, {}); // { ok, error? }
     const res = await SheetsClient.remove(id);     // { ok, error? }
============================================================================= */

const SheetsClient = (() => {
  let _url = null;
  let _pin = null;

  function init({ scriptUrl, pin }) {
    _url = scriptUrl;
    _pin = pin;
  }

  async function _get(params) {
    const qs = new URLSearchParams({ ...params, pin: _pin }).toString();
    const res = await fetch(`${_url}?${qs}`);
    return res.json();
  }

  async function _post(body) {
    // Content-Type: text/plain avoids CORS preflight (Apps Script limitation).
    // Apps Script reads the raw body via e.postData.contents and parses it as JSON.
    const res = await fetch(_url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ ...body, pin: _pin })
    });
    return res.json();
  }

  return {
    init,
    list:   ()          => _get({ action: 'list' }),
    create: (fields)    => _post({ action: 'create', ...fields }),
    update: (id, fields)=> _post({ action: 'update', id, ...fields }),
    remove: (id)        => _post({ action: 'delete', id })
  };
})();
