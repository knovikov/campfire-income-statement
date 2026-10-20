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

  it("balances three-line entries exactly and catches a changed third line", () => {
    const source = ledgerWith(
      saleEntry("SPLIT", {
        lines: [
          { account: "1000", debit: "0.30", credit: "0" },
          { account: "4000", debit: "0", credit: "0.1" },
          { account: "4000", debit: "0", credit: "0.2" },
        ],
      }),
    );
    expect(() => validateLedger(source)).not.toThrow();

    source.journal_entries[0].lines[2].credit = "0.21";
    expect(() => validateLedger(source)).toThrow(/SPLIT.*unbalanced/);
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
      "numeric amount instead of a decimal string",
      { lines: [{ ...debit, debit: 10.01 }, credit] },
      /SALE.*debit.*strings/,
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
    ["unknown status", { status: "pending" }, /SALE.*valid status/],
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
    [
      "zero debit and credit",
      { lines: [{ ...debit, debit: "0.00" }, debit, credit] },
      /SALE.*1000.*positive/,
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
      "subtype belonging to a different account type",
      {
        ...ledgerWith(),
        accounts: [{ ...ledger.accounts[0], subtype: "operating_revenue" }],
      },
    ],
    [
      "nonboolean account activity status",
      {
        ...ledgerWith(),
        accounts: [{ ...ledger.accounts[0], is_active: "true" }],
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
