import { describe, expect, it } from "vitest";
import { ledger } from "../../src/server/data/ledger";
import { buildAccountActivity } from "../../src/server/domain/accountActivity";
import { buildIncomeStatement } from "../../src/server/domain/incomeStatement";

describe("recorded dataset regressions", () => {
  // Fixed oracles complement monthly additivity: consistently wrong totals can still add up.
  it.each([
    {
      month: "January",
      start: "2026-01-01",
      end: "2026-01-31",
      net: "-21529.65",
    },
    {
      month: "February",
      start: "2026-02-01",
      end: "2026-02-28",
      net: "-13230.25",
    },
    { month: "March", start: "2026-03-01", end: "2026-03-31", net: "-9720.24" },
  ])(
    "reports the independently checked $month net income",
    ({ start, end, net }) => {
      expect(buildIncomeStatement(ledger, start, end).net_income).toBe(net);
    },
  );

  // January 1, March 20, billing, and collection days already have focused tests.
  it.each([
    { date: "2026-02-14", net: "-650.25" },
    { date: "2026-03-31", net: "-17457.82" },
    { date: "2026-04-01", net: "9100.00" },
  ])(
    "reports $net net income for the single accounting day $date",
    ({ date, net }) => {
      expect(buildIncomeStatement(ledger, date, date).net_income).toBe(net);
    },
  );

  it("recognizes three monthly subscriptions rather than the 12000 annual billing", () => {
    const report = buildAccountActivity(
      ledger,
      "4100",
      "2026-01-01",
      "2026-03-31",
    );

    expect(
      report.activity.map(({ journal_id, date, impact }) => [
        journal_id,
        date,
        impact,
      ]),
    ).toEqual([
      ["JE-005", "2026-01-31", "1000.00"],
      ["JE-014", "2026-02-28", "1000.00"],
      ["JE-021", "2026-03-31", "1000.00"],
    ]);
  });

  it("keeps the March three-line sale's gross revenue and discount separate", () => {
    const report = buildIncomeStatement(ledger, "2026-03-02", "2026-03-02");
    const accounts = Object.fromEntries(
      report.revenue.accounts.map((account) => [
        account.account_number,
        account.amount,
      ]),
    );

    expect(accounts).toMatchObject({ "4000": "15000.00", "4900": "-150.00" });
    expect(report.revenue.subtotal).toBe("14850.00");
  });

  it("returns the same statement after reordering entries and their lines", () => {
    const reordered = structuredClone(ledger);
    reordered.journal_entries.reverse();
    for (const entry of reordered.journal_entries) entry.lines.reverse();

    expect(buildIncomeStatement(reordered, "2026-01-01", "2026-03-31")).toEqual(
      buildIncomeStatement(ledger, "2026-01-01", "2026-03-31"),
    );
  });

  it("preserves historical statement and activity when accounts become inactive", () => {
    const deactivated = structuredClone(ledger);
    for (const account of deactivated.accounts) account.is_active = false;

    expect(
      buildIncomeStatement(deactivated, "2026-01-01", "2026-03-31"),
    ).toEqual(buildIncomeStatement(ledger, "2026-01-01", "2026-03-31"));
    expect(
      buildAccountActivity(deactivated, "4000", "2026-01-01", "2026-03-31"),
    ).toEqual(buildAccountActivity(ledger, "4000", "2026-01-01", "2026-03-31"));
  });
});
