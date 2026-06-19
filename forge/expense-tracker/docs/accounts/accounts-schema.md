# Accounts — Schema Design

## 1. Account Type Taxonomy

### Liquid (easy access)
| type value | Label | Notes |
|---|---|---|
| `current` | Current Account | Day-to-day spending, debit card |
| `savings` | Savings Account | Easy-access savings, earns interest |
| `cash` | Cash | Physical cash wallet/envelope |

### Investment (money working for you, often illiquid)
| type value | Label | sub_type values |
|---|---|---|
| `investment` | Investment | `stocks_shares`, `isa`, `pension_sipp`, `crypto`, `fixed_deposit`, `bonds`, `property`, `commodities`, `p2p_lending`, `other` |

**sub_type notes:**
- `stocks_shares` — trading account, general equities / ETFs
- `isa` — UK Stocks & Shares ISA or Cash ISA (tax wrapper)
- `pension_sipp` — SIPP, workplace pension, 401k
- `crypto` — cryptocurrency holdings
- `fixed_deposit` — term deposit / CD, locked for a fixed period
- `bonds` — government or corporate bonds
- `property` — real estate (primary or investment)
- `commodities` — gold, silver, other physical assets
- `p2p_lending` — peer-to-peer lending platforms

### Secured Liabilities (backed by an asset)
| type value | Label | sub_type values | Collateral |
|---|---|---|---|
| `mortgage` | Mortgage | `residential`, `buy_to_let`, `holiday_let`, `commercial`, `bridging`, `shared_ownership` | Property |
| `auto_loan` | Auto / Vehicle Loan | — | Vehicle |
| `heloc` | Home Equity Line of Credit | — | Property equity |

**mortgage sub_type notes:**
- `residential` — primary home purchase
- `buy_to_let` — rental investment property
- `holiday_let` — short-term / holiday rental property
- `commercial` — commercial premises
- `bridging` — short-term bridge financing (property purchase gap)
- `shared_ownership` — UK part-own / part-rent scheme

### Unsecured Liabilities (no asset backing)
| type value | Label |
|---|---|
| `personal_loan` | Personal Loan |
| `student_loan` | Student Loan |
| `credit_card` | Credit Card |
| `overdraft` | Overdraft |
| `medical_loan` | Medical Loan |
| `debt_consolidation` | Debt Consolidation Loan |

---

## 2. Flat Schema

All account types share one sheet with the same columns. Type-specific columns are empty/null for irrelevant types. Columns are grouped logically below.

### 2.1 Core — all types

| Column | Type | Description |
|---|---|---|
| `id` | string | Auto-generated, e.g. `ACC-20260619-001` |
| `name` | string | Display name, e.g. "Barclays Current" |
| `type` | enum | See taxonomy above |
| `sub_type` | enum / string | Investment sub-type; blank for non-investment |
| `currency` | string | ISO 4217, e.g. `GBP` |
| `opening_balance` | number | Balance when tracking started (negative for liabilities) |
| `current_balance` | number | Live balance, updated by transactions |
| `is_active` | boolean | `true` = active, `false` = archived |
| `institution` | string | Bank / broker / lender name |
| `account_number_last4` | string | Last 4 digits of account/card number |
| `notes` | string | Free-text notes |

### 2.2 Savings & Current — interest

| Column | Type | Applies to |
|---|---|---|
| `savings_interest_rate` | number (%) | `savings`, `current`, `fixed_deposit` |
| `savings_interest_frequency` | enum | `monthly`, `quarterly`, `annual` |
| `savings_maturity_date` | date | `fixed_deposit` only — when the term ends |

### 2.3 Investment

| Column | Type | Applies to |
|---|---|---|
| `investment_platform` | string | Broker / platform name (e.g. Vanguard, Freetrade) |
| `investment_risk_level` | enum | `low`, `medium`, `high` |

### 2.4 Loans (secured + unsecured)

Applies to: `mortgage`, `buy_to_let_mortgage`, `auto_loan`, `heloc`, `personal_loan`, `student_loan`, `medical_loan`, `debt_consolidation`

| Column | Type | Description |
|---|---|---|
| `loan_original_amount` | number | Total amount borrowed at inception |
| `loan_interest_rate` | number (%) | Annual interest rate (e.g. `5.25`) |
| `loan_interest_type` | enum | `fixed`, `variable`, `tracker` |
| `loan_tenure_months` | integer | Total loan term in months |
| `loan_start_date` | date | Date loan was taken out |
| `loan_end_date` | date | Calculated or stated payoff date |
| `loan_first_repayment_date` | date | Date of first payment |
| `loan_monthly_repayment` | number | Fixed monthly payment amount |
| `loan_next_payment_date` | date | **Derived, not stored** — calculated as `loan_first_repayment_date + N months` |
| `loan_collateral` | string | `mortgage` / `auto_loan` only — e.g. property address, vehicle reg |

**Progress bar source:** `loan_original_amount` (not `opening_balance`) — repayment % = `(loan_original_amount − |current_balance|) / loan_original_amount × 100`

### 2.5 Credit Card

| Column | Type | Description |
|---|---|---|
| `credit_card_limit` | number | Maximum credit limit |
| `credit_card_apr` | number (%) | Annual Percentage Rate |
| `credit_card_interest_free_days` | integer | Days interest-free after statement (e.g. 56) |
| `credit_card_billing_date` | integer | Day of month statement is generated (e.g. `15`) |
| `credit_card_due_date` | integer | Day of month payment is due (e.g. `25`) |
| `credit_card_minimum_payment_pct` | number (%) | Minimum payment as % of balance |
| `credit_card_minimum_payment_fixed` | number | Minimum payment floor (e.g. £25) |
| `credit_card_annual_fee` | number | Annual card fee |

**Progress bar source:** `credit_card_limit` + `current_balance` — utilisation % = `|current_balance| / credit_card_limit × 100`

### 2.6 Overdraft

| Column | Type | Description |
|---|---|---|
| `overdraft_limit` | number | Arranged overdraft limit |
| `overdraft_arranged` | boolean | `true` = arranged, `false` = unarranged |
| `overdraft_apr` | number (%) | Interest rate on overdraft |

---

## 3. Column-to-Type Matrix

| Column group | current | savings | cash | investment | secured loans ¹ | unsecured loans ² | credit_card | overdraft |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Core | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| savings_interest_* | ✓ | ✓ | | | | | | |
| savings_maturity_date | | | | | | | | |
| investment_* | | | | ✓ | | | | |
| loan_* | | | | | ✓ | ✓ | | |
| loan_collateral | | | | | ✓ | | | |
| credit_card_* | | | | | | | ✓ | |
| overdraft_* | | | | | | | | ✓ |

¹ **Secured loans:** `mortgage` (sub_types: residential, buy_to_let, holiday_let, commercial, bridging, shared_ownership), `auto_loan`, `heloc`
² **Unsecured loans:** `personal_loan`, `student_loan`, `medical_loan`, `debt_consolidation`

---

## 4. Display Logic Summary

| Type group | Balance label | Progress bar |
|---|---|---|
| Liquid | Balance | None |
| Investment | Value | None — balance updated via `adjustment` category transactions |
| Secured loan | Remaining owed | Repayment progress vs `loan_original_amount` |
| Unsecured loan | Remaining owed | Repayment progress vs `loan_original_amount` |
| Credit card | Balance owed | Utilisation vs `credit_card_limit` |
| Overdraft | Balance owed | Utilisation vs `overdraft_limit` |

---

## 5. Resolved Design Decisions

| # | Decision | Resolution |
|---|---|---|
| 1 | **Investment `current_balance` updates** | Updated via `adjustment` category transactions — not auto-derived |
| 2 | **`loan_next_payment_date` storage** | Derived at runtime from `loan_first_repayment_date + N months` — not stored as a column |
| 3 | **Overdraft placement** | Own account type — better for tracking purposes |
| 4 | **Mortgage sub-typing** | `type=mortgage` with `sub_type`: `residential`, `buy_to_let`, `holiday_let`, `commercial`, `bridging`, `shared_ownership` |
| 5 | **Implementation scope** | All account types implemented upfront — no phased rollout |
