# Credit Card Account — DELETE

> **Account type:** `credit-card`  
> **Group:** Liability  
> **Operation:** `delete`

---

**Steps:**

1. User clicks **Delete** → inline confirmation prompt shown
2. User confirms with **Yes, delete**
3. `POST delete_account` sent to backend with the sheet row number
4. Backend deletes the row from the accounts sheet
5. Full account list re-fetched from backend

**Important:**

- **Transactions are not deleted.** Existing transactions referencing this account retain their stored account ID.
- **Credit limit data is lost.** Once deleted, the `credit_limit` value is gone; past transactions that enforced the limit are unaffected.
- **Archiving is strongly preferred** for credit card accounts with outstanding balances or transaction history, as the utilisation and balance data cannot be recovered after deletion.
