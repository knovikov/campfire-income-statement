import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Ledger } from "../shared/types";
import { ledger } from "./data/ledger";
import { DateValidationError } from "./domain/dates";
import { AccountNotFoundError } from "./domain/accountActivity";
import { createReportRouter } from "./routes/reports";

/** Create the HTTP app without opening a port, so requests can be tested in isolation. */
export function createApp(sourceLedger: Ledger = ledger) {
  const app = express();
  app.disable("x-powered-by");
  app.use(createReportRouter(sourceLedger));
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
      if (error instanceof DateValidationError) {
        response.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof AccountNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }
      console.error("Unable to build financial report:", error);
      response
        .status(500)
        .json({ error: "Unable to generate the report. Please try again." });
    },
  );
  return app;
}
