// =============================================================================
// FULCRUM FORGE — Account Schema: field registry
// Single source of truth for column positions, UI labels, types, and
// applicability rules. No magic column numbers anywhere else in the codebase.
// =============================================================================

const VALID_ACCOUNT_TYPES = [
  'current', 'savings', 'cash',
  'investment',
  'mortgage', 'auto_loan', 'heloc',
  'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation',
  'credit_card',
  'overdraft',
];

const ACCOUNT_LIABILITY_TYPES = new Set([
  'mortgage', 'auto_loan', 'heloc',
  'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation',
  'credit_card',
  'overdraft',
]);

const ACCOUNT_LOAN_TYPES = new Set([
  'mortgage', 'auto_loan', 'heloc',
  'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation',
]);

const INVESTMENT_SUB_TYPES = [
  'stocks_shares', 'isa', 'pension_sipp', 'crypto',
  'fixed_deposit', 'bonds', 'property', 'commodities', 'p2p_lending', 'other',
];

const MORTGAGE_SUB_TYPES = [
  'residential', 'buy_to_let', 'holiday_let', 'commercial', 'bridging', 'shared_ownership',
];

// ─────────────────────────────────────────────────────────────────────────────
// Schema — 37 fields in column-position order
// ─────────────────────────────────────────────────────────────────────────────
const ACCOUNT_SCHEMA = {

  // ── Core (columns 1–12, all account types) ────────────────────────────────
  id: {
    sheet_column_name: 'id',
    sheet_column_position: 1,
    ui_label: 'ID',
    type: 'string',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: null,
    editable: false,
    default_value: null,
  },
  name: {
    sheet_column_name: 'name',
    sheet_column_position: 2,
    ui_label: 'Name',
    type: 'string',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: null,
    editable: true,
    default_value: null,
  },
  type: {
    sheet_column_name: 'type',
    sheet_column_position: 3,
    ui_label: 'Type',
    type: 'enum',
    enum_values: VALID_ACCOUNT_TYPES,
    group: 'core',
    applies_to: null,
    required_for: null,
    editable: false,
    default_value: null,
  },
  sub_type: {
    sheet_column_name: 'sub_type',
    sheet_column_position: 4,
    ui_label: 'Sub-type',
    type: 'string',
    enum_values: null,
    group: 'core',
    applies_to: ['investment', 'mortgage'],
    required_for: [],
    editable: false,
    default_value: '',
  },
  currency: {
    sheet_column_name: 'currency',
    sheet_column_position: 5,
    ui_label: 'Currency',
    type: 'string',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: null,
    editable: false,
    default_value: null,
  },
  opening_balance: {
    sheet_column_name: 'opening_balance',
    sheet_column_position: 6,
    ui_label: 'Opening Balance',
    type: 'number',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: [],
    editable: false,
    default_value: 0,
  },
  current_balance: {
    sheet_column_name: 'current_balance',
    sheet_column_position: 7,
    ui_label: 'Current Balance',
    type: 'number',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: [],
    editable: false,
    default_value: 0,
  },
  is_active: {
    sheet_column_name: 'is_active',
    sheet_column_position: 8,
    ui_label: 'Status',
    type: 'boolean',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: null,
    editable: true,
    default_value: true,
  },
  institution: {
    sheet_column_name: 'institution',
    sheet_column_position: 9,
    ui_label: 'Institution',
    type: 'string',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: [],
    editable: true,
    default_value: '',
  },
  account_number_last4: {
    sheet_column_name: 'account_number_last4',
    sheet_column_position: 10,
    ui_label: 'Account No. (last 4)',
    type: 'string',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: [],
    editable: true,
    default_value: '',
  },
  notes: {
    sheet_column_name: 'notes',
    sheet_column_position: 11,
    ui_label: 'Notes',
    type: 'string',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: [],
    editable: true,
    default_value: '',
  },
  created_at: {
    sheet_column_name: 'created_at',
    sheet_column_position: 12,
    ui_label: 'Created At',
    type: 'string',
    enum_values: null,
    group: 'core',
    applies_to: null,
    required_for: [],
    editable: false,
    default_value: null,
  },

  // ── Savings (columns 13–15) ───────────────────────────────────────────────
  savings_interest_rate: {
    sheet_column_name: 'savings_interest_rate',
    sheet_column_position: 13,
    ui_label: 'Interest Rate (%)',
    type: 'number',
    enum_values: null,
    group: 'savings',
    applies_to: ['current', 'savings'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  savings_interest_frequency: {
    sheet_column_name: 'savings_interest_frequency',
    sheet_column_position: 14,
    ui_label: 'Interest Frequency',
    type: 'enum',
    enum_values: ['monthly', 'quarterly', 'annual'],
    group: 'savings',
    applies_to: ['current', 'savings'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  savings_maturity_date: {
    sheet_column_name: 'savings_maturity_date',
    sheet_column_position: 15,
    ui_label: 'Maturity Date',
    type: 'date',
    enum_values: null,
    group: 'savings',
    applies_to: ['investment'],
    required_for: [],
    editable: true,
    default_value: '',
  },

  // ── Investment (columns 16–17) ────────────────────────────────────────────
  investment_platform: {
    sheet_column_name: 'investment_platform',
    sheet_column_position: 16,
    ui_label: 'Platform / Broker',
    type: 'string',
    enum_values: null,
    group: 'investment',
    applies_to: ['investment'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  investment_risk_level: {
    sheet_column_name: 'investment_risk_level',
    sheet_column_position: 17,
    ui_label: 'Risk Level',
    type: 'enum',
    enum_values: ['low', 'medium', 'high'],
    group: 'investment',
    applies_to: ['investment'],
    required_for: [],
    editable: true,
    default_value: '',
  },

  // ── Loan — secured + unsecured (columns 18–26) ────────────────────────────
  loan_original_amount: {
    sheet_column_name: 'loan_original_amount',
    sheet_column_position: 18,
    ui_label: 'Original Loan Amount',
    type: 'number',
    enum_values: null,
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    required_for: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    editable: false,
    default_value: '',
  },
  loan_interest_rate: {
    sheet_column_name: 'loan_interest_rate',
    sheet_column_position: 19,
    ui_label: 'Interest Rate (%)',
    type: 'number',
    enum_values: null,
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  loan_interest_type: {
    sheet_column_name: 'loan_interest_type',
    sheet_column_position: 20,
    ui_label: 'Interest Type',
    type: 'enum',
    enum_values: ['fixed', 'variable', 'tracker'],
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  loan_tenure_months: {
    sheet_column_name: 'loan_tenure_months',
    sheet_column_position: 21,
    ui_label: 'Tenure (months)',
    type: 'number',
    enum_values: null,
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  loan_start_date: {
    sheet_column_name: 'loan_start_date',
    sheet_column_position: 22,
    ui_label: 'Start Date',
    type: 'date',
    enum_values: null,
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    required_for: [],
    editable: false,
    default_value: '',
  },
  loan_end_date: {
    sheet_column_name: 'loan_end_date',
    sheet_column_position: 23,
    ui_label: 'End Date',
    type: 'date',
    enum_values: null,
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  loan_first_repayment_date: {
    sheet_column_name: 'loan_first_repayment_date',
    sheet_column_position: 24,
    ui_label: 'First Repayment Date',
    type: 'date',
    enum_values: null,
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    required_for: [],
    editable: false,
    default_value: '',
  },
  loan_monthly_repayment: {
    sheet_column_name: 'loan_monthly_repayment',
    sheet_column_position: 25,
    ui_label: 'Monthly Repayment',
    type: 'number',
    enum_values: null,
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  loan_collateral: {
    sheet_column_name: 'loan_collateral',
    sheet_column_position: 26,
    ui_label: 'Collateral',
    type: 'string',
    enum_values: null,
    group: 'loan',
    applies_to: ['mortgage', 'auto_loan'],
    required_for: [],
    editable: true,
    default_value: '',
  },

  // ── Credit Card (columns 27–34) ───────────────────────────────────────────
  credit_card_limit: {
    sheet_column_name: 'credit_card_limit',
    sheet_column_position: 27,
    ui_label: 'Credit Limit',
    type: 'number',
    enum_values: null,
    group: 'credit_card',
    applies_to: ['credit_card'],
    required_for: [],
    editable: true,
    default_value: 0,
  },
  credit_card_apr: {
    sheet_column_name: 'credit_card_apr',
    sheet_column_position: 28,
    ui_label: 'APR (%)',
    type: 'number',
    enum_values: null,
    group: 'credit_card',
    applies_to: ['credit_card'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  credit_card_interest_free_days: {
    sheet_column_name: 'credit_card_interest_free_days',
    sheet_column_position: 29,
    ui_label: 'Interest-Free Days',
    type: 'number',
    enum_values: null,
    group: 'credit_card',
    applies_to: ['credit_card'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  credit_card_billing_date: {
    sheet_column_name: 'credit_card_billing_date',
    sheet_column_position: 30,
    ui_label: 'Billing Date (day of month)',
    type: 'number',
    enum_values: null,
    group: 'credit_card',
    applies_to: ['credit_card'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  credit_card_due_date: {
    sheet_column_name: 'credit_card_due_date',
    sheet_column_position: 31,
    ui_label: 'Due Date (day of month)',
    type: 'number',
    enum_values: null,
    group: 'credit_card',
    applies_to: ['credit_card'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  credit_card_minimum_payment_pct: {
    sheet_column_name: 'credit_card_minimum_payment_pct',
    sheet_column_position: 32,
    ui_label: 'Min. Payment (%)',
    type: 'number',
    enum_values: null,
    group: 'credit_card',
    applies_to: ['credit_card'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  credit_card_minimum_payment_fixed: {
    sheet_column_name: 'credit_card_minimum_payment_fixed',
    sheet_column_position: 33,
    ui_label: 'Min. Payment (fixed £)',
    type: 'number',
    enum_values: null,
    group: 'credit_card',
    applies_to: ['credit_card'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  credit_card_annual_fee: {
    sheet_column_name: 'credit_card_annual_fee',
    sheet_column_position: 34,
    ui_label: 'Annual Fee',
    type: 'number',
    enum_values: null,
    group: 'credit_card',
    applies_to: ['credit_card'],
    required_for: [],
    editable: true,
    default_value: '',
  },

  // ── Overdraft (columns 35–37) ─────────────────────────────────────────────
  overdraft_limit: {
    sheet_column_name: 'overdraft_limit',
    sheet_column_position: 35,
    ui_label: 'Overdraft Limit',
    type: 'number',
    enum_values: null,
    group: 'overdraft',
    applies_to: ['overdraft'],
    required_for: [],
    editable: true,
    default_value: '',
  },
  overdraft_arranged: {
    sheet_column_name: 'overdraft_arranged',
    sheet_column_position: 36,
    ui_label: 'Arranged',
    type: 'boolean',
    enum_values: null,
    group: 'overdraft',
    applies_to: ['overdraft'],
    required_for: [],
    editable: true,
    default_value: true,
  },
  overdraft_apr: {
    sheet_column_name: 'overdraft_apr',
    sheet_column_position: 37,
    ui_label: 'APR (%)',
    type: 'number',
    enum_values: null,
    group: 'overdraft',
    applies_to: ['overdraft'],
    required_for: [],
    editable: true,
    default_value: '',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Client payload — serialised subset returned by get_account_schema
// ─────────────────────────────────────────────────────────────────────────────

function getAccountSchemaForClient() {
  var TYPE_LABELS = {
    current: 'Current Account', savings: 'Savings Account', cash: 'Cash',
    investment: 'Investment',
    mortgage: 'Mortgage', auto_loan: 'Auto / Vehicle Loan', heloc: 'Home Equity (HELOC)',
    personal_loan: 'Personal Loan', student_loan: 'Student Loan',
    medical_loan: 'Medical Loan', debt_consolidation: 'Debt Consolidation',
    credit_card: 'Credit Card', overdraft: 'Overdraft',
  };
  var TYPE_GROUPS = {
    current: 'liquid', savings: 'liquid', cash: 'liquid',
    investment: 'investment',
    mortgage: 'secured_loan', auto_loan: 'secured_loan', heloc: 'secured_loan',
    personal_loan: 'unsecured_loan', student_loan: 'unsecured_loan',
    medical_loan: 'unsecured_loan', debt_consolidation: 'unsecured_loan',
    credit_card: 'credit_card', overdraft: 'overdraft',
  };
  return {
    types: VALID_ACCOUNT_TYPES.map(function(v) {
      return { value: v, label: TYPE_LABELS[v] || v, group: TYPE_GROUPS[v] || 'other' };
    }),
    liability_types:      Array.from(ACCOUNT_LIABILITY_TYPES),
    loan_types:           Array.from(ACCOUNT_LOAN_TYPES),
    investment_sub_types: INVESTMENT_SUB_TYPES,
    mortgage_sub_types:   MORTGAGE_SUB_TYPES,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

// Ordered column headers array — drives getOrCreateSheet() initialisation
function getAccountSheetColumns() {
  return Object.values(ACCOUNT_SCHEMA)
    .sort(function(a, b) { return a.sheet_column_position - b.sheet_column_position; })
    .map(function(f) { return f.sheet_column_name; });
}

// All schema fields applicable to a given account type
function getFieldsForAccountType(type) {
  return Object.keys(ACCOUNT_SCHEMA)
    .filter(function(key) {
      var f = ACCOUNT_SCHEMA[key];
      return f.applies_to === null || f.applies_to.indexOf(type) !== -1;
    })
    .map(function(key) { return Object.assign({ key: key }, ACCOUNT_SCHEMA[key]); });
}

// Single field entry by key
function getAccountSchemaField(key) {
  return ACCOUNT_SCHEMA[key] || null;
}

// True if type is a liability (stored with negative balance)
function isLiabilityType(type) {
  return ACCOUNT_LIABILITY_TYPES.has(type);
}

// True if type is a loan (has loan_* fields and repayment progress bar)
function isLoanType(type) {
  return ACCOUNT_LOAN_TYPES.has(type);
}
