import { Router } from "express";
import type { Request } from "express";
import type { Ledger } from "../../shared/types";
import { DateValidationError, validateDateRange } from "../domain/dates";
import { buildIncomeStatement } from "../domain/incomeStatement";
import { buildAccountActivity } from "../domain/accountActivity";

function readDateRange(request: Request): { start: string; end: string } {
  const { start, end } = request.query;
  if (typeof start !== "string" || typeof end !== "string") {
    throw new DateValidationError(
      "Provide one start and one end date in YYYY-MM-DD format.",
    );
  }
  validateDateRange(start, end);
  return { start, end };
}

export function createReportRouter(ledger: Ledger): Router {
  const router = Router();

  router.get("/income-statement", (request, response) => {
    const { start, end } = readDateRange(request);
    response.json(buildIncomeStatement(ledger, start, end));
  });

  router.get("/accounts/:accountNumber/activity", (request, response) => {
    const { start, end } = readDateRange(request);
    response.json(
      buildAccountActivity(ledger, request.params.accountNumber, start, end),
    );
  });

  return router;
}
