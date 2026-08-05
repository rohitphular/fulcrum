# Accounts Metadata — Implementation Plan

## Assumptions (resolving open questions)

1. **Outstanding balance accuracy** — Option B (full amortization). We have all the inputs
   (`loan_original_amount`, `loan_annual_interest_rate`, `loan_tenure_months`,
   `loan_start_date`) so the job will derive the exact principal paid per installment.

2. **Transaction identification for loans** — by account linkage only. Any transaction
   where `source_account` or `destination_account` matches the loan account ID counts as
   a repayment. No category constraint.

3. **CC `current_value`** — manual. CC balance is too complex to derive reliably from
   transactions (billing cycles, partial payments, refunds). The job computes only
   `cc_interest_and_charges_paid` from transactions tagged to the CC account.
   User maintains `current_value` for CC manually via the existing edit form.

4. **Investment / Savings** — out of scope for this task.

5. **`loan_` columns apply to all `LOAN_SUB_TYPES`** — already defined in the schema as
   `['personal_loan', 'mortgage', 'auto_loan', 'heloc', 'student_loan', 'medical_loan',
   'debt_consolidation']`. `credit_card` and `overdraft` are excluded.

---

## Schema extension pattern

Each new metadata field will carry a new property `applies_to_sub_type: [...]` (array of
sub_type strings, or null for all). This is the discriminator used by the FE to
conditionally render form fields, and by the job to know which accounts to process.

---

## Phase 1 — BE: extend `account-schema.gs`

**File:** `forge/expense-tracker/api/account-schema.gs`

Add 12 new fields to `ACCOUNT_SCHEMA`. All use `group: 'metadata'` and `editable: true`
(except job-computed fields which use `editable: false`).

### Credit Card fields (cols 11–15)

| Key | Position | Type | Editable | applies_to_sub_type |
|---|---|---|---|---|
| cc_annual_interest_rate | 11 | number | true | ['credit_card'] |
| cc_credit_limit | 12 | number | true | ['credit_card'] |
| cc_billing_month_day | 13 | number | true | ['credit_card'] |
| cc_payment_month_day | 14 | number | true | ['credit_card'] |
| cc_interest_and_charges_paid | 15 | number | false | ['credit_card'] |

### Loan fields (cols 16–22)

| Key | Position | Type | Editable | applies_to_sub_type |
|---|---|---|---|---|
| loan_original_amount | 16 | number | true | LOAN_SUB_TYPES |
| loan_annual_interest_rate | 17 | number | true | LOAN_SUB_TYPES |
| loan_start_date | 18 | string | true | LOAN_SUB_TYPES |
| loan_tenure_months | 19 | number | true | LOAN_SUB_TYPES |
| loan_installment_amount | 20 | number | true | LOAN_SUB_TYPES |
| loan_installments_completed | 21 | number | false | LOAN_SUB_TYPES |
| loan_interest_and_charges_paid | 22 | number | false | LOAN_SUB_TYPES |

No existing positions change. `getOrCreateSheet` will auto-append the new column headers
to any existing Accounts sheet.

Also add a helper: `getMetadataFieldsForSubType(sub_type)` — returns schema fields where
`applies_to_sub_type` includes the given sub_type.

---

## Phase 2 — BE: extend `account-core.gs`

**File:** `forge/expense-tracker/api/account-core.gs`

### `createAccount`

After existing `setCol` calls, add metadata field writes. Only write fields whose
`applies_to_sub_type` includes `body.sub_type`. All others remain empty string.

```
// CC
if sub_type === 'credit_card':
  setCol('cc_annual_interest_rate', ...)
  setCol('cc_credit_limit', ...)
  setCol('cc_billing_month_day', ...)
  setCol('cc_payment_month_day', ...)
  setCol('cc_interest_and_charges_paid', 0)

// Loan
if sub_type in LOAN_SUB_TYPES:
  setCol('loan_original_amount', ...)
  setCol('loan_annual_interest_rate', ...)
  setCol('loan_start_date', ...)
  setCol('loan_tenure_months', ...)
  setCol('loan_installment_amount', ...)
  setCol('loan_installments_completed', 0)
  setCol('loan_interest_and_charges_paid', 0)
```

### `updateAccount`

Same pattern for `writeField`. Only write user-editable metadata fields (`editable: true`).
Job-computed fields (`editable: false`) are never written by GAS.

---

## Phase 3 — BE: extend `account-validation.gs`

**File:** `forge/expense-tracker/api/account-validation.gs`

### `validateAccountCreate` and `validateAccountUpdate`

Add sub_type-specific validation blocks:

**CC:**
- `cc_billing_month_day` and `cc_payment_month_day`: integer 1–31 if provided
- `cc_annual_interest_rate`: number >= 0 if provided
- `cc_credit_limit`: number > 0 if provided

**Loan:**
- `loan_original_amount`: required, number > 0
- `loan_annual_interest_rate`: number >= 0 if provided
- `loan_start_date`: valid YYYY-MM-DD if provided
- `loan_tenure_months`: integer > 0 if provided
- `loan_installment_amount`: number > 0 if provided

All metadata fields are optional except `loan_original_amount` for loan sub-types.

---

## Phase 4 — FE: extend `accounts.js`

**File:** `forge/expense-tracker/app/sections/accounts.js`

### Add form

Render a metadata section below the core fields, conditionally based on selected sub_type.
Cascade: when sub_type changes, re-render the metadata section.

**CC section** (shown when sub_type = credit_card):
- Annual interest rate (%)
- Credit limit
- Billing day (1–31)
- Payment day (1–31)

**Loan section** (shown when sub_type in loan_sub_types):
- Original amount
- Annual interest rate (%)
- Start date
- Tenure (months)
- Installment amount

Job-computed fields (`cc_interest_and_charges_paid`, `loan_installments_completed`,
`loan_interest_and_charges_paid`) are never shown in the form — display only.

### View panel

Show metadata section in the view panel with read-only labels. Group under a "Metadata"
heading. Show job-computed fields here as read-only (e.g. "Installments completed: 18").

### Account card (mobile)

Add a one-line metadata summary below the account name:
- CC: `{cc_credit_limit} limit · billing {cc_billing_month_day}`
- Loan: `{loan_tenure_months}mo · {loan_installments_completed} paid`

---

## Phase 5 — Job module

**Location:** `forge/expense-tracker/job/`

### Files

```
job/
  compute_account_metadata.py   # main entry point
  sheets_client.py              # Google Sheets API wrapper
  amortization.py               # EMI / amortization schedule logic
  requirements.txt              # gspread, google-auth
  README.md                     # setup and usage
```

### Authentication

Service account JSON key (or OAuth2 credentials). Path passed via env var or CLI arg.

### `sheets_client.py`

Thin wrapper around `gspread`. Methods:
- `read_sheet(sheet_name)` → list of dicts (header row as keys)
- `write_cells(sheet_name, row_num, col_updates)` → batch update

### `amortization.py`

- `compute_schedule(principal, annual_rate, tenure_months, start_date)` → list of
  `{month, principal_paid, interest_paid, balance}` per installment
- `count_installments(transactions, account_id)` → int
- `sum_interest_paid(schedule, installments_completed)` → float
- `outstanding_balance(schedule, installments_completed)` → float

### `compute_account_metadata.py`

```
1. Load accounts sheet
2. Load transactions sheet
3. For each loan account (sub_type in LOAN_SUB_TYPES):
   a. Skip if loan_original_amount or loan_annual_interest_rate missing
   b. compute_schedule(...)
   c. installments_completed = count_installments(transactions, account.id)
   d. interest_paid = sum_interest_paid(schedule, installments_completed)
   e. outstanding = outstanding_balance(schedule, installments_completed)
   f. Write: loan_installments_completed, loan_interest_and_charges_paid, current_value
4. For each CC account:
   a. interest_paid = sum of money-out transactions linked to account
      where minor_category matches interest/charges categories (TBD)
   b. Write: cc_interest_and_charges_paid
5. Print summary: accounts updated, errors
```

### CLI usage

```bash
python job/compute_account_metadata.py --creds path/to/creds.json --sheet-id <SHEET_ID>
```

---

## Implementation order

1. Phase 1 — schema (BE) — everything depends on column positions being locked first
2. Phase 2 — core (BE) — create/update with new fields
3. Phase 3 — validation (BE) — guard new fields
4. Deploy BE to dev, verify sheet gets new columns via `getOrCreateSheet`
5. Phase 4 — FE — form + view + cards
6. Phase 5 — job module — Python, standalone, test against dev sheet

---

## Out of scope

- Investment / Savings metadata
- CC `current_value` computed by job (manual for now)
- Scheduling / automation of the job (manual CLI trigger only)
