import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Ledger } from "../shared/types";
import { ledger } from "./data/ledger";
import { DateValidationError } from "./domain/dates";
import { AccountNotFoundError } from "./domain/accountActivity";
import { createReportRouter } from "./routes/reports";
import { createJournalRouter } from "./routes/journalEntries";
import { JournalEntryError } from "./domain/journalEntries";
import {
  createMemoryLedgerRepository,
  LedgerLoadError,
  openLedgerRepository,
} from "./data/ledgerRepository";
import type { LedgerRepository } from "./data/ledgerRepository";

/** Create the HTTP app without opening a port, so requests can be tested in isolation. */
export function createApp(
  source: Ledger | LedgerRepository | LedgerLoadError = ledger,
) {
  const app = express();
  app.disable("x-powered-by");
  // Register before the routes so every completed response, including errors, is logged.
  app.use((request, response, next) => {
    const startedAt = performance.now();
    response.once("finish", () => {
      const elapsedMs = (performance.now() - startedAt).toFixed(1);
      console.info(
        `${request.method} ${request.originalUrl} ${response.statusCode} ${elapsedMs} ms`,
      );
    });
    next();
  });
  if (source instanceof LedgerLoadError) {
    // Keep the API available to explain the data failure instead of a proxy error.
    app.use((_request, _response, next) => next(source));
  } else {
    const repository =
      "snapshot" in source ? source : createMemoryLedgerRepository(source);
    app.use(express.json({ limit: "64kb" }));
    app.use(createJournalRouter(repository));
    app.use(createReportRouter(repository));
  }
  app.use((_request, response) => {
    response.status(404).json({ error: "Route not found." });
  });
  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof LedgerLoadError) {
        response.status(503).json({ error: error.message });
        return;
      }
      if (error instanceof JournalEntryError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      if (typeof error === "object" && error !== null && "type" in error) {
        if (error.type === "entity.parse.failed") {
          response
            .status(400)
            .json({ error: "Send a valid JSON request body." });
          return;
        }
        if (error.type === "entity.too.large") {
          response.status(413).json({
            error:
              "Journal entry is too large. Use a request smaller than 64 KB.",
          });
          return;
        }
      }
      if (error instanceof DateValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof AccountNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      console.error("Unable to complete API request:", error);
      response
        .status(500)
        .json({ error: "Unable to complete the request. Please try again." });
    },
  );
  return app;
}

/** Start in a readable failure state when stored data cannot safely be loaded. */
export async function createAppFromLedgerFile(filePath: string) {
  try {
    return createApp(await openLedgerRepository(filePath));
  } catch (error) {
    if (!(error instanceof LedgerLoadError)) throw error;
    console.error("Unable to load stored ledger:", error);
    return createApp(error);
  }
}
