import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server/app";
import { ledger } from "../src/server/data/ledger";
import type { IncomeStatementResponse, Ledger } from "../src/shared/types";

const app = createApp();

describe("GET /income-statement", () => {
  it("returns the Q1 report with exact decimal strings and the requested calendar dates", async () => {
    const response = await request(app)
      .get("/income-statement")
      .query({ start: "2026-01-01", end: "2026-03-31" })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body).toMatchObject({
      company: "Northwind Coffee Roasters",
      currency: "USD",
      start_date: "2026-01-01",
      end_date: "2026-03-31",
      revenue: { subtotal: "37850.50" },
      cost_of_goods_sold: { subtotal: "14272.75" },
      gross_profit: "23577.75",
      operating_expenses: { subtotal: "68100.07" },
      operating_income: "-44522.32",
      other_income: { subtotal: "42.18" },
      net_income: "-44480.14",
    });
    expect(response.body.revenue.accounts).toContainEqual({
      account_number: "4900",
      account_name: "Sales Returns & Discounts",
      amount: "-800.25",
    });

    const statement: IncomeStatementResponse = response.body;
    const sections = [
      statement.revenue,
      statement.cost_of_goods_sold,
      statement.operating_expenses,
      statement.other_income,
    ];
    const amounts = [
      statement.gross_profit,
      statement.operating_income,
      statement.net_income,
    ];
    for (const section of sections) {
      amounts.push(section.subtotal);
      for (const account of section.accounts) {
        amounts.push(account.amount);
      }
    }
    for (const amount of amounts) {
      expect(typeof amount).toBe("string");
      expect(amount).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it.each([
    "",
    "?start=2026-01-01",
    "?end=2026-03-31",
    "?start=&end=2026-03-31",
    "?start=2026-02-29&end=2026-03-31",
    "?start=2026-01-01&end=2026-02-30",
    "?start=2026-13-01&end=2026-12-31",
    "?start=2026-00-01&end=2026-03-31",
    "?start=2026-2-3&end=2026-03-31",
    "?start=2026-01-01T00:00:00Z&end=2026-03-31",
    "?start=2026-04-01&end=2026-03-31",
    "?start=2026-01-01&start=2026-02-01&end=2026-03-31",
    "?start=2026-01-01&end=2026-03-31&end=2026-04-01",
    "?start[date]=2026-01-01&end=2026-03-31",
  ])(
    "rejects missing, malformed, or ambiguous boundaries: %s",
    async (query) => {
      const response = await request(app)
        .get(`/income-statement${query}`)
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body).toEqual({ error: expect.any(String) });
      expect(response.body.error.length).toBeGreaterThan(0);
    },
  );

  it("accepts a valid leap day and returns all zero balances for an empty period", async () => {
    const response = await request(app)
      .get("/income-statement")
      .query({ start: "2028-02-29", end: "2028-02-29" })
      .expect(200);

    const statement: IncomeStatementResponse = response.body;
    expect(statement.start_date).toBe("2028-02-29");
    expect(statement.end_date).toBe("2028-02-29");
    expect(statement.gross_profit).toBe("0.00");
    expect(statement.operating_income).toBe("0.00");
    expect(statement.net_income).toBe("0.00");
    for (const section of [
      statement.revenue,
      statement.cost_of_goods_sold,
      statement.operating_expenses,
      statement.other_income,
    ]) {
      expect(section.subtotal).toBe("0.00");
      expect(section.accounts.length).toBeGreaterThan(0);
      for (const account of section.accounts) {
        expect(account.amount).toBe("0.00");
      }
    }
  });

  it("preserves the software vendor credit on a single-day report", async () => {
    const response = await request(app)
      .get("/income-statement")
      .query({ start: "2026-03-20", end: "2026-03-20" })
      .expect(200);

    expect(response.body.operating_expenses.accounts).toContainEqual({
      account_number: "6200",
      account_name: "Software",
      amount: "-100.00",
    });
    expect(response.body.operating_expenses.subtotal).toBe("-100.00");
    expect(response.body.net_income).toBe("100.00");
  });

  it("returns a generic server error when an internal account reference is invalid", async () => {
    const invalidLedger: Ledger = {
      ...ledger,
      journal_entries: [
        {
          id: "PRIVATE-INTERNAL-ENTRY",
          date: "2026-01-01",
          status: "posted",
          memo: "Internal details must not appear in the API error",
          lines: [
            {
              account: "UNKNOWN-PRIVATE-ACCOUNT",
              debit: "0.00",
              credit: "1.00",
            },
          ],
        },
      ],
    };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request(createApp(invalidLedger))
        .get("/income-statement")
        .query({ start: "2026-01-01", end: "2026-03-31" })
        .expect("Content-Type", /json/)
        .expect(500);

      expect(response.body).toEqual({ error: expect.any(String) });
      expect(JSON.stringify(response.body)).not.toMatch(
        /PRIVATE|UNKNOWN|stack|\.ts/,
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});
