# Implementation notes

Q1 2026 (2026-01-01 through 2026-03-31) net income: **-44,480.14 USD**.
Revenue: 37,850.50; COGS: 14,272.75; gross profit: 23,577.75;
operating expenses: 68,100.07; operating income: -44,522.32; other income: 42.18.

## Decisions

- Journal entry dates are timezone-independent accounting calendar dates.
  Reporting ranges use inclusive YYYY-MM-DD boundaries without timezone conversion.
- Use exact `bigint` cents and signed, two-decimal JSON strings. Reject amounts
  requiring rounding; format money in the browser without floating point.
- Only posted revenue and expense activity contributes. Exclude draft/void
  entries and balance-sheet accounts. Keep inactive history and zero-balance
  accounts, sorted by account number.
- Revenue is credits minus debits; expenses are debits minus credits. Preserve
  negative contra-revenue and expense credits.
- Report entries as recorded: subscriptions count only when recognition is
  posted; all recorded rent is expensed January 1 without amortization.
- Validate required fields, classifications, references, dates, monetary
  strings, unique identifiers, and exact journal balance at startup.

## Verification and AI

Timezone checks covered UTC, Los Angeles, and Tokyo. The tests cover explicit
Q1 expectations, monthly additivity for every account/total, reversals, boundaries,
deferrals, signed credits, empty periods, malformed data, and large amounts.
Tests also check unsorted numeric account order and unreadable API responses;
`npm run test:coverage` includes untested React/startup code in its report.
Independent Python Decimal sums confirmed the supplied JSON is unchanged, all
25 entries balance, and monthly totals reconcile. Type checking and build pass.
Earlier Chrome checks covered desktop/mobile, both flags, period isolation, and
browser dates/totals in all three timezones. This pass checked combined startup,
shutdown, reports, activity, and an unreadable response after API disconnection.

AI helped write and review code, tests, and documentation. A synthetic test caught
an actual AI bug: parser-valid `"10.1"` was returned unchanged in activity
debit/credit fields. It now serializes as `"10.10"`. The original fixture alone
would not expose this contract error.

## Scope

The user lifted the original two-hour limit; do not describe this work as completed
within that limit. `npm run dev` forces optional drill-down off;
`npm run dev:extended` forces it on. This exposes UI, not API authorization.
Activity shares statement signs/filtering and reconciles to every P&L account.
Journal creation and inline entry editing are additional scope: exact balanced
whole-entry saves, unique immutable IDs, optimistic versions, and atomic local
JSON persistence. The supplied fixture remains unchanged; `db:reset` restores it.
No required functionality is unfinished. Next: period comparisons and CSV export.
A narrated candidate walkthrough remains to be recorded.
