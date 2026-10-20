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

## Data and optional features

The default period is Q1 2026. Journal changes save to `data/ledger.local.json`;
the supplied `data/ledger.json` stays unchanged. To restore the original data,
stop the server, run `npm run db:reset`, then restart. This deletes local edits.

`npm run dev:extended` enables account drilldowns. Stop the current servers before
switching modes. Journal browsing and editing work in both modes.

See [NOTES.md](NOTES.md) for accounting decisions and results,
[tests/README.md](tests/README.md) for test details, and
[ASSIGNMENT.md](ASSIGNMENT.md) for the original requirements.
