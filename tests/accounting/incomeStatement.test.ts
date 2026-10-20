import { describe, expect, it } from "vitest";
import { ledger } from "../../src/server/data/ledger";
import { buildIncomeStatement } from "../../src/server/domain/incomeStatement";
import { parseMoneyToCents } from "../../src/shared/money";
import type { IncomeStatementResponse } from "../../src/shared/types";
import { ledgerWith, saleEntry } from "../fixtures";

/** Account numbers and named financial results make reconciliation failures readable. */
function statementValues(
  report: IncomeStatementResponse,
): Record<string, string> {
  const accounts = [
    report.revenue,
    report.cost_of_goods_sold,
    report.operating_expenses,
    report.other_income,
  ].flatMap((section) => section.accounts);
  return {
    ...Object.fromEntries(
      accounts.map((account) => [account.account_number, account.amount]),
    ),
    revenue: report.revenue.subtotal,
    cost_of_goods_sold: report.cost_of_goods_sold.subtotal,
    gross_profit: report.gross_profit,
    operating_expenses: report.operating_expenses.subtotal,
    operating_income: report.operating_income,
    other_income: report.other_income.subtotal,
    net_income: report.net_income,
  };
}

describe("income statement from the supplied ledger", () => {
  it("matches independently summed Q1 accounts, subtotals, and profits", () => {
    const report = buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");

    // Literal values were checked independently against the recorded posted lines.
    expect(statementValues(report)).toEqual({
      "4000": "35650.75",
      "4100": "3000.00",
      "4900": "-800.25",
      "5000": "14272.75",
      "6000": "55500.00",
      "6100": "9000.00",
      "6200": "1099.97",
      "6300": "2500.10",
      "7000": "42.18",
      revenue: "37850.50",
      cost_of_goods_sold: "14272.75",
      gross_profit: "23577.75",
      operating_expenses: "68100.07",
      operating_income: "-44522.32",
      other_income: "42.18",
      net_income: "-44480.14",
    });
    expect(report).toMatchObject({
      company: "Northwind Coffee Roasters",
      currency: "USD",
      start_date: "2026-01-01",
      end_date: "2026-03-31",
    });
  });

  it("makes January plus February plus March equal Q1 for every account and result", () => {
    const quarter = statementValues(
      buildIncomeStatement(ledger, "2026-01-01", "2026-03-31"),
    );
    const months = [
      ["2026-01-01", "2026-01-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-31"],
    ].map(([start, end]) =>
      statementValues(buildIncomeStatement(ledger, start, end)),
    );

    for (const [name, amount] of Object.entries(quarter)) {
      const monthlySum = months.reduce(
        (sum, month) => sum + parseMoneyToCents(month[name]),
        0n,
      );
      expect(monthlySum, name).toBe(parseMoneyToCents(amount));
    }
  });

  it("expenses the full recorded rent on January 1 without spreading it over later months", () => {
    const januaryFirst = buildIncomeStatement(
      ledger,
      "2026-01-01",
      "2026-01-01",
    );
    const laterMonths = buildIncomeStatement(
      ledger,
      "2026-02-01",
      "2026-03-31",
    );

    expect(statementValues(januaryFirst)["6100"]).toBe("9000.00");
    expect(januaryFirst.net_income).toBe("-9000.00");
    expect(statementValues(laterMonths)["6100"]).toBe("0.00");
  });

  it("shows a vendor credit as a negative expense and positive income", () => {
    const report = buildIncomeStatement(ledger, "2026-03-20", "2026-03-20");

    expect(statementValues(report)["6200"]).toBe("-100.00");
    expect(report.operating_expenses.subtotal).toBe("-100.00");
    expect(report.net_income).toBe("100.00");
  });

  it("leaves deferred billings and cash collection off the income statement", () => {
    for (const date of ["2026-01-10", "2026-02-15"]) {
      const report = buildIncomeStatement(ledger, date, date);
      expect(Object.values(statementValues(report)), date).toEqual(
        Array(16).fill("0.00"),
      );
    }
  });

  it("keeps all nine P&L accounts and seven financial results at zero for an empty period", () => {
    const report = buildIncomeStatement(ledger, "2027-01-01", "2027-12-31");

    expect(Object.values(statementValues(report))).toEqual(
      Array(16).fill("0.00"),
    );
  });
});

describe("income statement accounting rules", () => {
  it("uses account type and subtype even when numbers and names carry no classification", () => {
    const source = ledgerWith(
      saleEntry("mixed-activity", {
        lines: [
          { account: "1000", debit: "45.00", credit: "0.00" },
          { account: "4000", debit: "0.00", credit: "100.00" },
          { account: "4900", debit: "10.00", credit: "0.00" },
          { account: "5000", debit: "20.00", credit: "0.00" },
          { account: "6000", debit: "30.00", credit: "0.00" },
          { account: "7000", debit: "0.00", credit: "5.00" },
        ],
      }),
    );
    source.accounts = source.accounts.map((account) => ({
      ...account,
      number: `custom-${account.number}`,
      name: "Same display name",
    }));
    for (const line of source.journal_entries[0].lines)
      line.account = `custom-${line.account}`;

    const report = buildIncomeStatement(source, "2026-03-31", "2026-03-31");

    expect(statementValues(report)).toMatchObject({
      revenue: "90.00",
      cost_of_goods_sold: "20.00",
      gross_profit: "70.00",
      operating_expenses: "30.00",
      operating_income: "40.00",
      other_income: "5.00",
      net_income: "45.00",
    });
  });

  it("sorts account numbers numerically without changing the source order", () => {
    const source = ledgerWith();
    source.accounts = ["10", "4000", "2"].map((number) => ({
      number,
      name: `Revenue ${number}`,
      type: "revenue",
      subtype: "operating_revenue",
      is_active: true,
    }));

    const report = buildIncomeStatement(source, "2026-01-01", "2026-03-31");

    expect(
      report.revenue.accounts.map((account) => account.account_number),
    ).toEqual(["2", "10", "4000"]);
    expect(source.accounts.map((account) => account.number)).toEqual([
      "10",
      "4000",
      "2",
    ]);
  });

  it("preserves negative reversal signs and cancels an entry with its exact reversal", () => {
    const original = saleEntry("original", {
      date: "2026-02-01",
      lines: [
        { account: "1000", debit: "1250.01", credit: "0.00" },
        { account: "4000", debit: "0.00", credit: "1250.01" },
        { account: "6000", debit: "200.02", credit: "0.00" },
        { account: "1000", debit: "0.00", credit: "200.02" },
      ],
    });
    const reversal = saleEntry("reversal", {
      date: "2026-02-02",
      lines: original.lines.map((line) => ({
        account: line.account,
        debit: line.credit,
        credit: line.debit,
      })),
    });
    const source = ledgerWith(original, reversal);
    const reversalDay = buildIncomeStatement(
      source,
      "2026-02-02",
      "2026-02-02",
    );
    const bothDays = buildIncomeStatement(source, "2026-02-01", "2026-02-02");

    expect(reversalDay.revenue.subtotal).toBe("-1250.01");
    expect(reversalDay.operating_expenses.subtotal).toBe("-200.02");
    expect(Object.values(statementValues(bothDays))).toEqual(
      Array(16).fill("0.00"),
    );
  });

  it("includes both date boundaries while excluding drafts, voids, and surrounding dates", () => {
    const source = ledgerWith(
      saleEntry("start", { date: "2026-01-01" }),
      saleEntry("end", { date: "2026-03-31" }),
      saleEntry("draft", { status: "draft" }),
      saleEntry("void", { status: "void" }),
      saleEntry("before", { date: "2025-12-31" }),
      saleEntry("after", { date: "2026-04-01" }),
    );

    expect(
      buildIncomeStatement(source, "2026-01-01", "2026-03-31").revenue.subtotal,
    ).toBe("20.02");
  });

  it("excludes asset, liability, and equity activity from a balanced entry", () => {
    const source = ledgerWith(
      saleEntry("capital-and-deferral", {
        lines: [
          { account: "1000", debit: "30.00", credit: "0.00" },
          { account: "2100", debit: "0.00", credit: "20.00" },
          { account: "3000", debit: "0.00", credit: "10.00" },
        ],
      }),
    );

    const report = buildIncomeStatement(source, "2026-01-01", "2026-03-31");

    expect(Object.values(statementValues(report))).toEqual(
      Array(16).fill("0.00"),
    );
  });

  it("does not mutate the supplied ledger", () => {
    const before = structuredClone(ledger);
    buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");
    expect(ledger).toEqual(before);
  });

  it("rejects an unknown account reference", () => {
    const entry = saleEntry();
    entry.lines[0].account = "missing-account";

    expect(() =>
      buildIncomeStatement(ledgerWith(entry), "2026-01-01", "2026-03-31"),
    ).toThrow(/missing-account/);
  });
});
