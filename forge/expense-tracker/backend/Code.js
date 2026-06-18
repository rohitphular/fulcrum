// =============================================================================
// FULCRUM FORGE — Expense Tracker backend
//
// This file is intentionally empty. The backend is split across:
//
//   Config.gs       — sheet names, column definitions, constants
//   Utils.gs        — getOrCreateSheet, sheetToObjects*, json, checkPin, normaliseTags
//   Router.gs       — doGet / doPost entry points
//   Transactions.gs — listTransactions, createTransaction, updateTransaction, deleteTransaction
//   Accounts.gs     — listAccounts, createAccount, updateAccount, deleteAccount
//   Categories.gs   — listCategories, createCategory, updateCategory, deleteCategory, onEdit
//   Rates.gs        — listRates, upsertRate
//   Auth.gs         — verifyTotp, checkLocked, recordAccess (TOTP + IP audit)
//   CategorySeed.gs — CATEGORY_SEED constant (seed data for categories sheet)
//
// All files share a single GAS global scope — no imports required.
// Deploy as: Execute as Me · Anyone can access
//
// Script Properties required (Extensions → Apps Script → Project Settings):
//   PIN_SECRET   — your chosen PIN
//   TOTP_SECRET  — Base32 secret key, same as entered in Google Authenticator
// =============================================================================
