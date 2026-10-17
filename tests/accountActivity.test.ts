import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { ledger, validateLedger } from "../src/server/data/ledger";
import {
  AccountNotFoundError,
  buildAccountActivity,
} from "../src/server/domain/accountActivity";
import { buildIncomeStatement } from "../src/server/domain/incomeStatement";
import { parseMoneyToCents } from "../src/server/domain/money";
import type { JournalEntry, Ledger } from "../src/shared/types";

describe("account activity", () => {
  it("explains the real software balance using the recorded charge and vendor credit", () => {
    const report = buildAccountActivity(
      ledger,
      "6200",
      "2026-01-01",
      "2026-03-31",
    );

    expect(report).toEqual({
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

    const creditDay = buildAccountActivity(
      ledger,
      "6200",
      "2026-03-20",
      "2026-03-20",
    );
    expect(creditDay.total).toBe("-100.00");
    expect(creditDay.activity.map((line) => line.journal_id)).toEqual([
      "JE-020",
    ]);
  });

  it("reconciles every P&L account's activity and total to its Q1 statement balance", () => {
    const statement = buildIncomeStatement(ledger, "2026-01-01", "2026-03-31");
    const accounts = [
      ...statement.revenue.accounts,
      ...statement.cost_of_goods_sold.accounts,
      ...statement.operating_expenses.accounts,
      ...statement.other_income.accounts,
    ];

    for (const account of accounts) {
      const activity = buildAccountActivity(
        ledger,
        account.account_number,
        "2026-01-01",
        "2026-03-31",
      );
      let totalImpact = 0n;
      for (const line of activity.activity)
        totalImpact += parseMoneyToCents(line.impact);
      expect(totalImpact, account.account_number).toBe(
        parseMoneyToCents(account.amount),
      );
      expect(parseMoneyToCents(activity.total), account.account_number).toBe(
        totalImpact,
      );
    }
  });

  it("retains inactive account history and negative contra-revenue impacts", () => {
    const marketing = buildAccountActivity(
      ledger,
      "6300",
      "2026-01-01",
      "2026-03-31",
    );
    expect(marketing.total).toBe("2500.10");
    expect(marketing.activity.map((line) => line.journal_id)).toEqual([
      "JE-008",
    ]);
    const returns = buildAccountActivity(
      ledger,
      "4900",
      "2026-01-01",
      "2026-03-31",
    );
    expect(returns.total).toBe("-800.25");
    expect(returns.activity.map((line) => line.impact)).toEqual([
      "-650.25",
      "-150.00",
    ]);
  });

  it("returns no activity and an exact zero for a valid empty period", () => {
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

  it("sorts journals deterministically and preserves multiple matching lines in journal order", () => {
    const entry: JournalEntry = {
      id: "B",
      date: "2026-03-01",
      status: "posted",
      memo: "Two revenue credits and a return",
      lines: [
        { account: "4000", debit: "0", credit: "10.1" },
        { account: "4000", debit: "0.00", credit: "5.00" },
        { account: "4000", debit: "3.00", credit: "0.00" },
        { account: "1000", debit: "12.10", credit: "0.00" },
      ],
    };
    const testLedger: Ledger = {
      company: "Activity Test",
      currency: "USD",
      accounts: ledger.accounts.filter((account) =>
        ["1000", "4000"].includes(account.number),
      ),
      journal_entries: [
        entry,
        { ...entry, id: "A" },
        { ...entry, id: "C", date: "2026-03-02" },
        { ...entry, id: "draft", status: "draft" },
        { ...entry, id: "void", status: "void" },
        { ...entry, id: "before", date: "2026-02-28" },
        { ...entry, id: "after", date: "2026-03-03" },
      ],
    };
    validateLedger(testLedger);

    const report = buildAccountActivity(
      testLedger,
      "4000",
      "2026-03-01",
      "2026-03-02",
    );
    expect(report.activity.map((line) => line.journal_id)).toEqual([
      "A",
      "A",
      "A",
      "B",
      "B",
      "B",
      "C",
      "C",
      "C",
    ]);
    expect(report.activity.map((line) => line.impact)).toEqual([
      "10.10",
      "5.00",
      "-3.00",
      "10.10",
      "5.00",
      "-3.00",
      "10.10",
      "5.00",
      "-3.00",
    ]);
    expect(report.total).toBe("36.30");
    expect(report.activity[0].debit).toBe("0.00");
    expect(report.activity[0].credit).toBe("10.10");
    expect(testLedger.journal_entries[0].id).toBe("B");
  });

  it("supports known balance-sheet accounts using their normal debit or credit signs", () => {
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
    expect(
      buildAccountActivity(ledger, "3000", "2027-01-01", "2027-01-31").total,
    ).toBe("0.00");
    expect(
      buildIncomeStatement(ledger, "2026-01-10", "2026-01-10").net_income,
    ).toBe("0.00");
  });

  it("rejects an unknown account instead of inventing activity", () => {
    expect(() =>
      buildAccountActivity(ledger, "9999", "2026-01-01", "2026-03-31"),
    ).toThrow(AccountNotFoundError);
  });
});

describe("GET /accounts/:accountNumber/activity", () => {
  const app = createApp();

  it("returns exact signed software activity for the requested inclusive range", async () => {
    const response = await request(app)
      .get("/accounts/6200/activity")
      .query({ start: "2026-03-20", end: "2026-03-20" })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body).toMatchObject({
      account_number: "6200",
      start_date: "2026-03-20",
      end_date: "2026-03-20",
      total: "-100.00",
      activity: [
        {
          journal_id: "JE-020",
          debit: "0.00",
          credit: "100.00",
          impact: "-100.00",
        },
      ],
    });
  });

  it.each([
    "",
    "?start=2026-01-01",
    "?start=2026-02-29&end=2026-03-31",
    "?start=2026-01-01T00:00:00Z&end=2026-03-31",
    "?start=2026-04-01&end=2026-03-31",
    "?start=2026-01-01&start=2026-02-01&end=2026-03-31",
  ])("returns 400 for invalid activity date queries %s", async (query) => {
    const response = await request(app)
      .get(`/accounts/6200/activity${query}`)
      .expect(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  it("returns 404 for an unknown account", async () => {
    const response = await request(app)
      .get("/accounts/unknown/activity")
      .query({ start: "2026-01-01", end: "2026-03-31" })
      .expect(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  it.each(["6300", "1000", "2100", "3000"])(
    "returns 200 with empty activity for known account %s",
    async (account) => {
      const response = await request(app)
        .get(`/accounts/${account}/activity`)
        .query({ start: "2027-01-01", end: "2027-01-31" })
        .expect(200);
      expect(response.body.total).toBe("0.00");
      expect(response.body.activity).toEqual([]);
    },
  );
});
