// =============================================================================
// FULCRUM FORGE — Category Schema: field registry
// Single source of truth for column positions, UI labels, types, and groups.
// No magic column numbers anywhere else in the codebase.
// Depends on: VALID_TRANSACTION_TYPES (transaction-schema.gs),
//             VALID_ACCOUNT_TYPES (account-schema.gs)
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Schema — 10 fields in column-position order
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_SCHEMA = {

  // ── Core (columns 1–5, all types) ─────────────────────────────────────────
  transaction_type: {
    sheet_column_name: 'transaction_type',
    sheet_column_position: 1,
    ui_label: 'Type',
    type: 'enum',
    enum_values: null, // resolved at runtime: VALID_TRANSACTION_TYPES
    group: 'core',
    editable: true,
    default_value: 'money-out',
  },
  major_category: {
    sheet_column_name: 'major_category',
    sheet_column_position: 2,
    ui_label: 'Major category',
    type: 'string',
    enum_values: null,
    group: 'core',
    editable: true,
    default_value: '',
  },
  minor_category: {
    sheet_column_name: 'minor_category',
    sheet_column_position: 3,
    ui_label: 'Minor category',
    type: 'string',
    enum_values: null,
    group: 'core',
    editable: true,
    default_value: '',
  },
  description: {
    sheet_column_name: 'description',
    sheet_column_position: 4,
    ui_label: 'Description',
    type: 'string',
    enum_values: null,
    group: 'core',
    editable: true,
    default_value: '',
  },
  is_active: {
    sheet_column_name: 'is_active',
    sheet_column_position: 5,
    ui_label: 'Active',
    type: 'boolean',
    enum_values: null,
    group: 'core',
    editable: true,
    default_value: true,
  },

  // ── Classification (columns 6–7) ──────────────────────────────────────────
  tag_keywords: {
    sheet_column_name: 'tag_keywords',
    sheet_column_position: 6,
    ui_label: 'Tag keywords',
    type: 'string',
    enum_values: null,
    group: 'classification',
    editable: true,
    default_value: '',
  },
  counterparty_examples: {
    sheet_column_name: 'counterparty_examples',
    sheet_column_position: 7,
    ui_label: 'Counterparty examples',
    type: 'string',
    enum_values: null,
    group: 'classification',
    editable: true,
    default_value: '',
  },

  // ── Account hints (columns 8–9) ───────────────────────────────────────────
  // Stored as comma-separated account type values, normalised lowercase.
  // source_account_types → hints for from_account (for money-out: the funding
  //   account; for money-in: the receiving account; for transfers: the source).
  // destination_account_types → hints for to_account (transfers only; blank
  //   for money-in / money-out).
  source_account_types: {
    sheet_column_name: 'source_account_types',
    sheet_column_position: 8,
    ui_label: 'Source account types',
    type: 'multi-select',
    enum_values: null, // resolved at runtime: VALID_ACCOUNT_TYPES
    group: 'account_hints',
    editable: true,
    default_value: '',
  },
  destination_account_types: {
    sheet_column_name: 'destination_account_types',
    sheet_column_position: 9,
    ui_label: 'Destination account types',
    type: 'multi-select',
    enum_values: null, // resolved at runtime: VALID_ACCOUNT_TYPES
    group: 'account_hints',
    editable: true,
    default_value: '',
  },

  // ── Meta (column 10) ──────────────────────────────────────────────────────
  sort_order: {
    sheet_column_name: 'sort_order',
    sheet_column_position: 10,
    ui_label: 'Sort order',
    type: 'number',
    enum_values: null,
    group: 'meta',
    editable: true,
    default_value: 0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Client payload — serialised subset returned by get_category_schema
// ─────────────────────────────────────────────────────────────────────────────
function getCategorySchemaForClient() {
  return {
    types: VALID_TRANSACTION_TYPES.map(function(v) {
      var labels = { 'money-in': 'Money In', 'money-out': 'Money Out', 'money-transfer': 'Transfer' };
      return { value: v, label: labels[v] || v };
    }),
    account_types: VALID_ACCOUNT_TYPES.map(function(v) {
      var labels = {
        current: 'Current Account', savings: 'Savings Account', cash: 'Cash',
        investment: 'Investment',
        mortgage: 'Mortgage', auto_loan: 'Auto Loan', heloc: 'HELOC',
        personal_loan: 'Personal Loan', student_loan: 'Student Loan',
        medical_loan: 'Medical Loan', debt_consolidation: 'Debt Consolidation',
        credit_card: 'Credit Card', overdraft: 'Overdraft',
      };
      var groups = {
        current: 'asset', savings: 'asset', cash: 'asset', investment: 'asset',
        mortgage: 'liability', auto_loan: 'liability', heloc: 'liability',
        personal_loan: 'liability', student_loan: 'liability',
        medical_loan: 'liability', debt_consolidation: 'liability',
        credit_card: 'liability', overdraft: 'liability',
      };
      return { value: v, label: labels[v] || v, group: groups[v] || 'asset' };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

function getCategorySheetColumns() {
  return Object.values(CATEGORY_SCHEMA)
    .sort(function(a, b) { return a.sheet_column_position - b.sheet_column_position; })
    .map(function(f) { return f.sheet_column_name; });
}

function getCategorySchemaField(key) {
  return CATEGORY_SCHEMA[key] || null;
}

function catColIndex(name) {
  var f = CATEGORY_SCHEMA[name];
  if (!f) throw new Error('Unknown category column: ' + name);
  return f.sheet_column_position - 1;
}
