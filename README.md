# Campfire income statement

A small TypeScript application that reports Northwind Coffee Roasters' recorded
income and expenses for an inclusive accounting-date range. Express loads the
ledger into memory and atomically persists journal changes to a local JSON file;
React and Vite present the statement.

The original instructions, data dictionary, and ledger are preserved in
[ASSIGNMENT.md](ASSIGNMENT.md). See also the
[accounting primer](ACCOUNTING_PRIMER.md), [implementation notes](NOTES.md), and
[official assignment](https://github.com/Campfire-eng/income-statement-take-home).

## Requirements and installation

Use Node.js **22.12+ (22.x), 24.x, or 26+** and npm. Development used Node.js 26.3.0 and
npm 11.16.0. The lockfile records the exact dependency versions.
The simplified startup and test suite were also verified with Node.js 22.22.0
and npm 10.9.4.

| Tool              | Installed version |
| ----------------- | ----------------- |
| TypeScript        | 7.0.2             |
| Express           | 5.3.0             |
| React / React DOM | 19.3.1            |
| Vite              | 8.3.4             |
| tsx               | 4.23.15           |
| Vitest            | 5.0.5             |
| Vitest coverage   | 5.0.5             |
| Supertest         | 7.3.1             |
| Prettier          | 3.9.10            |
| concurrently      | 10.0.6            |

```sh
npm ci
```

## Run locally

Start the frontend and API together in one terminal:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. The backend listens at
**http://127.0.0.1:3001**. Vite proxies report requests to Express, so the browser
uses the same origin. The default report covers January 1 through March 31, 2026.
Press **Ctrl+C** to stop both processes. Output is labeled `web` and `api`.
Every completed API request is logged automatically with its method, full URL
(including the reporting dates), final HTTP status, and elapsed milliseconds:

```text
[api] GET /income-statement?start=2026-01-01&end=2026-03-31 200 1.2 ms
```

The middleware also logs account activity, validation errors, unknown routes,
and server errors. Newly added API routes get the same logging automatically.

Use `npm run dev:extended` to enable income-statement account drilldowns and their
inline journal editor. Both commands start the same API and web servers;
`dev` explicitly disables drilldown, while `dev:extended` explicitly enables it.
They override inherited shell and `.env` flag values for their child processes.
Stop the running mode with Ctrl+C before starting another. Journal browsing and
creation are available in both modes.

For debugging, run `npm run dev:server` and `npm run dev:client` separately in
two terminals. `dev:client` starts only Vite and requires the API to be running.

`npm run start:server` starts the backend without watching for file changes.
Set `PORT` to change the API port; the combined command also uses it for Vite's proxy.

## Check and build

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

`npm run test:watch` watches tests. `npm run format` applies Prettier formatting.
The frontend build is written to the ignored `dist/` directory.

The suite includes exact money parsing and formatting, ledger validation,
accounting signs and recorded activity, period reconciliation, inclusive date
boundaries, and HTTP errors. To check timezone independence:

```sh
TZ=Etc/UTC npm test
TZ=America/Los_Angeles npm test
TZ=Asia/Tokyo npm test
```

## API and accounting contract

```sh
curl 'http://127.0.0.1:3001/income-statement?start=2026-01-01&end=2026-03-31'
```

The response contains `company`, `currency`, `start_date`, `end_date`, account
lists and subtotals for `revenue`, `cost_of_goods_sold`, `operating_expenses`,
and `other_income`, plus `gross_profit`, `operating_income`, and `net_income`.
Each account has `account_number`, `account_name`, and `amount`.

Every monetary response value is an **exact signed decimal string with two
fractional digits**, for example `"1099.97"`, `"-650.25"`, or `"0.00"`.
Internally, calculations use `bigint` integer cents. Decimal input is parsed
directly without `Number` or floating-point rounding; more than two fractional
digits are rejected. The frontend adds grouping separators and parentheses
directly to these strings.

Money has no fixed 32-bit or 64-bit ceiling: `bigint` supports exact amounts and
intermediate totals beyond those boundaries, within runtime resource limits.
Send monetary inputs as decimal strings; JSON numbers are rejected with HTTP 400.
The existing 64 KB request-body limit applies to both creates and edits; larger
payloads return HTTP 413 with an explanatory message and leave saved data unchanged.
The editor displays API errors while keeping the unsaved form available to correct.

Journal entry dates are timezone-independent accounting calendar dates. Reporting
ranges use inclusive YYYY-MM-DD boundaries without timezone conversion.
Invalid, missing, repeated, or reversed date parameters return HTTP 400 with
`{"error":"..."}`. Empty valid periods return HTTP 200 with zero amounts.

Only posted revenue and expense lines contribute. Revenue is credits minus
debits; expenses are debits minus credits. Negative balances are preserved.
Inactive and zero-balance P&L accounts remain visible in account-number order.
Entries are reported as recorded: deferred billings are not automatically
recognized as revenue, and recorded rent is not spread across future months.

## Browse journal entries

Switch between **Income statement** and **Journal entries** using the tabs above
the report. The journal tab includes posted, draft, and void entries across all
dates by default, independently of the income statement's reporting period.

Search by entry ID, description, account number, or account name. Optional date
and status filters are applied with **Apply filters**; **Clear filters** restores
the full ledger. Entries appear newest accounting date first. Expand **Show
details** for every debit/credit line and its account metadata, or use **Edit** to
open the existing complete-entry editor. Add entries from the **Journal entries** tab.
Tab changes are disabled while an editor is open to protect unsaved edits.

`GET /journal-entries` returns `{ "entries": [...] }`. Optional `start`, `end`,
`status` (`posted`, `draft`, `void`), and `q` parameters use inclusive dates and
case-insensitive literal search. Dates may be specified independently; when both
are present, start must not follow end. Repeated, structured, unknown, or invalid
parameters return 400. Search is limited to 200 characters. An empty result is
200 with an empty list. This small local ledger is returned without pagination.

## Add and edit journal entries

Use **Add journal entry** in the **Journal entries** tab. Choose an ID, accounting date, status,
description, and at least two lines. Accounts are grouped by their type; the
selected account determines its classification. Enter a positive debit or credit
on each line. Exact debit and credit totals must balance before saving.
There is no fixed maximum line count; API request bodies are limited to 64 KB.

With account activity enabled, each activity line has an **Edit** button. It opens
the complete entry in place, including balancing lines from other accounts.
All lines save together. IDs cannot be changed after creation. Cancel discards
the form; failed saves retain it. Other editing and period controls are disabled
while the form is open so an unfinished edit cannot be lost during a report change.

Successful saves refresh the applied report period and every expanded account.
Draft/void entries and entries dated outside that period do not contribute;
the report's success notice explains this. Reopen entries from the **Journal entries**
tab or an account's activity drilldown.

| Endpoint                   | Contract                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `GET /accounts`            | `{ "accounts": [...] }`, including account type and activity status                  |
| `GET /journal-entries`     | `{ "entries": [...] }`, with optional date, status, and search filters               |
| `GET /journal-entries/:id` | `{ "entry": {...}, "version": "..." }`                                               |
| `POST /journal-entries`    | Full entry body; returns 201, the entry/version, and a `Location` header             |
| `PUT /journal-entries/:id` | `{ "entry": {...}, "version": "loaded-version" }`; returns the updated entry/version |

Example create body:

```json
{
  "id": "JE-026",
  "date": "2026-03-25",
  "status": "posted",
  "memo": "Additional coffee sale",
  "lines": [
    { "account": "1000", "debit": "25.10", "credit": "0.00" },
    { "account": "4000", "debit": "0.00", "credit": "25.10" }
  ]
}
```

IDs are case-sensitive, trimmed, and contain 1–80 characters: first a letter or
digit, then letters, digits, `_`, `-`, or `.`. Unknown fields, invalid dates or
accounts, negative/double-sided/zero lines, or unbalanced totals return 400.
Duplicate IDs and stale versions return 409; unknown entries return 404.
Malformed JSON returns 400; bodies over 64 KB return 413. Errors use `{ "error": "..." }`.
Reloading after a stale-version error explicitly discards the unsaved form.

Inactive accounts cannot receive new or changed lines. Existing inactive lines
may be retained unchanged while editing a historical entry; they cannot be newly
posted by moving a draft/void entry to posted.

Routes call a ledger repository for reads and writes. Each write is serialized,
validated against the latest ledger, and saved through a temporary file plus
atomic rename before it becomes visible to reports. A failed save leaves memory
unchanged. This local app supports one API process per writable ledger file.

`data/ledger.json` is the unchanged original fixture. Successful writes create
the Git-ignored `data/ledger.local.json`, which survives restarts. `LEDGER_FILE`
can select another local file. To restore the supplied data, stop the API, run
`npm run db:reset`, then restart `npm run dev`. Reset clears local journal changes.

## Tests

See [the test guide](tests/README.md) for coverage by behavior, focused commands,
and a browser smoke checklist. Run `npm run test:coverage` for a terminal summary
and an HTML report at `coverage/index.html`. The report includes React components
and the server entry point, even though the automated suite does not execute them.
High calculation coverage does not establish browser interaction coverage.

## Code map

The request flows from React's date form through the Vite proxy to
`routes/reports.ts`, then to the pure `buildIncomeStatement` calculation.
HTTP handling, accounting, and presentation are separate.

| File                                   | Responsibility                                                           |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `data/ledger.json`                     | Supplied chart of accounts and journal entries                           |
| `src/shared/types.ts`                  | Ledger and API models                                                    |
| `src/server/index.ts`                  | Open the HTTP listening port                                             |
| `src/server/app.ts`                    | Create a testable Express app and handle errors                          |
| `src/server/routes/reports.ts`         | Read and validate report query parameters                                |
| `src/server/data/ledger.ts`            | Load JSON and fail fast on invalid or unbalanced data                    |
| `src/server/data/ledgerRepository.ts`  | Read snapshots, check versions, serialize writes, and persist atomically |
| `src/server/domain/journalEntries.ts`  | Validate complete journal-entry mutations                                |
| `src/server/routes/journalEntries.ts`  | Account metadata and journal read/create/update HTTP endpoints           |
| `src/server/domain/incomeStatement.ts` | Account signs, filtering, grouping, and totals                           |
| `src/server/domain/money.ts`           | Exact decimal parsing and serialization                                  |
| `src/server/domain/dates.ts`           | Real calendar-date and range validation                                  |
| `src/client/`                          | Date controls, request state, statement presentation, and CSS            |
| `src/client/utils/requestJson.ts`      | Shared HTTP and unreadable-response error handling                       |
| `tests/`                               | Real-ledger expectations and small synthetic accounting fixtures         |

## Optional account activity

Account activity drill-down is an optional enhancement. Start the extended mode with:

```sh
npm run dev:extended
```

Stop the current process before switching modes.
Run `npm run dev` for the basic mode. It explicitly sets the flag to `false`,
even if the same terminal or a `.env` file has it enabled. Neither command changes
your shell environment or writes the flag to a file.
There is no end-user toggle. Only the exact value `true` enables the feature.
`.env.example` documents the build-time flag; development modes require no environment file.

When enabled, account-name buttons expand a small journal-line table. Activity is
requested only on expansion and uses the successfully loaded reporting period.
Changing that period resets expansions. With the flag off, there are no expansion
controls and no account activity requests.

```sh
curl 'http://127.0.0.1:3001/accounts/6200/activity?start=2026-01-01&end=2026-03-31'
```

`src/server/domain/accountActivity.ts` returns account metadata, period, `total`,
and `activity` lines containing `journal_id`, `date`, `memo`, `debit`, `credit`,
and signed `impact`. All money uses the same two-decimal string contract. Each
matching line is preserved, ordered by date then journal ID, with original line
order retained within an entry. Unknown accounts return 404; invalid dates return
400; known accounts without period activity return an empty list and `"0.00"`.

The API accepts every known chart account using its normal debit/credit balance;
the UI exposes income-statement accounts only. This frontend build-time flag
controls UI exposure, **not backend access authorization**. The activity endpoint
remains registered, and the income-statement calculation does not depend on the flag.
