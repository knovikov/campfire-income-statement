import { describe, expect, it } from "vitest";
import { ledger } from "../src/server/data/ledger";
import { buildIncomeStatement } from "../src/server/domain/incomeStatement";
import { parseMoneyToCents } from "../src/server/domain/money";
import type {
  IncomeStatementResponse,
  JournalEntry,
  Ledger,
  StatementAccount,
} from "../src/shared/types";

function statementAccounts(
  report: IncomeStatementResponse,
): StatementAccount[] {
  return [
    ...report.revenue.accounts,
    ...report.cost_of_goods_sold.accounts,
    ...report.operating_expenses.accounts,
    ...report.other_income.accounts,
  ];
}

function accountAmount(
  report: IncomeStatementResponse,
  number: string,
): string {
  const account = statementAccounts(report).find(
    (account) => account.account_number === number,
  );
  if (!account) throw new Error(`Missing statement account ${number}`);
  return account.amount;
}

function statementTotals(report: IncomeStatementResponse): string[] {
  return [
    report.revenue.subtotal,
    report.cost_of_goods_sold.subtotal,
    report.gross_profit,
    report.operating_expenses.subtotal,
    report.operating_income,
    report.other_income.subtotal,
    report.net_income,
  ];
}

function syntheticLedger(entries: JournalEntry[]): Ledger {
  return {
    company: "Test Company",
    currency: "USD",
    accounts: [
      {
        number: "1000",
        name: "Cash",
        type: "asset",
        subtype: "balance_sheet",
        is_active: true,
      },
      {
        number: "4000",
        name: "Revenue",
        type: "revenue",
        subtype: "operating_revenue",
        is_active: true,
      },
      {
        number: "6000",
        name: "Expense",
        type: "expense",
        subtype: "operating_expense",
        is_active: true,
      },
    ],
    journal_entries: entries,
  };
}

describe("income statement from the supplied ledger", () => {
  it("matches independently summed Q1 accounts and financial results", () => {
    const report = buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");

    // These expectations sum recorded posted lines independently of the engine.
    expect(
      statementAccounts(report).map(({ account_number, amount }) => [
        account_number,
        amount,
      ]),
    ).toEqual([
      ["4000", "35650.75"],
      ["4100", "3000.00"],
      ["4900", "-800.25"],
      ["5000", "14272.75"],
      ["6000", "55500.00"],
      ["6100", "9000.00"],
      ["6200", "1099.97"],
      ["6300", "2500.10"],
      ["7000", "42.18"],
    ]);
    expect(statementTotals(report)).toEqual([
      "37850.50",
      "14272.75",
      "23577.75",
      "68100.07",
      "-44522.32",
      "42.18",
      "-44480.14",
    ]);
    expect(report.start_date).toBe("2026-01-01");
    expect(report.end_date).toBe("2026-03-31");
  });

  it("reconciles each section subtotal and the profit formulas in exact cents", () => {
    const report = buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");
    for (const section of [
      report.revenue,
      report.cost_of_goods_sold,
      report.operating_expenses,
      report.other_income,
    ]) {
      let accountTotal = 0n;
      for (const account of section.accounts)
        accountTotal += parseMoneyToCents(account.amount);
      expect(accountTotal).toBe(parseMoneyToCents(section.subtotal));
    }
    const grossProfit =
      parseMoneyToCents(report.revenue.subtotal) -
      parseMoneyToCents(report.cost_of_goods_sold.subtotal);
    const operatingIncome =
      grossProfit - parseMoneyToCents(report.operating_expenses.subtotal);
    expect(parseMoneyToCents(report.gross_profit)).toBe(grossProfit);
    expect(parseMoneyToCents(report.operating_income)).toBe(operatingIncome);
    expect(parseMoneyToCents(report.net_income)).toBe(
      operatingIncome + parseMoneyToCents(report.other_income.subtotal),
    );
  });

  it("makes January plus February plus March equal Q1 for every account and total", () => {
    const quarter = buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");
    const months = [
      buildIncomeStatement(ledger, "2026-01-01", "2026-01-31"),
      buildIncomeStatement(ledger, "2026-02-01", "2026-02-28"),
      buildIncomeStatement(ledger, "2026-03-01", "2026-03-31"),
    ];

    for (const account of statementAccounts(quarter)) {
      let monthlyTotal = 0n;
      for (const month of months) {
        monthlyTotal += parseMoneyToCents(
          accountAmount(month, account.account_number),
        );
      }
      expect(monthlyTotal, account.account_number).toBe(
        parseMoneyToCents(account.amount),
      );
    }
    const quarterTotals = statementTotals(quarter);
    for (let index = 0; index < quarterTotals.length; index += 1) {
      let monthlyTotal = 0n;
      for (const month of months)
        monthlyTotal += parseMoneyToCents(statementTotals(month)[index]);
      expect(monthlyTotal, `statement total ${index}`).toBe(
        parseMoneyToCents(quarterTotals[index]),
      );
    }
  });

  it("includes January 1 rent exactly when recorded without amortizing it", () => {
    const januaryFirst = buildIncomeStatement(
      ledger,
      "2026-01-01",
      "2026-01-01",
    );
    expect(accountAmount(januaryFirst, "6100")).toBe("9000.00");
    expect(januaryFirst.operating_expenses.subtotal).toBe("9000.00");
    expect(januaryFirst.net_income).toBe("-9000.00");
    expect(
      accountAmount(
        buildIncomeStatement(ledger, "2026-02-01", "2026-03-31"),
        "6100",
      ),
    ).toBe("0.00");
  });

  it("preserves the software vendor credit as a negative expense on March 20", () => {
    const report = buildIncomeStatement(ledger, "2026-03-20", "2026-03-20");
    expect(accountAmount(report, "6200")).toBe("-100.00");
    expect(report.operating_expenses.subtotal).toBe("-100.00");
    expect(report.net_income).toBe("100.00");
  });

  it("includes March 31 activity and excludes April 1 at the quarter boundary", () => {
    const marchLast = buildIncomeStatement(ledger, "2026-03-31", "2026-03-31");
    expect(marchLast.revenue.subtotal).toBe("1000.00");
    expect(marchLast.operating_expenses.subtotal).toBe("18500.00");
    expect(marchLast.other_income.subtotal).toBe("42.18");
    expect(marchLast.net_income).toBe("-17457.82");
    expect(accountAmount(marchLast, "4000")).toBe("0.00");

    const aprilFirst = buildIncomeStatement(ledger, "2026-04-01", "2026-04-01");
    expect(aprilFirst.revenue.subtotal).toBe("9100.00");
    expect(
      buildIncomeStatement(ledger, "2026-03-31", "2026-04-01").revenue.subtotal,
    ).toBe("10100.00");
  });

  it("does not recognize deferred billings or balance-sheet-only cash receipts", () => {
    for (const date of ["2026-01-10", "2026-02-15"]) {
      expect(statementTotals(buildIncomeStatement(ledger, date, date))).toEqual(
        Array(7).fill("0.00"),
      );
    }
  });

  it("keeps inactive marketing history, contra-revenue, and only posted sales/payroll", () => {
    const report = buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");
    expect(accountAmount(report, "6300")).toBe("2500.10");
    expect(accountAmount(report, "4900")).toBe("-800.25");
    expect(
      buildIncomeStatement(ledger, "2026-02-03", "2026-02-03").revenue.subtotal,
    ).toBe("8200.00");
    expect(
      buildIncomeStatement(ledger, "2026-03-15", "2026-03-15")
        .operating_expenses.subtotal,
    ).toBe("0.00");
  });

  it("returns all zero-balance P&L accounts in account-number order for an empty period", () => {
    const report = buildIncomeStatement(ledger, "2027-01-01", "2027-12-31");
    expect(
      statementAccounts(report).map((account) => account.account_number),
    ).toEqual([
      "4000",
      "4100",
      "4900",
      "5000",
      "6000",
      "6100",
      "6200",
      "6300",
      "7000",
    ]);
    expect(
      statementAccounts(report).every((account) => account.amount === "0.00"),
    ).toBe(true);
    expect(statementTotals(report)).toEqual(Array(7).fill("0.00"));
  });
});

describe("income statement accounting invariants", () => {
  it("cancels balanced posted revenue and expense entries with their exact reversals", () => {
    const original: JournalEntry = {
      id: "original",
      date: "2026-02-01",
      status: "posted",
      memo: "Sale and expense",
      lines: [
        { account: "1000", debit: "1250.01", credit: "0.00" },
        { account: "4000", debit: "0.00", credit: "1250.01" },
        { account: "6000", debit: "200.02", credit: "0.00" },
        { account: "1000", debit: "0.00", credit: "200.02" },
      ],
    };
    const reversal: JournalEntry = {
      ...original,
      id: "reversal",
      date: "2026-02-02",
      memo: "Reverse prior entry",
      lines: original.lines.map((line) => ({
        account: line.account,
        debit: line.credit,
        credit: line.debit,
      })),
    };
    const testLedger = syntheticLedger([original, reversal]);
    const reversalOnly = buildIncomeStatement(
      testLedger,
      "2026-02-02",
      "2026-02-02",
    );
    expect(reversalOnly.revenue.subtotal).toBe("-1250.01");
    expect(reversalOnly.operating_expenses.subtotal).toBe("-200.02");
    expect(
      statementTotals(
        buildIncomeStatement(testLedger, "2026-02-01", "2026-02-02"),
      ),
    ).toEqual(Array(7).fill("0.00"));
  });

  it("filters status and both date boundaries independently of ledger-specific IDs", () => {
    const entry: JournalEntry = {
      id: "posted-start",
      date: "2026-01-01",
      status: "posted",
      memo: "Sale",
      lines: [
        { account: "1000", debit: "10.01", credit: "0.00" },
        { account: "4000", debit: "0.00", credit: "10.01" },
      ],
    };
    const testLedger = syntheticLedger([
      entry,
      { ...entry, id: "posted-end", date: "2026-03-31" },
      { ...entry, id: "draft", status: "draft" },
      { ...entry, id: "void", status: "void" },
      { ...entry, id: "before", date: "2025-12-31" },
      { ...entry, id: "after", date: "2026-04-01" },
    ]);
    expect(
      buildIncomeStatement(testLedger, "2026-01-01", "2026-03-31").revenue
        .subtotal,
    ).toBe("20.02");
  });

  it("excludes asset, liability, and equity activity even in balanced posted entries", () => {
    const testLedger: Ledger = {
      company: "Balance Sheet Only",
      currency: "USD",
      accounts: ledger.accounts.filter((account) =>
        ["1000", "2100", "3000"].includes(account.number),
      ),
      journal_entries: [
        {
          id: "capital-and-deferral",
          date: "2026-01-01",
          status: "posted",
          memo: "Not income",
          lines: [
            { account: "1000", debit: "30.00", credit: "0.00" },
            { account: "2100", debit: "0.00", credit: "20.00" },
            { account: "3000", debit: "0.00", credit: "10.00" },
          ],
        },
      ],
    };
    expect(
      statementTotals(
        buildIncomeStatement(testLedger, "2026-01-01", "2026-01-01"),
      ),
    ).toEqual(Array(7).fill("0.00"));
  });

  it("does not mutate the supplied ledger and rejects unknown account references", () => {
    const original = structuredClone(ledger);
    buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");
    expect(ledger).toEqual(original);
    const malformed = structuredClone(ledger);
    malformed.journal_entries[1].lines[0].account = "missing-account";
    expect(() =>
      buildIncomeStatement(malformed, "2026-01-01", "2026-03-31"),
    ).toThrow(/missing-account/);
  });
});
