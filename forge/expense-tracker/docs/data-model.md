# Data Model

All entity shapes. Field types are abstract — choose a concrete type appropriate to your platform (e.g. `string`, `number`, `boolean`, `timestamp`, `decimal`). The reference implementation stores everything as strings in a spreadsheet; a relational or document store would use stricter types.

## Identity & timestamps

| Convention | Format | Example |
|---|---|---|
| Transaction ID | `YYYY-MM-DD-NNN` — date + sequential counter per day | `2026-06-22-007` |
| Account ID | `ACC-YYYYMMDD-NNN` — date + sequential counter per day | `ACC-20260622-003` |
| Timestamps (`*_utc`, `created_at`) | ISO-8601 UTC | `2026-06-22T14:30:00.000Z` |
| Dates (e.g. loan dates) | ISO-8601 date (no time) | `2026-06-22` |

## Account

| Field | Type | Required | Editable after create | Notes |
|---|---|---|---|---|
| `id` | string | auto | no | `ACC-YYYYMMDD-NNN` |
| `name` | string | yes | yes | Display label |
| `type` | enum | yes | no | See [Account types](#account-types) |
| `sub_type` | enum | type-dependent | yes | Required for `mortgage`; optional for `investment`; ignored for all other types. Editable as it is purely a classification label with no side-effects on balance arithmetic. |
| `currency` | ISO-4217 string | yes | no | Must exist in `rates` |
| `opening_balance` | number | optional | no | Informational; for liabilities, enter positive — store as negated |
| `current_balance` | number | derived | no (system-managed) | Updated by transaction lifecycle; stored as negative for liabilities |
| `is_active` | boolean | default true | yes | Archived accounts hide from transaction forms |
| `institution` | string | optional | yes | Bank or lender name |
| `account_number_last4` | string | optional | yes | Last 4 digits |
| `notes` | string | optional | yes | Free text |
| `created_at` | timestamp | auto | no | UTC ISO |

### Type-specific fields

**Savings / current** (also valid on investment):

| Field | Type | Notes |
|---|---|---|
| `savings_interest_rate` | number (%) | Annual rate |
| `savings_interest_frequency` | enum | `monthly` \| `quarterly` \| `annual` |
| `savings_maturity_date` | date | Investment only |

**Investment**:

| Field | Type | Notes |
|---|---|---|
| `investment_platform` | string | Broker / platform |
| `investment_risk_level` | enum | `low` \| `medium` \| `high` |

**Loan family** (applies to: `mortgage`, `auto_loan`, `heloc`, `personal_loan`, `student_loan`, `medical_loan`, `debt_consolidation`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `loan_original_amount` | number | **yes** | Original principal; must be > 0 |
| `loan_interest_rate` | number (%) | optional | |
| `loan_interest_type` | enum | optional | `fixed` \| `variable` \| `tracker` |
| `loan_tenure_months` | number | optional | |
| `loan_start_date` | date | optional | Not editable after create |
| `loan_end_date` | date | optional | Must be after `loan_start_date` |
| `loan_first_repayment_date` | date | optional | Not editable after create; drives `next_payment_date` derivation |
| `loan_monthly_repayment` | number | optional | |
| `loan_collateral` | string | optional | Only meaningful for `mortgage` and `auto_loan` |

**Credit card**:

| Field | Type | Notes |
|---|---|---|
| `credit_card_limit` | number ≥ 0 | Drives utilisation; required for hard-block enforcement |
| `credit_card_apr` | number (%) | Annual rate |
| `credit_card_interest_free_days` | number | |
| `credit_card_billing_date` | number (1–31) | Day of month |
| `credit_card_due_date` | number (1–31) | Day of month |
| `credit_card_minimum_payment_pct` | number | |
| `credit_card_minimum_payment_fixed` | number | |
| `credit_card_annual_fee` | number | |

**Overdraft**:

| Field | Type | Notes |
|---|---|---|
| `overdraft_limit` | number ≥ 0 | Drives utilisation |
| `overdraft_arranged` | boolean | True = arranged; False = unarranged |
| `overdraft_apr` | number (%) | |

### Derived (computed by `list_accounts`, never stored)

| Field | Applies to | Formula |
|---|---|---|
| `utilisation_pct` | `credit_card`, `overdraft` | `abs(current_balance) / limit × 100`, rounded to 1 dp; `null` if limit is 0/blank |
| `repayment_pct` | All loan types | `(loan_original_amount − abs(current_balance)) / loan_original_amount × 100`, clamped to [0, 100] |
| `next_payment_date` | All loan types | Advance `loan_first_repayment_date` by N months until result > today |

### Account types

```
Assets:       current, savings, cash, investment
Liabilities:  mortgage, auto_loan, heloc, personal_loan, student_loan,
              medical_loan, debt_consolidation, credit_card, overdraft
```

### Sub-types

```
investment:   stocks_shares, isa, pension_sipp, crypto, fixed_deposit,
              bonds, property, commodities, p2p_lending, other
mortgage:     residential, buy_to_let, holiday_let, commercial,
              bridging, shared_ownership   (required)
```

## Transaction

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | auto | `YYYY-MM-DD-NNN` |
| `transaction_date_utc` | timestamp | yes | ISO UTC |
| `transaction_type` | enum | yes | `money-in` \| `money-out` \| `money-transfer` |
| `amount` | number | yes | Must be > 0; in `source_account`'s currency for out/transfer, in `target_account`'s currency for money-in |
| `currency` | ISO-4217 | yes | Derived at save time from the relevant account |
| `source_account` | Account ID | type-dependent | Required for `money-out` and `money-transfer`; omitted for `money-in` |
| `target_account` | Account ID | type-dependent | Required for `money-transfer`; required for `money-in`; optional for `money-out` (used for repayments to owned accounts) |
| `major_category` | string | for in/out | References `categories.major_category`; omitted for `money-transfer` |
| `minor_category` | string | for in/out | References `categories.minor_category` |
| `counterparty` | string | optional | Merchant, employer, payer, etc. |
| `country` | string | optional | Where it happened |
| `tags` | string | optional | Semicolon-separated on storage; comma-separated in UI input |
| `notes` | string | optional | Free text |
| `fx_rate` | number > 0 | conditional | Required when `source_account.currency ≠ target_account.currency` |
| `transfer_id` | string | reserved | Not currently populated |
| `payment_method` | string | reserved | Not currently populated |

## Category

| Field | Type | Required | Notes |
|---|---|---|---|
| `transaction_type` | enum | yes | `money-in` \| `money-out` \| `money-transfer` |
| `major_category` | string | yes | Top-level grouping |
| `minor_category` | string | yes | Sub-classification |
| `description` | string | optional | Free text |
| `tag_keywords` | string | optional | Comma-separated; lowercased on save; reserved for auto-classification |
| `is_active` | boolean | default true | Archived categories hide from transaction forms |
| `source_account_mandatory` | boolean | optional | Hint: source account must be present |
| `source_account_types` | string | optional | Comma-separated allowed source account types |
| `target_account_mandatory` | boolean | optional | Hint: target account must be present |
| `target_account_types` | string | optional | Comma-separated allowed target account types |

The `*_mandatory` and `*_types` columns let categories declare account-type contracts (e.g. *Credit card payment* requires `source = current` and `target = credit_card`). The backend validates these on save and rejects mismatched transactions.

## Rate

| Field | Type | Notes |
|---|---|---|
| `currency` | ISO-4217 string | Primary key |
| `symbol` | string | Display only (`£`, `$`, `₹`, …); optional |
| `rate` | number > 0 | Units of this currency per 1 base currency |
| `updated_at` | timestamp | UTC ISO |

The base currency row (`GBP` in the reference) is read-only with rate = 1. Other rows can be upserted.

## Audit entry

| Field | Type | Notes |
|---|---|---|
| `ip` | string | Primary identifier |
| `city`, `country`, `user_agent` | string | Optional metadata, populated by geolookup |
| `first_seen_at`, `last_seen_at` | timestamp | UTC ISO |
| `attempts`, `successes`, `failures` | number | Running totals |
| `is_locked` | boolean | True after `MAX_FAILURES` consecutive failures |

## Cross-entity invariants

1. Every `account.currency` MUST exist in `rates`.
2. Every `transaction.source_account` and `transaction.target_account` MUST reference an existing account row.
3. A transaction's `major`/`minor` MAY reference a deleted category — the strings are stored as-is; orphan category references do not break reads.
4. `account.current_balance` is **only ever mutated by the transaction lifecycle** (create/update/delete), never written directly through the account API.
5. Account deletion does not cascade to transactions; transactions retain stale `source_account`/`target_account` IDs.
