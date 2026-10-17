import rawLedger from "../../../data/ledger.json";
import type { Ledger } from "../../shared/types";
import { validateAccountingDate } from "../domain/dates";
import { parseMoneyToCents } from "../domain/money";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isList(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const allowedSubtypes: Record<string, readonly string[]> = {
  asset: ["balance_sheet"],
  liability: ["balance_sheet"],
  equity: ["balance_sheet"],
  revenue: ["operating_revenue", "contra_revenue", "other_income"],
  expense: ["cogs", "operating_expense"],
};

/** Fail fast on malformed ledger data, unknown references, or unbalanced entries. */
export function validateLedger(value: unknown): asserts value is Ledger {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.company) ||
    !isNonEmptyString(value.currency)
  ) {
    throw new Error("Ledger must contain company and currency strings.");
  }
  if (!isList(value.accounts) || !isList(value.journal_entries)) {
    throw new Error("Ledger must contain accounts and journal_entries arrays.");
  }

  const accountNumbers = new Set<string>();
  for (const account of value.accounts) {
    if (
      !isRecord(account) ||
      !isNonEmptyString(account.number) ||
      !isNonEmptyString(account.name)
    ) {
      throw new Error("Every account requires a number and name.");
    }
    if (accountNumbers.has(account.number)) {
      throw new Error(`Duplicate account number ${account.number}.`);
    }
    if (
      typeof account.type !== "string" ||
      !Object.hasOwn(allowedSubtypes, account.type) ||
      typeof account.subtype !== "string" ||
      !allowedSubtypes[account.type].includes(account.subtype) ||
      typeof account.is_active !== "boolean"
    ) {
      throw new Error(
        `Account ${account.number} has invalid type, subtype, or is_active fields.`,
      );
    }
    accountNumbers.add(account.number);
  }

  const entryIds = new Set<string>();
  for (const entry of value.journal_entries) {
    if (!isRecord(entry) || !isNonEmptyString(entry.id)) {
      throw new Error("Every journal entry requires an id.");
    }
    const entryLabel = `Journal entry ${entry.id}`;
    if (entryIds.has(entry.id)) {
      throw new Error(`${entryLabel} has a duplicate id.`);
    }
    entryIds.add(entry.id);
    if (
      typeof entry.date !== "string" ||
      typeof entry.memo !== "string" ||
      (entry.status !== "posted" &&
        entry.status !== "draft" &&
        entry.status !== "void") ||
      !isList(entry.lines) ||
      entry.lines.length < 2
    ) {
      throw new Error(
        `${entryLabel} requires a date, memo, valid status, and at least two lines.`,
      );
    }
    try {
      validateAccountingDate(entry.date);
    } catch {
      throw new Error(
        `${entryLabel} has invalid accounting date ${entry.date}.`,
      );
    }

    let totalDebits = 0n;
    let totalCredits = 0n;
    for (const line of entry.lines) {
      if (
        !isRecord(line) ||
        typeof line.account !== "string" ||
        typeof line.debit !== "string" ||
        typeof line.credit !== "string"
      ) {
        throw new Error(
          `${entryLabel} contains a line missing account, debit, or credit strings.`,
        );
      }
      if (!accountNumbers.has(line.account)) {
        throw new Error(
          `${entryLabel} references unknown account ${line.account}.`,
        );
      }
      let debit: bigint;
      let credit: bigint;
      try {
        debit = parseMoneyToCents(line.debit);
        credit = parseMoneyToCents(line.credit);
      } catch {
        throw new Error(
          `${entryLabel}, account ${line.account}, contains an invalid monetary amount.`,
        );
      }
      if (debit < 0n || credit < 0n || (debit !== 0n && credit !== 0n)) {
        throw new Error(
          `${entryLabel}, account ${line.account}, requires nonnegative, single-sided amounts.`,
        );
      }
      totalDebits += debit;
      totalCredits += credit;
    }
    if (totalDebits !== totalCredits) {
      throw new Error(
        `${entryLabel} is unbalanced: debits do not equal credits.`,
      );
    }
  }
}

validateLedger(rawLedger);
export const ledger: Ledger = rawLedger;
