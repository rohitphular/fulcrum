# Overdraft — EDIT

> **Account type:** `overdraft`
> **Group:** Liability
> **Operation:** `edit`

---

**Validations:**

| Field | Condition that blocks | Error message |
|---|---|---|
| Name | Missing | `Name is required` |
| `overdraft_limit` | Provided but < 0 | `Overdraft limit must be 0 or greater` |
| Any non-editable field | Sent in request body | `field_not_editable:X` (backend) |

**Notes:**

- **Editable fields:** `name`, `is_active`, `institution`, `account_number_last4`, `notes`, `overdraft_limit`, `overdraft_arranged`, `overdraft_apr`.
- **Cannot change:** `id`, `type`, `sub_type`, `currency`, `opening_balance`, `current_balance`, `created_at`.
- **`current_balance` is read-only.** Shown as a display field (absolute value, "owed" label). Corrections go through `Adjustments / Balance correction` transactions.
- Changing `overdraft_limit` recalculates `utilisation_pct` on the next `list_accounts` response. It does not affect `current_balance`.
- `overdraft_arranged` can be changed if the arrangement status changes (e.g. bank formalises a previously unarranged overdraft).

**Steps on success:**

1. Frontend passes all validations
2. `POST update_account` sent to backend with editable fields only
3. Backend validates: name present; `overdraft_limit` ≥ 0 if provided; rejects any non-editable field with `field_not_editable:X`
4. Editable columns overwritten for the target row; `current_balance` is preserved unchanged
5. Full account list re-fetched from backend
