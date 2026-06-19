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

const TRANSACTION_COLUMNS = [
  'id', 'transaction_date_utc', 'transaction_type', 'amount', 'currency',
  'from_account', 'to_account', 'major_category', 'minor_category',
  'counterparty', 'notes', 'tags', 'transfer_id',
  'fx_rate', 'country', 'payment_method'
];
// TRANSACTION_COLUMNS indices (col number = index + 1):
// 0=id  1=transaction_date_utc  2=transaction_type  3=amount  4=currency
// 5=from_account  6=to_account  7=major_category  8=minor_category
// 9=counterparty  10=notes  11=tags  12=transfer_id
// 13=fx_rate  14=country  15=payment_method

const CATEGORY_COLUMNS = ['transaction_type', 'major_category', 'minor_category', 'description', 'tag_keywords'];
const RATES_COLUMNS    = ['currency', 'rate', 'symbol', 'updated_at'];
// ACCOUNT_COLUMNS removed — use getAccountSheetColumns() from account-schema.gs

const AUDIT_COLUMNS = [
  'ip', 'city', 'country', 'user_agent',
  'first_seen', 'last_seen',
  'total_attempts', 'success_count', 'failure_count', 'last_failed_at',
  'is_locked', 'locked_at'
];

const VALID_TYPES = ['money-in', 'money-out', 'money-transfer'];

const DEFAULT_RATES = [
  { currency: 'GBP', rate: 1,    symbol: '£'    },
  { currency: 'INR', rate: 105,  symbol: '₹'    },
  { currency: 'USD', rate: 1.27, symbol: '$'    },
  { currency: 'EUR', rate: 1.17, symbol: '€'    },
  { currency: 'AED', rate: 4.66, symbol: 'AED ' }
];

// VALID_ACCOUNT_TYPES, ACCOUNT_LIABILITY_TYPES, ACCOUNT_LOAN_TYPES removed
// — all defined in account-schema.gs
