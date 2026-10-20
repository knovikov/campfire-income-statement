import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { ledger } from "../../src/server/data/ledger";
import type { JournalEntry } from "../../src/shared/types";
import { ledgerWith, saleEntry } from "../fixtures";

const pendingPayroll = saleEntry("JE-2", {
  status: "draft",
  memo: "Pending payroll",
  lines: [
    { account: "6000", debit: "10.01", credit: "0.00" },
    { account: "1000", debit: "0.00", credit: "10.01" },
  ],
});

function browseLedger() {
  // Unsorted dates and JE-10 before JE-2 expose lexicographic ID sorting.
  return ledgerWith(
    saleEntry("JE-10", { memo: "Roaster [sale].* (A+B)?" }),
    pendingPayroll,
    saleEntry("JE-1", {
      date: "2026-01-01",
      status: "void",
      memo: "Cancelled Coffee SALE",
    }),
    saleEntry("JE-3", { date: "2026-04-01", memo: "April shipment" }),
  );
}

function entryIds(entries: JournalEntry[]) {
  return entries.map((entry) => entry.id);
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("GET /journal-entries", () => {
  it("defaults to all 25 supplied entries, including draft, void, and dates outside Q1", async () => {
    const response = await request(createApp(ledger))
      .get("/journal-entries")
      .expect("Content-Type", /json/)
      .expect(200);

    const entries: JournalEntry[] = response.body.entries;
    expect(entries).toHaveLength(25);
    expect(new Set(entries.map((entry) => entry.status))).toEqual(
      new Set(["posted", "draft", "void"]),
    );
    expect(entries[0].date).toBe("2026-04-01");
    expect(entries.at(-1)?.date).toBe("2025-12-15");
  });

  it("sorts by date newest first and same-day IDs numerically", async () => {
    const response = await request(createApp(browseLedger()))
      .get("/journal-entries")
      .expect(200);

    const sortedIds = entryIds(response.body.entries);
    expect(sortedIds).toEqual(["JE-3", "JE-2", "JE-10", "JE-1"]);
  });

  it.each([
    ["start", "2026-03-31", ["JE-3", "JE-2", "JE-10"]],
    ["end", "2026-03-31", ["JE-2", "JE-10", "JE-1"]],
  ])("includes the %s boundary", async (key, date, expected) => {
    const response = await request(createApp(browseLedger()))
      .get("/journal-entries")
      .query({ [key as string]: date })
      .expect(200);

    expect(entryIds(response.body.entries)).toEqual(expected);
  });

  it.each([
    ["posted", ["JE-3", "JE-10"]],
    ["draft", ["JE-2"]],
    ["void", ["JE-1"]],
  ])("filters the %s status", async (status, expected) => {
    const response = await request(createApp(browseLedger()))
      .get("/journal-entries")
      .query({ status })
      .expect(200);

    expect(entryIds(response.body.entries)).toEqual(expected);
  });

  it.each([
    ["trimmed, case-insensitive ID", " je-10 ", ["JE-10"]],
    ["case-insensitive description", "COFFEE sale", ["JE-1"]],
    ["account number", "6000", ["JE-2"]],
    ["case-insensitive account name", "salARies", ["JE-2"]],
    ["literal punctuation", "[sale].* (A+B)?", ["JE-10"]],
  ])("searches by %s", async (_description, q, expected) => {
    const response = await request(createApp(browseLedger()))
      .get("/journal-entries")
      .query({ q })
      .expect(200);

    expect(entryIds(response.body.entries)).toEqual(expected);
  });

  it("combines search, status, and both inclusive dates using AND", async () => {
    const source = browseLedger();
    source.journal_entries.push(
      { ...pendingPayroll, id: "BEFORE", date: "2026-03-30" },
      { ...pendingPayroll, id: "AFTER", date: "2026-04-01" },
      { ...pendingPayroll, id: "POSTED", status: "posted" },
      saleEntry("OTHER-ACCOUNT", { status: "draft" }),
    );
    const response = await request(createApp(source))
      .get("/journal-entries")
      .query({
        start: "2026-03-31",
        end: "2026-03-31",
        status: "draft",
        q: "salaries",
      })
      .expect(200);

    expect(entryIds(response.body.entries)).toEqual(["JE-2"]);
  });

  it("accepts a 200-character search and returns an empty collection for no matches", async () => {
    const response = await request(createApp(browseLedger()))
      .get("/journal-entries")
      .query({ q: "x".repeat(200) })
      .expect(200);

    expect(response.body).toEqual({ entries: [] });
  });

  it.each([
    "?start=",
    "?end=2026-02-29",
    "?start=2026-04-01&end=2026-03-31",
    "?status=POSTED",
    "?start=2026-01-01&start=2026-02-01",
    "?q[search]=sale",
    "?unknown=true",
  ])("rejects invalid or ambiguous query %s with JSON 400", async (query) => {
    const response = await request(createApp(browseLedger()))
      .get(`/journal-entries${query}`)
      .expect("Content-Type", /json/)
      .expect(400);

    expect(response.body).toEqual({ error: expect.any(String) });
  });

  it("rejects searches over 200 characters before trimming", async () => {
    const response = await request(createApp(browseLedger()))
      .get("/journal-entries")
      .query({ q: " ".repeat(201) })
      .expect(400);

    expect(response.body).toEqual({ error: expect.any(String) });
  });

  it("browses current data after creating and editing an entry", async () => {
    const app = createApp(browseLedger());
    const added = saleEntry("NEW", { status: "draft", memo: "Fresh booking" });
    const created = await request(app)
      .post("/journal-entries")
      .send(added)
      .expect(201);
    const afterCreate = await request(app)
      .get("/journal-entries")
      .query({ q: "Fresh booking" })
      .expect(200);
    expect(afterCreate.body).toEqual({ entries: [added] });

    const edited = {
      ...added,
      date: "2027-01-01",
      status: "void",
      memo: "Reclassified booking",
    };
    await request(app)
      .put("/journal-entries/NEW")
      .send({ entry: edited, version: created.body.version })
      .expect(200);
    const afterEdit = await request(app)
      .get("/journal-entries")
      .query({ start: "2027-01-01", status: "void", q: "reclassified" })
      .expect(200);
    expect(afterEdit.body).toEqual({ entries: [edited] });
    const oldDescription = await request(app)
      .get("/journal-entries")
      .query({ q: "Fresh booking" })
      .expect(200);
    expect(oldDescription.body).toEqual({ entries: [] });
  });
});
