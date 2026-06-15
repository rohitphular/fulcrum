export const DebtAPI = {
  verify:        totp    => SheetsClient.get({ action: 'verify', totp }),
  listDebts:     ()      => SheetsClient.get({ action: 'list_debts' }),
  listPayments:  debtId  => SheetsClient.get({ action: 'list_payments', ...(debtId ? { debt_id: debtId } : {}) }),
  listRates:     ()      => SheetsClient.get({ action: 'list_rates' }),
  createDebt:    f       => SheetsClient.post({ action: 'create_debt',    ...f }),
  updateDebt:    (id, f) => SheetsClient.post({ action: 'update_debt',    id, ...f }),
  deleteDebt:    id      => SheetsClient.post({ action: 'delete_debt',    id }),
  createPayment: f       => SheetsClient.post({ action: 'create_payment', ...f }),
  deletePayment: id      => SheetsClient.post({ action: 'delete_payment', id }),
  upsertRate:    f       => SheetsClient.post({ action: 'upsert_rate',    ...f }),
};
