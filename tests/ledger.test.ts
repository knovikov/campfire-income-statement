import { describe, expect, it } from "vitest";
import { ledger, validateLedger } from "../src/server/data/ledger";

describe("ledger integrity validation", () => {
  it("accepts the supplied balanced ledger", () => {
    expect(() => validateLedger(ledger)).not.toThrow();
  });

  it("identifies duplicate account numbers", () => {
    const malformed = structuredClone(ledger);
    malformed.accounts.push({ ...malformed.accounts[0] });
    expect(() => validateLedger(malformed)).toThrow(/1000/);
  });

  it("identifies duplicate journal IDs", () => {
    const malformed = structuredClone(ledger);
    malformed.journal_entries.push(
      structuredClone(malformed.journal_entries[0]),
    );
    expect(() => validateLedger(malformed)).toThrow(/JE-001/);
  });

  it("identifies the entry containing an unknown account reference", () => {
    const malformed = structuredClone(ledger);
    malformed.journal_entries[0].lines[0].account = "9999";
    expect(() => validateLedger(malformed)).toThrow(
      /JE-001.*9999|9999.*JE-001/,
    );
  });

  it("rejects invalid monetary strings without rounding them", () => {
    const malformed = structuredClone(ledger);
    malformed.journal_entries[0].lines[0].debit = "5000.001";
    expect(() => validateLedger(malformed)).toThrow(/JE-001/);
  });

  it("detects a one-cent journal imbalance exactly", () => {
    const malformed = structuredClone(ledger);
    malformed.journal_entries[0].lines[0].debit = "5000.01";
    expect(() => validateLedger(malformed)).toThrow(/JE-001/);
  });

  it("checks draft entries too, before they could become posted", () => {
    const malformed = structuredClone(ledger);
    malformed.journal_entries[18].lines[0].debit = "5000.01";
    expect(() => validateLedger(malformed)).toThrow(/JE-019/);
  });

  it("rejects impossible accounting dates with the journal ID", () => {
    const malformed = structuredClone(ledger);
    malformed.journal_entries[0].date = "2026-02-29";
    expect(() => validateLedger(malformed)).toThrow(/JE-001/);
  });

  it("rejects negative debits and lines populated on both sides", () => {
    const negative = structuredClone(ledger);
    negative.journal_entries[0].lines[0].debit = "-5000.00";
    expect(() => validateLedger(negative)).toThrow(/JE-001/);

    const bothSides = structuredClone(ledger);
    bothSides.journal_entries[0].lines[0].credit = "1.00";
    expect(() => validateLedger(bothSides)).toThrow(/JE-001/);
  });

  it("validates required fields and account classifications at the JSON boundary", () => {
    expect(() => validateLedger(null)).toThrow();
    expect(() =>
      validateLedger({ company: "Incomplete", currency: "USD" }),
    ).toThrow();
    expect(() =>
      validateLedger({
        ...ledger,
        accounts: [{ ...ledger.accounts[0], type: "unknown" }],
      }),
    ).toThrow();
    expect(() =>
      validateLedger({
        ...ledger,
        journal_entries: [{ ...ledger.journal_entries[0], memo: undefined }],
      }),
    ).toThrow();
  });
});
