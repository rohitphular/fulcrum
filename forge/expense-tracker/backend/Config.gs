// =============================================================================
// FULCRUM FORGE — Config: constants and column definitions
// Shared across all other .gs files via GAS global scope.
// =============================================================================

const TRANSACTIONS_SHEET = 'transactions';
const CATEGORIES_SHEET   = 'categories';
const ACCOUNTS_SHEET     = 'accounts';
const RATES_SHEET        = 'rates';
const AUDIT_SHEET        = 'audit_access';
const MAX_FAILURES       = 3;

// TRANSACTION_COLUMNS, VALID_TRANSACTION_TYPES, txColIndex() removed — all in transaction-schema.gs

const CATEGORY_COLUMNS = ['transaction_type', 'major_category', 'minor_category', 'description', 'tag_keywords'];
const RATES_COLUMNS    = ['currency', 'rate', 'symbol', 'updated_at'];
// ACCOUNT_COLUMNS removed — use getAccountSheetColumns() from account-schema.gs

const AUDIT_COLUMNS = [
  'ip', 'city', 'country', 'user_agent',
  'first_seen', 'last_seen',
  'total_attempts', 'success_count', 'failure_count', 'last_failed_at',
  'is_locked', 'locked_at'
];

// VALID_TYPES removed — use VALID_TRANSACTION_TYPES from transaction-schema.gs

const DEFAULT_RATES = [
  { currency: 'GBP', rate: 1,    symbol: '£'    },
  { currency: 'INR', rate: 105,  symbol: '₹'    },
  { currency: 'USD', rate: 1.27, symbol: '$'    },
  { currency: 'EUR', rate: 1.17, symbol: '€'    },
  { currency: 'AED', rate: 4.66, symbol: 'AED ' }
];

// VALID_ACCOUNT_TYPES, ACCOUNT_LIABILITY_TYPES, ACCOUNT_LOAN_TYPES removed
// — all defined in account-schema.gs
