import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { createMemoryLedgerRepository } from "../../src/server/data/ledgerRepository";
import { ledgerWith, saleEntry } from "../fixtures";

function saleForAmount(id: string, amount: string) {
  return saleEntry(id, {
    lines: [
      { account: "1000", debit: amount, credit: "0.00" },
      { account: "4000", debit: "0.00", credit: amount },
    ],
  });
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("large amounts across the API", () => {
  it.each([
    ["signed 64-bit cents", "92233720368547758.07", "92233720368547758.08"],
    [
      "30,000-digit amount within the request limit",
      `${"9".repeat(30_000)}.99`,
      `1${"0".repeat(30_000)}.00`,
    ],
  ])(
    "preserves cents through addition, edit, and reversal beyond %s",
    async (_name, amount, intermediate) => {
      const app = createApp(ledgerWith());
      const period = "?start=2026-01-01&end=2026-03-31";
      const original = saleForAmount("STEP-1", amount);
      const created = await request(app)
        .post("/journal-entries")
        .send(original)
        .expect(201);
      expect(created.body.entry).toEqual(original);
      const loaded = await request(app)
        .get(created.headers.location)
        .expect(200);
      expect(loaded.body).toEqual(created.body);
      const updated = await request(app)
        .put(created.headers.location)
        .send({
          entry: { ...original, memo: "Reviewed huge sale" },
          version: loaded.body.version,
        })
        .expect(200);
      expect(updated.body.entry.lines).toEqual(original.lines);

      await request(app)
        .post("/journal-entries")
        .send(saleForAmount("STEP-2", "0.01"))
        .expect(201);
      const beforeReversal = await request(app)
        .get(`/income-statement${period}`)
        .expect(200);
      expect(beforeReversal.body.net_income).toBe(intermediate);

      const reversal = saleEntry("STEP-3", {
        lines: original.lines.map((line) => ({
          account: line.account,
          debit: line.credit,
          credit: line.debit,
        })),
      });
      await request(app).post("/journal-entries").send(reversal).expect(201);
      await request(app)
        .post("/journal-entries")
        .send(saleForAmount("STEP-4", "12.34"))
        .expect(201);
      const report = await request(app)
        .get(`/income-statement${period}`)
        .expect(200);
      const activity = await request(app)
        .get(`/accounts/4000/activity${period}`)
        .expect(200);
      expect(report.body.net_income).toBe("12.35");
      expect(activity.body).toMatchObject({
        total: "12.35",
        activity: [
          { journal_id: "STEP-1", impact: amount },
          { journal_id: "STEP-2", impact: "0.01" },
          { journal_id: "STEP-3", impact: `-${amount}` },
          { journal_id: "STEP-4", impact: "12.34" },
        ],
      });
    },
  );

  it("rejects unsafe numeric JSON and oversized amount strings without changing state, then accepts a valid entry", async () => {
    const repository = createMemoryLedgerRepository(ledgerWith());
    const app = createApp(repository);
    const before = repository.snapshot();
    const numeric = await request(app)
      .post("/journal-entries")
      .send({
        ...saleEntry("NUMERIC"),
        lines: [
          { account: "1000", debit: 9007199254740992, credit: 0 },
          { account: "4000", debit: 0, credit: 9007199254740992 },
        ],
      })
      .expect(400);
    expect(numeric.body).toEqual({ error: expect.any(String) });
    expect(numeric.body.error).toMatch(/account, debit, and credit strings/);
    expect(repository.snapshot()).toEqual(before);

    const oversized = await request(app)
      .post("/journal-entries")
      .send(saleForAmount("OVERSIZED", `${"9".repeat(70_000)}.00`))
      .expect(413);
    expect(oversized.body.error).toMatch(/too large.*64 KB/);
    expect(repository.snapshot()).toEqual(before);
    const unchanged = await request(app)
      .get("/income-statement?start=2026-01-01&end=2026-03-31")
      .expect(200);
    expect(unchanged.body.net_income).toBe("0.00");
    await request(app)
      .post("/journal-entries")
      .send(saleEntry("RECOVERY"))
      .expect(201);
    expect(repository.snapshot().journal_entries).toEqual([
      saleEntry("RECOVERY"),
    ]);
  });
});
