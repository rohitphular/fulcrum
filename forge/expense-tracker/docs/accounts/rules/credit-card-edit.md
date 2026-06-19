# Credit Card Account — EDIT

> **Account type:** `credit_card`
> **Group:** Liability
> **Operation:** `edit`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Name | Missing | `Name is required` |
| `credit_card_billing_date` | Provided but outside 1–31 | `Billing date must be between 1 and 31` |
| `credit_card_due_date` | Provided but outside 1–31 | `Due date must be between 1 and 31` |
| `credit_card_limit` | Provided but < 0 | `Credit limit must be 0 or greater` |
| Any non-editable field | Sent in request body | `field_not_editable:X` (backend) |

**Notes:**

- **Editable fields:** `name`, `is_active`, `institution`, `account_number_last4`, `notes`, `credit_card_limit`, `credit_card_apr`, `credit_card_interest_free_days`, `credit_card_billing_date`, `credit_card_due_date`, `credit_card_minimum_payment_pct`, `credit_card_minimum_payment_fixed`, `credit_card_annual_fee`.
- **Cannot change:** `id`, `type`, `sub_type`, `currency`, `opening_balance`, `current_balance`, `created_at`.
- **`current_balance` is read-only.** Shown as a display field (absolute value, "owed" label). Corrections go through `Adjustments / Balance correction` transactions.
- Changing `credit_card_limit` recalculates `utilisation_pct` on the next `list_accounts` response. It does not affect `current_balance`.

**Steps on success:**

1. Frontend passes all validations
2. `POST update_account` sent to backend with editable fields only
3. Backend validates: name present; numeric range checks; rejects any non-editable field with `field_not_editable:X`
4. Editable columns overwritten for the target row; `current_balance` is preserved unchanged
5. Full account list re-fetched from backend
