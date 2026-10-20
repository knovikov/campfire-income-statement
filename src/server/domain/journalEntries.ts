import type { Account, JournalEntry, JournalLine } from "../../shared/types";
import { validateAccountingDate } from "./dates";
import { formatCentsAsDecimal, parseMoneyToCents } from "./money";

export class JournalEntryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: string[],
): void {
  const unknown = Object.keys(value).find((field) => !allowed.includes(field));
  if (unknown) {
    throw new JournalEntryError(400, `Unknown journal field: ${unknown}.`);
  }
}

function lineKey(line: JournalLine): string {
  return JSON.stringify([
    line.account,
    formatCentsAsDecimal(parseMoneyToCents(line.debit)),
    formatCentsAsDecimal(parseMoneyToCents(line.credit)),
  ]);
}

/** Validate the entire replacement entry and normalize amounts before any write. */
export function normalizeJournalEntry(
  value: unknown,
  accounts: Account[],
  previous?: JournalEntry,
): JournalEntry {
  if (!isRecord(value)) {
    throw new JournalEntryError(400, "Journal entry must be an object.");
  }
  rejectUnknownFields(value, ["id", "date", "status", "memo", "lines"]);
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id)) {
    throw new JournalEntryError(
      400,
      "Entry ID must start with a letter or digit and contain 1–80 letters, digits, underscores, hyphens, or periods.",
    );
  }
  if (previous && id !== previous.id) {
    throw new JournalEntryError(
      400,
      "An existing entry's ID cannot be changed.",
    );
  }
  if (typeof value.date !== "string") {
    throw new JournalEntryError(400, "Entry date must use YYYY-MM-DD format.");
  }
  try {
    validateAccountingDate(value.date);
  } catch (error) {
    throw new JournalEntryError(
      400,
      error instanceof Error ? error.message : "Entry date is invalid.",
    );
  }
  if (typeof value.memo !== "string") {
    throw new JournalEntryError(400, "Entry memo must be a string.");
  }
  const status = value.status;
  if (status !== "posted" && status !== "draft" && status !== "void") {
    throw new JournalEntryError(
      400,
      "Entry status must be posted, draft, or void.",
    );
  }
  if (!Array.isArray(value.lines) || value.lines.length < 2) {
    throw new JournalEntryError(
      400,
      "An entry requires at least two journal lines.",
    );
  }

  const accountsByNumber = new Map(
    accounts.map((account) => [account.number, account]),
  );
  // A multiset permits reordering existing inactive lines, but not duplicating them.
  const historicalLines = new Map<string, number>();
  for (const line of previous?.lines ?? []) {
    const key = lineKey(line);
    historicalLines.set(key, (historicalLines.get(key) ?? 0) + 1);
  }

  let totalDebits = 0n;
  let totalCredits = 0n;
  const lines = value.lines.map(
    (value: unknown, index: number): JournalLine => {
      const label = `Journal line ${index + 1}`;
      if (
        !isRecord(value) ||
        typeof value.account !== "string" ||
        typeof value.debit !== "string" ||
        typeof value.credit !== "string"
      ) {
        throw new JournalEntryError(
          400,
          `${label} requires account, debit, and credit strings.`,
        );
      }
      rejectUnknownFields(value, ["account", "debit", "credit"]);
      const account = accountsByNumber.get(value.account);
      if (!account) {
        throw new JournalEntryError(
          400,
          `${label} references unknown account ${value.account}.`,
        );
      }
      let debit: bigint;
      let credit: bigint;
      try {
        debit = parseMoneyToCents(value.debit);
        credit = parseMoneyToCents(value.credit);
      } catch {
        throw new JournalEntryError(
          400,
          `${label} contains an invalid monetary amount.`,
        );
      }
      if (debit < 0n || credit < 0n || (debit !== 0n && credit !== 0n)) {
        throw new JournalEntryError(
          400,
          `${label} requires nonnegative, single-sided amounts.`,
        );
      }
      if (debit === 0n && credit === 0n) {
        throw new JournalEntryError(
          400,
          `${label} requires a positive debit or credit.`,
        );
      }
      const line = {
        account: account.number,
        debit: formatCentsAsDecimal(debit),
        credit: formatCentsAsDecimal(credit),
      };
      if (!account.is_active) {
        const key = lineKey(line);
        const remaining = historicalLines.get(key) ?? 0;
        if (
          remaining === 0 ||
          (status === "posted" && previous?.status !== "posted")
        ) {
          throw new JournalEntryError(
            400,
            `Cannot post new or changed lines to inactive account ${account.number}.`,
          );
        }
        historicalLines.set(key, remaining - 1);
      }
      totalDebits += debit;
      totalCredits += credit;
      return line;
    },
  );
  if (totalDebits !== totalCredits) {
    throw new JournalEntryError(
      400,
      "Entry is unbalanced: debits must equal credits.",
    );
  }

  return { id, date: value.date, status, memo: value.memo, lines };
}
