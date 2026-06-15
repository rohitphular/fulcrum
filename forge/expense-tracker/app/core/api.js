/* global SheetsClient */
export const ExpenseAPI = {
  verify:            totp => SheetsClient.get({ action: 'verify', totp }),
  listTransactions:  ()   => SheetsClient.get({ action: 'list_transactions' }),
  listCategories:    ()   => SheetsClient.get({ action: 'list_categories' }),
  listAccounts:      ()   => SheetsClient.get({ action: 'list_accounts' }),
  listRates:         ()   => SheetsClient.get({ action: 'list_rates' }),
  createTransaction: f    => SheetsClient.post({ action: 'create_transaction', ...f }),
  updateTransaction: f    => SheetsClient.post({ action: 'update_transaction', ...f }),
  upsertRate:        f    => SheetsClient.post({ action: 'upsert_rate', ...f }),
  createCategory:    f    => SheetsClient.post({ action: 'create_category', ...f }),
  updateCategory:    f    => SheetsClient.post({ action: 'update_category', ...f }),
  deleteCategory:    f    => SheetsClient.post({ action: 'delete_category', ...f }),
};
