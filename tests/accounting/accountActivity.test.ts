import { describe, expect, it } from "vitest";
import { ledger, validateLedger } from "../../src/server/data/ledger";
import {
  AccountNotFoundError,
  buildAccountActivity,
} from "../../src/server/domain/accountActivity";
import { buildIncomeStatement } from "../../src/server/domain/incomeStatement";
import { parseMoneyToCents } from "../../src/server/domain/money";
import { ledgerWith, saleEntry } from "../fixtures";

function q1Activity(account: string) {
  return buildAccountActivity(ledger, account, "2026-01-01", "2026-03-31");
}

describe("account activity", () => {
  it("explains the software balance with the recorded charge and vendor credit", () => {
    expect(q1Activity("6200")).toEqual({
      account_number: "6200",
      account_name: "Software",
      currency: "USD",
      start_date: "2026-01-01",
      end_date: "2026-03-31",
      total: "1099.97",
      activity: [
        {
          journal_id: "JE-018",
          date: "2026-03-10",
          memo: "Software subscriptions",
          debit: "1199.97",
          credit: "0.00",
          impact: "1199.97",
        },
        {
          journal_id: "JE-020",
          date: "2026-03-20",
          memo: "Credit from software vendor for overbilling",
          debit: "0.00",
          credit: "100.00",
          impact: "-100.00",
        },
      ],
    });
  });

  it("reconciles every P&L account's lines and total with its Q1 statement balance", () => {
    const statement = buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");
    const accounts = [
      statement.revenue,
      statement.cost_of_goods_sold,
      statement.operating_expenses,
      statement.other_income,
    ].flatMap((section) => section.accounts);

    for (const account of accounts) {
      const activity = q1Activity(account.account_number);
      const sum = activity.activity.reduce(
        (sum, line) => sum + parseMoneyToCents(line.impact),
        0n,
      );
      expect(activity.total, account.account_number).toBe(account.amount);
      expect(sum, account.account_number).toBe(
        parseMoneyToCents(account.amount),
      );
    }
  });

  it("retains inactive marketing history and negative sales returns", () => {
    const marketing = q1Activity("6300");
    expect(marketing.total).toBe("2500.10");
    expect(marketing.activity.map((line) => line.journal_id)).toEqual([
      "JE-008",
    ]);

    const returns = q1Activity("4900");
    expect(returns.total).toBe("-800.25");
    expect(returns.activity.map((line) => line.impact)).toEqual([
      "-650.25",
      "-150.00",
    ]);
  });

  it("returns no lines and an exact zero for a valid empty period", () => {
    const report = buildAccountActivity(
      ledger,
      "6200",
      "2027-01-01",
      "2027-01-31",
    );

    expect(report.activity).toEqual([]);
    expect(report.total).toBe("0.00");
    expect(report.start_date).toBe("2027-01-01");
    expect(report.end_date).toBe("2027-01-31");
  });

  it("keeps each posted line in date/journal order, normalizes short decimals, and leaves the source unchanged", () => {
    const entry = saleEntry("B", {
      date: "2026-03-01",
      lines: [
        { account: "4000", debit: "0", credit: "10.1" },
        { account: "4000", debit: "0.00", credit: "5.00" },
        { account: "4000", debit: "3.00", credit: "0.00" },
        { account: "1000", debit: "12.10", credit: "0.00" },
      ],
    });
    const source = ledgerWith(
      entry,
      { ...entry, id: "A" },
      { ...entry, id: "C", date: "2026-03-02" },
      { ...entry, id: "draft", status: "draft" },
      { ...entry, id: "void", status: "void" },
      { ...entry, id: "before", date: "2026-02-28" },
      { ...entry, id: "after", date: "2026-03-03" },
    );
    validateLedger(source);
    const before = structuredClone(source);

    const report = buildAccountActivity(
      source,
      "4000",
      "2026-03-01",
      "2026-03-02",
    );

    // Journal, debit, credit, signed impact. Within an entry, keep original line order.
    expect(
      report.activity.map(({ journal_id, debit, credit, impact }) => [
        journal_id,
        debit,
        credit,
        impact,
      ]),
    ).toEqual([
      ["A", "0.00", "10.10", "10.10"],
      ["A", "0.00", "5.00", "5.00"],
      ["A", "3.00", "0.00", "-3.00"],
      ["B", "0.00", "10.10", "10.10"],
      ["B", "0.00", "5.00", "5.00"],
      ["B", "3.00", "0.00", "-3.00"],
      ["C", "0.00", "10.10", "10.10"],
      ["C", "0.00", "5.00", "5.00"],
      ["C", "3.00", "0.00", "-3.00"],
    ]);
    expect(report.total).toBe("36.30");
    expect(source).toEqual(before);
  });

  it("uses normal debit and credit signs for balance-sheet account activity", () => {
    const cash = buildAccountActivity(
      ledger,
      "1000",
      "2026-01-01",
      "2026-01-01",
    );
    const deferred = buildAccountActivity(
      ledger,
      "2100",
      "2026-01-10",
      "2026-01-10",
    );

    expect(cash.total).toBe("-9000.00");
    expect(deferred.total).toBe("12000.00");
  });

  it("shows a posted equity credit as a positive normal balance", () => {
    const source = ledgerWith(
      saleEntry("capital", {
        lines: [
          { account: "1000", debit: "10.01", credit: "0.00" },
          { account: "3000", debit: "0.00", credit: "10.01" },
        ],
      }),
    );

    expect(
      buildAccountActivity(source, "3000", "2026-03-31", "2026-03-31").total,
    ).toBe("10.01");
  });

  it("rejects an unknown account instead of inventing activity", () => {
    expect(() => q1Activity("9999")).toThrow(AccountNotFoundError);
  });
});
