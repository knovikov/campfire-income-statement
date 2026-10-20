import { ledger } from "../src/server/data/ledger";
import type { JournalEntry, Ledger } from "../src/shared/types";

/** Original account chart, with only the journal entries a test explicitly supplies. */
export function ledgerWith(...entries: JournalEntry[]): Ledger {
  return {
    company: "Test Coffee",
    currency: "USD",
    accounts: structuredClone(ledger.accounts),
    journal_entries: structuredClone(entries),
  };
}

/** A balanced 10.01 cash sale. Override fields at the call site for other cases. */
export function saleEntry(
  id = "NEW-SALE",
  fields: Partial<JournalEntry> = {},
): JournalEntry {
  return {
    id,
    date: "2026-03-31",
    status: "posted",
    memo: "A small sale",
    lines: [
      { account: "1000", debit: "10.01", credit: "0.00" },
      { account: "4000", debit: "0.00", credit: "10.01" },
    ],
    ...fields,
  };
}
