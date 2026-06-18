# Investment Account — DELETE

> **Account type:** `investment`  
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

- **Transactions are not deleted.** Existing transactions referencing this account retain their stored account ID.
- **Archiving is preferred** for investment accounts with transaction history.
