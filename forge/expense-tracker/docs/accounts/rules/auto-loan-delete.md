# Auto Loan — DELETE

> **Account type:** `auto_loan`
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
- **Outstanding balance is lost.** Deleting the account removes the loan liability from Net Worth immediately, making net worth appear artificially higher.
- **Archiving is strongly preferred** for auto loan accounts with an outstanding balance — the liability data cannot be recovered after deletion.
