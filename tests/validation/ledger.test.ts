import { describe, expect, it } from "vitest";
import { ledger, validateLedger } from "../../src/server/data/ledger";
import { ledgerWith, saleEntry } from "../fixtures";

describe("ledger integrity validation", () => {
  const sale = saleEntry("SALE");
  const [debit, credit] = sale.lines;

  it("accepts the complete supplied ledger", () => {
    expect(() => validateLedger(ledger)).not.toThrow();
  });

  it("identifies duplicate account numbers", () => {
    const source = ledgerWith();
    source.accounts.push({ ...source.accounts[0] });
    expect(() => validateLedger(source)).toThrow(/1000/);
  });

  it("identifies duplicate journal IDs", () => {
    expect(() => validateLedger(ledgerWith(sale, sale))).toThrow(/SALE/);
  });

  it.each([0, 1])("rejects a source journal with %i lines", (count) => {
    const source = ledgerWith({ ...sale, lines: sale.lines.slice(0, count) });
    expect(() => validateLedger(source)).toThrow(/SALE.*at least two lines/);
  });

  const invalidEntries: [string, object, RegExp][] = [
    [
      "unknown account",
      { lines: [{ ...debit, account: "9999" }, credit] },
      /SALE.*9999/,
    ],
    [
      "rounding-requiring amount",
      { lines: [{ ...debit, debit: "10.001" }, credit] },
      /SALE/,
    ],
    [
      "one-cent imbalance",
      { lines: [{ ...debit, debit: "10.02" }, credit] },
      /SALE/,
    ],
    [
      "unbalanced draft",
      { status: "draft", lines: [{ ...debit, debit: "10.02" }, credit] },
      /SALE/,
    ],
    ["impossible date", { date: "2026-02-29" }, /SALE/],
    [
      "negative debit",
      { lines: [{ ...debit, debit: "-10.01" }, credit] },
      /SALE/,
    ],
    [
      "both debit and credit",
      { lines: [{ ...debit, credit: "1.00" }, credit] },
      /SALE/,
    ],
  ];
  it.each(invalidEntries)(
    "names the journal containing %s",
    (_name, fields, error) => {
      const source = {
        ...ledgerWith(),
        journal_entries: [{ ...sale, ...fields }],
      };
      expect(() => validateLedger(source)).toThrow(error);
    },
  );

  it.each([
    ["null ledger", null],
    ["missing lists", { company: "Incomplete", currency: "USD" }],
    [
      "unknown account type",
      {
        ...ledgerWith(),
        accounts: [{ ...ledger.accounts[0], type: "unknown" }],
      },
    ],
    [
      "missing memo",
      { ...ledgerWith(), journal_entries: [{ ...sale, memo: undefined }] },
    ],
  ])("rejects %s at the JSON boundary", (_name, source) => {
    expect(() => validateLedger(source)).toThrow();
  });
});
