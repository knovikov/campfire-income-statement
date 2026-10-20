import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { ledgerWith, saleEntry } from "../fixtures";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("report HTTP contracts", () => {
  const app = createApp(ledgerWith(saleEntry()));
  const period = "?start=2026-03-31&end=2026-03-31";

  it("returns the requested period and exact decimal strings", async () => {
    const response = await request(app)
      .get(`/income-statement${period}`)
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body).toMatchObject({
      company: "Test Coffee",
      currency: "USD",
      start_date: "2026-03-31",
      end_date: "2026-03-31",
      revenue: { subtotal: "10.01" },
      net_income: "10.01",
    });
  });

  it("returns account activity with exact debit, credit, and impact strings", async () => {
    const response = await request(app)
      .get(`/accounts/4000/activity${period}`)
      .expect(200);

    expect(response.body).toMatchObject({
      account_number: "4000",
      start_date: "2026-03-31",
      end_date: "2026-03-31",
      total: "10.01",
      activity: [
        {
          journal_id: "NEW-SALE",
          debit: "0.00",
          credit: "10.01",
          impact: "10.01",
        },
      ],
    });
  });

  it.each([
    "/income-statement",
    "/income-statement?start=2026-02-29&end=2026-03-31",
    "/income-statement?start=2026-01-01&start=2026-02-01&end=2026-03-31",
    "/accounts/4000/activity",
    "/accounts/4000/activity?start=2026-01-01&end=2026-03-31&end=2026-04-01",
  ])("returns JSON 400 for missing or invalid boundaries: %s", async (url) => {
    const response = await request(app)
      .get(url)
      .expect("Content-Type", /json/)
      .expect(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  it("returns JSON 404 for an unknown account", async () => {
    const response = await request(app)
      .get(`/accounts/unknown/activity${period}`)
      .expect(404);
    expect(response.body).toEqual({ error: expect.any(String) });
  });
});
