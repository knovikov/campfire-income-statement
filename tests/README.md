# Test guide

Run commands from the repository root. `npm test` runs everything;
`npm run test:watch` reruns tests while editing.

## Where to look

Each folder answers a different question. Read the `it(...)` names for the
individual scenarios; tables name the input or validation rule that failed.

| Folder        | File                        | Coverage                                                                                                                                                           |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accounting/` | `incomeStatement.test.ts`   | Independently summed Q1 accounts and profits; monthly reconciliation; rent and deferrals; signs, reversals, posting/date boundaries, zero accounts, numeric order. |
|               | `accountActivity.test.ts`   | Recorded lines, signed impacts, ordering, normalization, inactive history, and reconciliation with every statement account.                                        |
|               | `money.test.ts`             | Exact cents, decimal syntax and serialization, negative values, and amounts beyond safe integers.                                                                  |
| `api/`        | `reports.test.ts`           | Report and activity response contracts, date query validation, and missing accounts.                                                                               |
|               | `journalBrowse.test.ts`     | All-history browsing; optional dates, status, literal search, combined filters, ordering, query errors, and freshness after writes.                                |
|               | `journalEntries.test.ts`    | Account chart; create/read/edit workflow; updated reports and activity; duplicate IDs, immutable IDs, and stale versions.                                          |
|               | `largeAmounts.test.ts`      | Beyond-64-bit totals, payload-sized decimal strings, reversal cancellation preserving cents, exact HTTP round trips, and rejected-input recovery.                  |
|               | `journalValidation.test.ts` | Invalid write payloads and edit versions; preserving inactive history while preventing new inactive postings.                                                      |
|               | `errors.test.ts`            | JSON errors, missing entries/routes, body limits, private server errors, and automatic request logs.                                                               |
| `storage/`    | `ledgerRepository.test.ts`  | Defensive copies, validation before persistence, failed-save rollback and retry, and visibility only after a save completes.                                       |
|               | `concurrency.test.ts`       | Duplicate creates, distinct creates, and competing edits using the same version.                                                                                   |
|               | `persistence.test.ts`       | File persistence across restarts and seeding without changing the original fixture.                                                                                |
| `validation/` | `dates.test.ts`             | Date-only syntax, calendar boundaries, leap years, and reversed ranges.                                                                                            |
|               | `ledger.test.ts`            | Startup data integrity: shape, classifications, unique IDs/accounts, references, money, dates, and balanced journals including drafts.                             |
| `client/`     | `formatting.test.ts`        | Accounting money display and timezone-independent date display.                                                                                                    |
|               | `journalForm.test.ts`       | Blank-side normalization, exact live totals, and actionable validation before sending a write.                                                                     |
|               | `requestJson.test.ts`       | Request options/cancellation, exact responses, server validation errors, and unreadable proxy responses.                                                           |

HTTP tests use real Express handlers through Supertest. Storage tests use
in-memory ledgers or cleaned-up OS temporary files. Nothing writes to the
project's working ledger.

## Run a focused check

```sh
npm test -- tests/accounting
npm test -- tests/api
npm test -- tests/storage
npm test -- tests/client/journalForm.test.ts
npm test -- tests/api/largeAmounts.test.ts
npm test -- -t 'sorts account numbers numerically'
```

## Keep new tests small

- Put calculation edge cases in `accounting/`; HTTP tests prove wiring and status
  codes without repeating the full Q1 calculation or every invalid calendar date.
- Use literal expected amounts. The Q1 reference must stay independent of the
  implementation; reconciliation alone can let consistently wrong arithmetic pass.
- `fixtures.ts` supplies an empty ledger with the real account chart and a balanced
  cash sale. Override fields where they matter; keep unusual journal lines visible
  in the test. Avoid a fixture framework that hides the example.
- Keep separate assertions for rollback, conflicts, and concurrency: a successful
  save does not establish those guarantees.

## Coverage and manual checks

`npm run test:coverage` creates `coverage/index.html`. All executable source is
included, so unmounted React components and startup code also appear as uncovered.
The suite exercises accounting, HTTP, storage, and client utilities; it does not
automate rendered UI, startup, hot reload, or process shutdown. Execution percentages
alone do not show whether assertions detect a bug.

After client or startup changes, check these in the browser with `npm run dev:extended`:

1. Both servers start. Q1 net income is `(44,480.14)` USD. On March 20 alone,
   Software is `(100.00)` and net income is `100.00`. Try an empty and reversed period.
2. Expand an account; lines match the applied period. Change the period; panels
   reset. Slow/failing requests keep the last report labeled correctly and allow retry.
3. Add and edit balanced entries; totals and open details refresh. Duplicate IDs,
   unbalanced entries, and failed saves preserve the form. Cancel discards an edit.
4. Save competing edits from two tabs; the stale editor shows a conflict and an
   explicit reload/discard option. Restart the API; successful edits remain.
5. Browse journal entries, search/filter/clear, expand details, and edit. Returning
   to the statement preserves its applied dates. Ctrl+C releases both server ports.

Use a separate `LEDGER_FILE` for manual QA to preserve working data. For date
changes, rerun with `TZ=Etc/UTC npm test` and `TZ=Asia/Tokyo npm test`.
After checking the extended mode, restart with `npm run dev` in the same terminal;
account drilldowns should be absent, even with an inherited enabled flag.
