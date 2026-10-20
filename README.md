# Campfire income statement

A TypeScript app for Northwind Coffee Roasters: React frontend, Express backend,
and a local JSON ledger. Pick any inclusive date range to see income and expenses.

## Run on a Mac

Install **Node.js 22.22.0** (includes npm), then run these commands from the project
folder containing `package.json`:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The backend runs at **http://127.0.0.1:3001**.
No database, API keys, or environment setup needed. Ctrl+C stops both servers.

To run them separately, use two terminals in the project folder:

```sh
npm run dev:server  # Terminal 1: backend
npm run dev:client  # Terminal 2: frontend
```

## Check

```sh
npm test           # All tests
npm run typecheck  # TypeScript checks
npm run build      # Frontend production build
```

Verified versions: Node.js **22.22.0**, npm **10.9.4**, TypeScript **7.0.2**,
React **19.3.1**, Express **5.3.0**, Vite **8.3.4**, Vitest **5.0.5**.
`package-lock.json` pins dependencies.

## Project structure

```text
data/                  Original ledger and Git-ignored local journal changes
src/
  client/              React entry point, application state, and styles
    components/        Statement, account drilldowns, journal browser and editor
    utils/             HTTP requests, form validation, money/date display
  server/              API startup and Express application setup
    routes/            HTTP parameters, request bodies, and responses
    domain/            Accounting calculations and journal posting rules
    data/              Ledger validation, snapshots, and file persistence
  shared/              Client/server data types and exact money helpers
tests/                 Accounting, validation, API, storage, and client utility tests
```

Key files to follow:

| File                                                                | Responsibility                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [client/main.tsx](src/client/main.tsx)                              | Mount React into the root element in `index.html`.                                           |
| [client/App.tsx](src/client/App.tsx)                                | Navigation, applied reporting dates, loading/errors, and refresh after saves.                |
| [server/startApi.ts](src/server/startApi.ts)                        | Open the ledger-backed app and start the API listener.                                       |
| [server/app.ts](src/server/app.ts)                                  | Assemble Express logging, JSON parsing, routers, and error handling.                         |
| [routes/reports.ts](src/server/routes/reports.ts)                   | Income statement and account activity HTTP endpoints.                                        |
| [routes/journalEntries.ts](src/server/routes/journalEntries.ts)     | Account chart and journal browse/read/create/update endpoints.                               |
| [domain/incomeStatement.ts](src/server/domain/incomeStatement.ts)   | Filter posted activity, classify accounts, apply signs, and calculate profits.               |
| [domain/accountActivity.ts](src/server/domain/accountActivity.ts)   | Return contributing journal lines and reconcile their account total.                         |
| [domain/journalEntries.ts](src/server/domain/journalEntries.ts)     | Validate complete journal writes, including balance and inactive-account rules.              |
| [domain/journalEntryList.ts](src/server/domain/journalEntryList.ts) | Validate browse filters, search journals, and sort results.                                  |
| [data/ledger.ts](src/server/data/ledger.ts)                         | Validate stored ledger structure and accounting integrity while preserving inactive history. |
| [data/ledgerRepository.ts](src/server/data/ledgerRepository.ts)     | Own in-memory state, serialize writes, check versions, and persist atomically.               |
| [shared/types.ts](src/shared/types.ts)                              | Define accounts, journal entries/lines, the ledger, and API response models.                 |
| [shared/money.ts](src/shared/money.ts)                              | Parse decimal strings into `bigint` cents and serialize exact amounts.                       |
| [vite.config.ts](vite.config.ts)                                    | Configure React development and proxy API requests to Express.                               |

The UI components are [IncomeStatement.tsx](src/client/components/IncomeStatement.tsx)
for report layout, [AccountActivity.tsx](src/client/components/AccountActivity.tsx)
for drilldowns, [JournalEntries.tsx](src/client/components/JournalEntries.tsx) for
browsing, and [JournalEntryEditor.tsx](src/client/components/JournalEntryEditor.tsx)
for creating and editing complete balanced entries.

Read flow: React → Vite proxy → report route → repository snapshot → pure accounting
function → JSON response. The domain functions receive data and return results
without changing storage.

Write flow: the journal editor sends POST/PUT → repository validates a candidate
ledger → temporary-file write and rename → publish the new in-memory snapshot.
The UI refreshes after success; failed saves preserve the form and stored data.

## Data and optional features

The default period is Q1 2026. Journal changes save to `data/ledger.local.json`;
the supplied `data/ledger.json` stays unchanged. To restore the original data,
stop the server, run `npm run db:reset`, then restart. This deletes local edits.

`npm run dev:extended` enables account drilldowns. Stop the current servers before
switching modes. Journal browsing and editing work in both modes.

See [NOTES.md](NOTES.md) for accounting decisions and results, and
[tests/README.md](tests/README.md) for test details.
