# Current Account — DELETE

> **Account type:** `current`  
> **Group:** Asset  
> **Operation:** `delete`

---

**Steps:**

1. User clicks **Delete** → inline confirmation prompt shown
2. User confirms with **Yes, delete**
3. `POST delete_account` sent to backend with the sheet row number
4. Backend deletes the row from the accounts sheet
5. Full account list re-fetched from backend

**Important:**

- **Transactions are not deleted.** Existing transactions referencing this account retain their stored account ID. The account simply disappears from the accounts table and transaction form dropdowns. Balances on those transactions remain in the sheet.
- **Balance adjustments continue to target the deleted account ID** if any backend handler is called against a stale transaction — the write will silently fail or create an orphan entry. Ensure all transactions are resolved before deleting an active account.
- **Archiving is preferred** for accounts that may still be referenced by existing transactions. Set `is_active` to `FALSE` (via Edit → Status → archived) to hide it from dropdowns without losing history.
