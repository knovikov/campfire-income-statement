import { describe, expect, it, vi } from "vitest";
import { createMemoryLedgerRepository } from "../../src/server/data/ledgerRepository";
import type { Ledger } from "../../src/shared/types";
import { ledgerWith, saleEntry } from "../fixtures";

describe("concurrent journal writes", () => {
  it("accepts only one create for the same ID and persists it once", async () => {
    const persist = vi.fn(async () => {});
    const repository = createMemoryLedgerRepository(ledgerWith(), persist);
    const results = await Promise.allSettled([
      repository.createEntry(saleEntry()),
      repository.createEntry(
        saleEntry("NEW-SALE", { memo: "Competing request" }),
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results).toContainEqual(
      expect.objectContaining({
        reason: expect.objectContaining({ status: 409 }),
      }),
    );
    expect(repository.listEntries()).toHaveLength(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("retains both distinct creates in memory and in the final saved ledger", async () => {
    const saved: Ledger[] = [];
    const repository = createMemoryLedgerRepository(
      ledgerWith(),
      async (next) => {
        saved.push(structuredClone(next));
      },
    );
    await Promise.all([
      repository.createEntry(saleEntry("SALE-A")),
      repository.createEntry(saleEntry("SALE-B")),
    ]);

    expect(
      repository
        .listEntries()
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(["SALE-A", "SALE-B"]);
    expect(saved.map((snapshot) => snapshot.journal_entries.length)).toEqual([
      1, 2,
    ]);
    expect(saved[1]).toEqual(repository.snapshot());
  });

  it("accepts only one edit using a shared version and keeps the winner", async () => {
    const repository = createMemoryLedgerRepository(ledgerWith(saleEntry()));
    const loaded = repository.getEntry("NEW-SALE");
    const results = await Promise.allSettled(
      ["Edit A", "Edit B"].map((memo) =>
        repository.updateEntry(
          loaded.entry.id,
          { ...loaded.entry, memo },
          loaded.version,
        ),
      ),
    );

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(results).toContainEqual(
      expect.objectContaining({
        reason: expect.objectContaining({ status: 409 }),
      }),
    );
    expect(results).toContainEqual({
      status: "fulfilled",
      value: repository.getEntry(loaded.entry.id),
    });
  });
});
