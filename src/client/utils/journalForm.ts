import { formatCentsAsDecimal, parseMoneyToCents } from "../../shared/money";
import type { JournalEntry, JournalLine } from "../../shared/types";

/** Blank amount fields represent zero; nonblank values must be exact cents. */
function amountInCents(value: string): bigint {
  return parseMoneyToCents(value.trim() || "0");
}

export function getJournalTotals(lines: JournalLine[]) {
  try {
    return lines.reduce(
      (totals, line) => ({
        debits: totals.debits + amountInCents(line.debit),
        credits: totals.credits + amountInCents(line.credit),
      }),
      { debits: 0n, credits: 0n },
    );
  } catch {
    return null;
  }
}

/** Catch common form errors before sending; the server validates again on save. */
export function prepareJournalEntry(entry: JournalEntry): JournalEntry {
  if (!entry.id.trim()) throw new Error("Enter a unique journal entry ID.");
  if (!entry.date) throw new Error("Choose an accounting date.");
  if (entry.lines.length < 2) {
    throw new Error("A journal entry needs at least two lines.");
  }
  const lines = entry.lines.map((line, index) => {
    const label = `Line ${index + 1}`;
    if (!line.account) throw new Error(`${label}: choose an account.`);
    let debit: bigint;
    let credit: bigint;
    try {
      debit = amountInCents(line.debit);
      credit = amountInCents(line.credit);
    } catch {
      throw new Error(
        `${label}: use decimal amounts with at most two fractional digits.`,
      );
    }
    if (debit < 0n || credit < 0n) {
      throw new Error(`${label}: amounts cannot be negative.`);
    }
    if ((debit === 0n && credit === 0n) || (debit > 0n && credit > 0n)) {
      throw new Error(`${label}: enter a positive debit or credit, not both.`);
    }
    return {
      account: line.account,
      debit: formatCentsAsDecimal(debit),
      credit: formatCentsAsDecimal(credit),
    };
  });
  const totals = getJournalTotals(lines)!;
  if (totals.debits !== totals.credits) {
    throw new Error("Total debits must equal total credits before saving.");
  }
  return { ...entry, id: entry.id.trim(), lines };
}
