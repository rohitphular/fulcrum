# Transaction Suggestions — Requirements

## Overview

When the user opens the Transactions module, a collapsible panel (similar to Filters) appears at the top of the page titled **"Suggestions"**. It surfaces transactions the user is likely to want to log, based on their history, so they don't have to start from scratch.

The goal is not a full AI model — it's a lightweight heuristic engine on the backend that spots patterns a user would recognise as obviously useful.

---

## UI Behaviour

- Collapsible section rendered above the transactions list, below the action bar.
- Collapsed by default after first visit; remembers open/closed state in `sessionStorage`.
- Header shows suggestion count: **"Suggestions (3)"**. Hidden entirely if 0 suggestions.
- Each suggestion is a compact card (not a full transaction row) with:
  - Counterparty name (bold)
  - Minor category · Account (muted)
  - Typical amount + currency (right-aligned)
  - **"Add"** button — opens the Add Transaction drawer pre-filled with counterparty, category, account, amount, currency
  - **"✕"** dismiss button — hides this suggestion for the session (not persisted)
- Maximum 5 suggestions shown. Ranked by confidence (see below).
- A subtle "Why?" tooltip or label on each card explains the reason: `"monthly · usually around the 5th"` or `"often on Tuesday mornings"`.

---

## Backend Endpoint

**Action**: `getSuggestedTransactions`  
**Method**: POST (authenticated, session required)  
**Response**:
```json
{
  "ok": true,
  "suggestions": [
    {
      "type": "recurring_monthly",
      "counterparty": "Netflix",
      "major_category": "Entertainment",
      "minor_category": "Streaming",
      "account": "Monzo",
      "typical_amount": 15.99,
      "currency": "GBP",
      "confidence": 0.92,
      "reason": "monthly · usually around the 1st",
      "last_seen": "2026-07-01"
    }
  ]
}
```

---

## Suggestion Signals

### Signal 1 — Recurring Monthly (primary, high confidence)

Detect counterparties the user pays every month at a consistent day of month.

**Logic**:
1. Look back **6 months** of transactions.
2. Group `money-out` transactions by `(counterparty, minor_category)`.
3. For a group to qualify: must appear in **≥ 4 of the last 6 calendar months**.
4. Compute the median `day_of_month` across occurrences.
5. Check if a matching transaction exists **this calendar month** (same counterparty + minor_category).
6. If **no match this month** AND `today >= median_day - 3`: surface as suggestion.
7. Confidence = `occurrences_in_window / 6`.

**Why 6 months?** 1 month gives at most 1 data point for a monthly recurrence — not enough to detect the pattern. 6 months gives up to 6 occurrences and filters out one-off payments.

---

### Signal 2 — Recurring Weekly (primary, medium confidence)

Same logic but weekly cadence.

1. Look back **8 weeks**.
2. Group by `(counterparty, minor_category)`.
3. Qualify: appears in **≥ 5 of the last 8 weeks**.
4. Compute the mode `day_of_week` (0=Mon … 6=Sun).
5. If today is that day of week AND no matching transaction today: surface.
6. Confidence = `occurrences_in_window / 8`.

---

### Signal 3 — Time-of-Day Habit (secondary, lower confidence)

Detect transactions the user typically makes at the current time of day and day of week.

Time source: `transaction_date_utc` column (stores full UTC datetime).

1. Look back **4 weeks** of transactions (tighter window — habits change).
2. Parse the UTC hour from `transaction_date_utc`.
3. For each `(counterparty, day_of_week, hour_bucket)` where `hour_bucket = floor(hour / 2)` (2-hour windows):
   - If the user transacted with this counterparty on this day-of-week in this hour-bucket in **≥ 3 of the last 4 matching weekdays**: qualify.
4. Filter to counterparties not already transacted with **today**.
5. Cap at **2 suggestions** from this signal so it doesn't dominate.
6. Confidence = `occurrences / 4 * 0.6` (dampened — lower signal quality).

---

## Ranking & Deduplication

1. Deduplicate across signals: if the same `(counterparty, minor_category)` appears from multiple signals, keep only the highest-confidence one.
2. Sort by `confidence` descending.
3. Return top 5.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| User has < 3 months of data | Signals 1 and 2 may return 0 results; still valid — show empty state |
| Counterparty name varies slightly (e.g., "NETFLIX.COM" vs "Netflix") | FE normalises on display; BE matches on raw stored value — no fuzzy match for now |
| Amount varies significantly month to month | Show `typical_amount` = median; add "(varies)" label if stddev > 20% of median |
| User dismisses a suggestion | Hide for session only (sessionStorage); re-appears next visit |
| No suggestions at all | Collapse the section header entirely — do not show an empty panel |

---

## Open Questions

1. **Should dismiss be persistent?** Could store dismissed `(counterparty, minor_category)` keys in a user-prefs sheet row. Keep simple for now — session only.
2. **Frequency of calls**: Call once on module load (not on every filter change). Cache the result in `state` for the session.
3. **Fortnightly patterns?** Could add a Signal 4 later. Out of scope for now.

---

## Phases

| Phase | Scope |
|---|---|
| BE | `getSuggestedTransactions` action in GAS — all 3 signals |
| FE | Collapsible suggestions panel, cards, dismiss, pre-fill on Add |
