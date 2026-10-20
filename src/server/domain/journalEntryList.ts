import type { Account, JournalEntry } from "../../shared/types";
import { validateAccountingDate, validateDateRange } from "./dates";
import { JournalEntryError } from "./journalEntries";

function optionalString(
  query: Record<string, unknown>,
  name: string,
): string | undefined {
  if (!Object.hasOwn(query, name)) {
    return undefined;
  }
  const value = query[name];
  if (typeof value !== "string") {
    throw new JournalEntryError(400, `Provide at most one ${name} string.`);
  }
  return value;
}

/** Browse all statuses and dates by default; supplied filters combine with AND. */
export function listJournalEntries(
  entries: JournalEntry[],
  accounts: Account[],
  query: Record<string, unknown> = {},
): JournalEntry[] {
  const unknown = Object.keys(query).find(
    (name) => !["start", "end", "status", "q"].includes(name),
  );
  if (unknown) {
    throw new JournalEntryError(400, `Unknown journal filter: ${unknown}.`);
  }
  const start = optionalString(query, "start");
  const end = optionalString(query, "end");
  const status = optionalString(query, "status");
  const search = optionalString(query, "q") ?? "";

  if (start !== undefined && end !== undefined) {
    validateDateRange(start, end);
  } else {
    if (start !== undefined) validateAccountingDate(start);
    if (end !== undefined) validateAccountingDate(end);
  }
  if (
    status !== undefined &&
    status !== "posted" &&
    status !== "draft" &&
    status !== "void"
  ) {
    throw new JournalEntryError(400, "Status must be posted, draft, or void.");
  }
  if (search.length > 200) {
    throw new JournalEntryError(
      400,
      "Search text must contain at most 200 characters.",
    );
  }

  const needle = search.trim().toLowerCase();
  const accountNames = new Map(
    accounts.map((account) => [account.number, account.name.toLowerCase()]),
  );
  return entries
    .filter((entry) => {
      if (start !== undefined && entry.date < start) return false;
      if (end !== undefined && entry.date > end) return false;
      if (status !== undefined && entry.status !== status) return false;
      return (
        needle === "" ||
        entry.id.toLowerCase().includes(needle) ||
        entry.memo.toLowerCase().includes(needle) ||
        entry.lines.some(
          (line) =>
            line.account.toLowerCase().includes(needle) ||
            accountNames.get(line.account)?.includes(needle),
        )
      );
    })
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        left.id.localeCompare(right.id, "en", { numeric: true }),
    );
}
