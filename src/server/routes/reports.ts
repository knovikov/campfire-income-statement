import { Router } from "express";
import type { Request } from "express";
import type { LedgerRepository } from "../data/ledgerRepository";
import { DateValidationError } from "../domain/dates";
import { buildIncomeStatement } from "../domain/incomeStatement";
import { buildAccountActivity } from "../domain/accountActivity";

function readDateRange(request: Request): { start: string; end: string } {
  const { start, end } = request.query;
  if (typeof start !== "string" || typeof end !== "string") {
    throw new DateValidationError(
      "Provide one start and one end date in YYYY-MM-DD format.",
    );
  }
  return { start, end };
}

export function createReportRouter(repository: LedgerRepository): Router {
  const router = Router();

  router.get("/income-statement", (request, response) => {
    const { start, end } = readDateRange(request);
    response.json(buildIncomeStatement(repository.snapshot(), start, end));
  });

  router.get("/accounts/:accountNumber/activity", (request, response) => {
    const { start, end } = readDateRange(request);
    response.json(
      buildAccountActivity(
        repository.snapshot(),
        request.params.accountNumber,
        start,
        end,
      ),
    );
  });

  return router;
}
