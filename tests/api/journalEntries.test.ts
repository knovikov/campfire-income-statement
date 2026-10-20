import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { createMemoryLedgerRepository } from "../../src/server/data/ledgerRepository";
import { ledgerWith, saleEntry } from "../fixtures";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("journal entry HTTP contracts", () => {
  it("lists the account chart, including inactive accounts", async () => {
    const source = ledgerWith();
    const response = await request(createApp(source))
      .get("/accounts")
      .expect(200);
    expect(response.body).toEqual({ accounts: source.accounts });
  });

  it("accepts a balanced three-line entry and keeps reports and activity current through edits", async () => {
    const app = createApp(ledgerWith());
    const period = "?start=2026-01-01&end=2026-03-31";
    const input = saleEntry("NEW-SALE", {
      lines: [
        { account: "1000", debit: "0.1", credit: "0" },
        { account: "1000", debit: "0.20", credit: "0" },
        { account: "4000", debit: "0", credit: "0.3" },
      ],
    });
    const created = await request(app)
      .post("/journal-entries")
      .send(input)
      .expect(201);
    expect(created.headers.location).toBe("/journal-entries/NEW-SALE");
    expect(created.body.version).toEqual(expect.any(String));
    expect(created.body.version).not.toBe("");
    expect(created.body.entry).toEqual({
      ...input,
      lines: [
        { account: "1000", debit: "0.10", credit: "0.00" },
        { account: "1000", debit: "0.20", credit: "0.00" },
        { account: "4000", debit: "0.00", credit: "0.30" },
      ],
    });
    const loaded = await request(app).get(created.headers.location).expect(200);
    expect(loaded.body).toEqual(created.body);
    const firstReport = await request(app)
      .get(`/income-statement${period}`)
      .expect(200);
    expect(firstReport.body.net_income).toBe("0.30");

    const changed = saleEntry("NEW-SALE", {
      lines: [
        { account: "1000", debit: "20.02", credit: "0.00" },
        { account: "4000", debit: "0.00", credit: "20.02" },
      ],
    });
    const updated = await request(app)
      .put(created.headers.location)
      .send({ entry: changed, version: loaded.body.version })
      .expect(200);
    expect(updated.body.entry).toEqual(changed);
    expect(updated.body.version).not.toBe(created.body.version);
    const report = await request(app)
      .get(`/income-statement${period}`)
      .expect(200);
    const activity = await request(app)
      .get(`/accounts/4000/activity${period}`)
      .expect(200);
    expect(report.body.net_income).toBe("20.02");
    expect(activity.body).toMatchObject({
      total: "20.02",
      activity: [{ journal_id: "NEW-SALE", impact: "20.02" }],
    });
    expect(activity.body.activity).toHaveLength(1);

    await request(app)
      .put(created.headers.location)
      .send({
        entry: { ...changed, status: "draft" },
        version: updated.body.version,
      })
      .expect(200);
    const draftReport = await request(app)
      .get(`/income-statement${period}`)
      .expect(200);
    const draftActivity = await request(app)
      .get(`/accounts/4000/activity${period}`)
      .expect(200);
    expect(draftReport.body.net_income).toBe("0.00");
    expect(draftActivity.body).toMatchObject({ total: "0.00", activity: [] });
  });

  it("rejects duplicate IDs, stale versions, and identity changes without losing the accepted edit", async () => {
    const repository = createMemoryLedgerRepository(ledgerWith(saleEntry()));
    const app = createApp(repository);
    const original = repository.getEntry("NEW-SALE");
    const duplicate = await request(app)
      .post("/journal-entries")
      .send(saleEntry(" NEW-SALE "))
      .expect(409);
    expect(duplicate.body).toEqual({ error: expect.any(String) });
    const edited = { ...original.entry, memo: "Reviewed" };
    const updated = await request(app)
      .put("/journal-entries/NEW-SALE")
      .send({ entry: edited, version: original.version })
      .expect(200);
    const stale = await request(app)
      .put("/journal-entries/NEW-SALE")
      .send(original)
      .expect(409);
    expect(stale.body).toEqual({ error: expect.any(String) });
    const renamed = await request(app)
      .put("/journal-entries/NEW-SALE")
      .send({
        entry: { ...edited, id: "RENAMED" },
        version: updated.body.version,
      })
      .expect(400);
    expect(renamed.body).toEqual({ error: expect.any(String) });
    const current = await request(app)
      .get("/journal-entries/NEW-SALE")
      .expect(200);
    expect(current.body).toEqual(updated.body);
  });
});
