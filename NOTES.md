# Implementation notes

**Original ledger, Q1 2026 (January 1–March 31): −$44,480.14 net income.**

$37,850.50 revenue − $14,272.75 COGS − $68,100.07 operating expenses + $42.18 other income = **−$44,480.14**.
Monthly net income: January **−$21,529.65**; February **−$13,230.25**; March **−$9,720.24**.

## Rules and edge cases

- **Money:** exact `bigint` cents; decimal-string API/display, parentheses for negatives. Cover integers, one/two decimals, zero/negative/30,000-digit amounts, and huge-value cancellation preserving cents. Reject invalid/overprecision amounts; 64 KB request limit.
- **Dates:** strict calendar dates/leap years; inclusive and single-day ranges. Missing/impossible/reversed dates fail. No timezone conversion or prior-period P&L carryover.
- **Signs/classification:** posted only; type controls signs, subtype controls sections. Revenue = credits − debits; expenses = debits − credits. Preserve contra-revenue/negative expenses; exclude balance-sheet lines, including mixed entries.
- **Recorded timing:** $12,000 subscription billing stays deferred; three $1,000 recognitions earn revenue. Receivable collection adds no revenue. All $9,000 rent stays on January 1. No memo-driven adjustments.
- **Dataset checks:** marketing $2,500.10; returns −$800.25; software $1,199.97 − $100 = $1,099.97; March’s three-line sale separates $15,000 revenue and −$150 discount.
- **Inactive accounts:** history survives deactivation; new/backdated inactive postings and draft posting fail entirely, naming the account. No deactivation date inferred.
- **Integrity:** validate every line: minimum two, one positive side, exact balance, valid references/classifications/dates, unique IDs/accounts. Atomic saves and version checks prevent partial writes/stale edits; rejection preserves stored data.
- **Reports/drilldowns:** empty periods retain sorted zero accounts. Every contributing posted line reconciles with account totals. Applied dates remain independent of unsaved inputs; edits refresh reports and preserve failed forms. `dev` forces drilldowns off; `dev:extended` forces them on.

## Evidence and limits

- **191 tests passed**, plus TypeScript, build, and source/test formatting. Accounting/date checks passed under UTC, Los Angeles, and Tokyo. Independent Python `Decimal` checks confirmed all 25 entries balance; fixed account/subtotal/month/day oracles supplement reconciliation, reversals, and reorderings.
- **Manual browser checks:** date labels, mobile layouts, loading/errors/retry, mode isolation, and corrupt-data failure/recovery. Rendered browser flows are not automated. See [test guide](tests/README.md).
- **Storage:** one API process, local JSON. Invalid/unreadable data returns an actionable 503, blocks writes, and stays untouched; repair then restart. Posted edits lack audit history. Balance sheets, pagination, and immutable corrections remain future work.
- **AI/scope:** Discussed in Codex voice mode first to lay out goals and ideas for edge cases to cover as well as basic tech choices. Passed down to Codex instance on my Mac Mini to implement it and take screenshots. Pushed to github and continued to iterate on solution using AI sidebar in VS Code, altering code, test cases and preparing for final submission.
