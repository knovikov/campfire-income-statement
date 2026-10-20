import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { createMemoryLedgerRepository } from "../../src/server/data/ledgerRepository";
import { ledgerWith, saleEntry } from "../fixtures";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("journal payload validation", () => {
  const [debit, credit] = saleEntry().lines;
  const invalidFields: [string, object][] = [
    ["unknown entry field", { unexpected: true }],
    ["unknown line field", { lines: [{ ...debit, unexpected: true }, credit] }],
    ["blank ID", { id: "  " }],
    ["dot-segment ID", { id: ".." }],
    ["impossible date", { date: "2026-02-29" }],
    ["unknown status", { status: "approved" }],
    ["missing memo", { memo: undefined }],
    ["unknown account", { lines: [{ ...debit, account: "9999" }, credit] }],
    ["numeric money", { lines: [{ ...debit, debit: 10.01 }, credit] }],
    [
      "rounding-requiring money",
      { lines: [{ ...debit, debit: "10.001" }, credit] },
    ],
    ["negative amount", { lines: [{ ...debit, debit: "-10.01" }, credit] }],
    [
      "both debit and credit",
      { lines: [{ ...debit, credit: "1.00" }, credit] },
    ],
    [
      "zero line",
      { lines: [debit, credit, { account: "1000", debit: "0", credit: "0" }] },
    ],
    ["one-cent imbalance", { lines: [{ ...debit, debit: "10.02" }, credit] }],
  ];

  it.each(invalidFields)("returns JSON 400 for %s", async (_name, fields) => {
    const response = await request(createApp(ledgerWith()))
      .post("/journal-entries")
      .send({ ...saleEntry(), ...fields })
      .expect("Content-Type", /json/)
      .expect(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  it.each([0, 1])(
    "rejects %i-line creates and edits without changing the entry",
    async (count) => {
      const repository = createMemoryLedgerRepository(ledgerWith(saleEntry()));
      const app = createApp(repository);
      const original = repository.getEntry("NEW-SALE");
      const input = saleEntry("TOO-SHORT", { lines: [debit].slice(0, count) });
      const created = await request(app)
        .post("/journal-entries")
        .send(input)
        .expect(400);
      const edited = await request(app)
        .put("/journal-entries/NEW-SALE")
        .send({
          entry: { ...input, id: original.entry.id },
          version: original.version,
        })
        .expect(400);

      const error = { error: "An entry requires at least two journal lines." };
      expect(created.body).toEqual(error);
      expect(edited.body).toEqual(error);
      expect(repository.listEntries()).toEqual([original.entry]);
      expect(repository.getEntry(original.entry.id)).toEqual(original);
    },
  );

  it.each([undefined, 123, " "])(
    "requires a nonblank string edit version: %j",
    async (version) => {
      const app = createApp(ledgerWith(saleEntry()));
      const response = await request(app)
        .put("/journal-entries/NEW-SALE")
        .send({ entry: saleEntry(), version })
        .expect(400);
      expect(response.body).toEqual({ error: expect.any(String) });
    },
  );
});

describe("inactive account history", () => {
  const historical = saleEntry("LEGACY", {
    lines: [
      { account: "6300", debit: "10.01", credit: "0.00" },
      { account: "1000", debit: "0.00", credit: "10.01" },
    ],
  });

  it("allows existing inactive lines to remain but rejects new postings", async () => {
    const repository = createMemoryLedgerRepository(ledgerWith(historical));
    const app = createApp(repository);
    await request(app)
      .post("/journal-entries")
      .send({ ...historical, id: "NEW" })
      .expect(400);
    const original = repository.getEntry("LEGACY");
    const response = await request(app)
      .put("/journal-entries/LEGACY")
      .send({
        entry: { ...historical, memo: "Clarified" },
        version: original.version,
      })
      .expect(200);
    expect(response.body.entry).toEqual({ ...historical, memo: "Clarified" });
  });

  it("rejects changed inactive amounts and transitioning inactive drafts to posted", async () => {
    const source = ledgerWith(historical, {
      ...historical,
      id: "DRAFT",
      status: "draft",
    });
    const repository = createMemoryLedgerRepository(source);
    const app = createApp(repository);
    const original = repository.getEntry("LEGACY");
    const changed = {
      ...historical,
      lines: [
        { account: "6300", debit: "20.02", credit: "0.00" },
        { account: "1000", debit: "0.00", credit: "20.02" },
      ],
    };
    await request(app)
      .put("/journal-entries/LEGACY")
      .send({ entry: changed, version: original.version })
      .expect(400);
    const draft = repository.getEntry("DRAFT");
    await request(app)
      .put("/journal-entries/DRAFT")
      .send({
        entry: { ...draft.entry, status: "posted" },
        version: draft.version,
      })
      .expect(400);
    expect(repository.snapshot()).toEqual(source);
  });
});
