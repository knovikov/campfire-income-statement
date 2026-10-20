import { describe, expect, it } from "vitest";
import {
  getJournalTotals,
  prepareJournalEntry,
} from "../../src/client/utils/journalForm";
import { saleEntry } from "../fixtures";

function formEntry() {
  return saleEntry(" JE-NEW ", {
    lines: [
      { account: "1000", debit: "0.1", credit: "" },
      { account: "1000", debit: "0.2", credit: "" },
      { account: "4000", debit: "", credit: "0.3" },
    ],
  });
}

describe("journal editor validation", () => {
  it.each([0, 1])(
    "rejects a form with %i lines before sending a request",
    (count) => {
      const form = formEntry();
      form.lines = form.lines.slice(0, count);
      expect(() => prepareJournalEntry(form)).toThrow(
        "A journal entry needs at least two lines.",
      );
    },
  );

  it("normalizes blank sides, short decimals, and IDs without mutating the form", () => {
    const form = formEntry();
    expect(prepareJournalEntry(form)).toMatchObject({
      id: "JE-NEW",
      lines: [
        { account: "1000", debit: "0.10", credit: "0.00" },
        { account: "1000", debit: "0.20", credit: "0.00" },
        { account: "4000", debit: "0.00", credit: "0.30" },
      ],
    });
    expect(form).toEqual(formEntry());
  });

  it("balances totals beyond 64-bit cents and still detects a one-cent difference", () => {
    const maximum = "92233720368547758.07";
    const form = saleEntry("HUGE", {
      lines: [
        { account: "1000", debit: maximum, credit: "" },
        { account: "1000", debit: "0.01", credit: "" },
        { account: "4000", debit: "", credit: maximum },
        { account: "4000", debit: "", credit: "0.01" },
      ],
    });

    expect(getJournalTotals(form.lines)).toEqual({
      debits: 9223372036854775808n,
      credits: 9223372036854775808n,
    });
    expect(
      prepareJournalEntry(form).lines.map((line) => [line.debit, line.credit]),
    ).toEqual([
      [maximum, "0.00"],
      ["0.01", "0.00"],
      ["0.00", maximum],
      ["0.00", "0.01"],
    ]);

    form.lines[3].credit = "0.02";
    expect(getJournalTotals(form.lines)).toEqual({
      debits: 9223372036854775808n,
      credits: 9223372036854775809n,
    });
    expect(() => prepareJournalEntry(form)).toThrow(
      /debits must equal total credits/,
    );
  });

  it("rejects an unbalanced entry before sending a request", () => {
    const form = formEntry();
    form.lines[2].credit = "0.31";
    expect(() => prepareJournalEntry(form)).toThrow(
      /debits must equal total credits/,
    );
  });

  it.each(["1.001", "-1.00"])("rejects invalid debit amount %s", (amount) => {
    const form = formEntry();
    form.lines[0].debit = amount;
    expect(() => prepareJournalEntry(form)).toThrow(/amounts|fractional/);
  });

  it("rejects a line with both debit and credit", () => {
    const form = formEntry();
    form.lines[0].credit = "0.10";
    expect(() => prepareJournalEntry(form)).toThrow(/not both/);
  });

  it("requires an account and a nonzero amount on every line", () => {
    const form = formEntry();
    form.lines.push({ account: "", debit: "", credit: "" });
    expect(() => prepareJournalEntry(form)).toThrow(/choose an account/);
    form.lines[3].account = "1000";
    expect(() => prepareJournalEntry(form)).toThrow(/positive debit or credit/);
  });
});
