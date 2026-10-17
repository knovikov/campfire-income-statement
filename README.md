# Campfire income statement

A small TypeScript application that reports Northwind Coffee Roasters' recorded
income and expenses for an inclusive accounting-date range. Express loads the
supplied ledger into memory; React and Vite present the statement.

The original instructions, data dictionary, and ledger are preserved in
[ASSIGNMENT.md](ASSIGNMENT.md). See also the
[accounting primer](ACCOUNTING_PRIMER.md), [implementation notes](NOTES.md), and
[official assignment](https://github.com/Campfire-eng/income-statement-take-home).

## Requirements and installation

Use Node.js **22.12+ (22.x), 24.x, or 26+** and npm. Development used Node.js 26.3.0 and
npm 11.16.0. The lockfile records the exact dependency versions.

| Tool              | Installed version |
| ----------------- | ----------------- |
| TypeScript        | 7.0.2             |
| Express           | 5.3.0             |
| React / React DOM | 19.3.1            |
| Vite              | 8.3.4             |
| tsx               | 4.23.15           |
| Vitest            | 5.0.5             |
| Supertest         | 7.3.1             |
| Prettier          | 3.9.10            |

```sh
npm ci
```

## Run locally

Start the backend in one terminal:

```sh
npm run dev:server
```

Start the frontend in another terminal:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. The backend listens at
**http://127.0.0.1:3001**. Vite proxies report requests to Express, so the browser
uses the same origin. The default report covers January 1 through March 31, 2026.

`npm run start:server` starts the backend without watching for file changes.
If you change `PORT` for the backend, update the Vite proxy target to match.

## Check and build

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

`npm run test:watch` watches tests. `npm run format` applies Prettier formatting.
The frontend build is written to the ignored `dist/` directory. Development
requests require both servers running.

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

Journal entry dates are timezone-independent accounting calendar dates. Reporting
ranges use inclusive YYYY-MM-DD boundaries without timezone conversion.
Invalid, missing, repeated, or reversed date parameters return HTTP 400 with
`{"error":"..."}`. Empty valid periods return HTTP 200 with zero amounts.

Only posted revenue and expense lines contribute. Revenue is credits minus
debits; expenses are debits minus credits. Negative balances are preserved.
Inactive and zero-balance P&L accounts remain visible in account-number order.
Entries are reported as recorded: deferred billings are not automatically
recognized as revenue, and recorded rent is not spread across future months.

## Code map

The request flows from React's date form through the Vite proxy to
`routes/reports.ts`, then to the pure `buildIncomeStatement` calculation.
HTTP handling, accounting, and presentation are separate.

| File                                   | Responsibility                                                   |
| -------------------------------------- | ---------------------------------------------------------------- |
| `data/ledger.json`                     | Supplied chart of accounts and journal entries                   |
| `src/shared/types.ts`                  | Ledger and API models                                            |
| `src/server/index.ts`                  | Open the HTTP listening port                                     |
| `src/server/app.ts`                    | Create a testable Express app and handle errors                  |
| `src/server/routes/reports.ts`         | Read and validate report query parameters                        |
| `src/server/data/ledger.ts`            | Load JSON and fail fast on invalid or unbalanced data            |
| `src/server/domain/incomeStatement.ts` | Account signs, filtering, grouping, and totals                   |
| `src/server/domain/money.ts`           | Exact decimal parsing and serialization                          |
| `src/server/domain/dates.ts`           | Real calendar-date and range validation                          |
| `src/client/`                          | Date controls, request state, statement presentation, and CSS    |
| `tests/`                               | Real-ledger expectations and small synthetic accounting fixtures |

## Optional account activity

Account activity drill-down is an optional enhancement **disabled by default**.
To enable it, start the frontend with:

```sh
VITE_ENABLE_ACCOUNT_DRILLDOWN=true npm run dev
```

Restart the Vite development server after changing the environment variable.
Run `npm run dev` with the variable unset, or set it to `false`, to disable it.
There is no end-user toggle. Only the exact value `true` enables the feature.
`.env.example` documents the default; no environment file is required.

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
