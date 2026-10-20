import { describe, expect, it, vi } from "vitest";
import { createMemoryLedgerRepository } from "../../src/server/data/ledgerRepository";
import { ledgerWith, saleEntry } from "../fixtures";

describe("repository isolation and commit visibility", () => {
  it("protects committed data from mutations to every input and returned object", async () => {
    const source = ledgerWith();
    const original = structuredClone(source);
    const repository = createMemoryLedgerRepository(source);
    const input = saleEntry();
    const expected = structuredClone(input);
    const pending = repository.createEntry(input);
    input.memo = "Changed before the queued save";
    const created = await pending;

    expect(source).toEqual(original);
    source.company = "Changed externally";
    source.accounts[0].name = "Changed externally";
    input.lines[0].debit = "999.00";
    created.entry.lines[0].debit = "888.00";
    repository.snapshot().journal_entries[0].memo = "Changed externally";
    repository.listAccounts()[0].name = "Changed externally";
    repository.listEntries()[0].memo = "Changed externally";
    repository.getEntry(input.id).entry.memo = "Changed externally";

    expect(repository.snapshot()).toEqual({
      ...original,
      journal_entries: [expected],
    });
    expect(repository.getEntry(input.id).entry).toEqual(expected);
  });

  it("rejects invalid creates and edits without persisting or changing the version", async () => {
    const persist = vi.fn(async () => {});
    const repository = createMemoryLedgerRepository(
      ledgerWith(saleEntry()),
      persist,
    );
    const before = repository.snapshot();
    const loaded = repository.getEntry("NEW-SALE");
    const invalid = saleEntry("INVALID");
    invalid.lines[0].debit = "10.02";

    await expect(repository.createEntry(invalid)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      repository.updateEntry(
        loaded.entry.id,
        { ...invalid, id: loaded.entry.id },
        loaded.version,
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect(repository.snapshot()).toEqual(before);
    expect(repository.getEntry(loaded.entry.id)).toEqual(loaded);
    expect(persist).not.toHaveBeenCalled();
  });

  it("rolls back failed creates and edits, and allows each write to be retried", async () => {
    const persist = vi
      .fn(async () => {})
      .mockRejectedValueOnce(new Error("Disk unavailable"));
    const repository = createMemoryLedgerRepository(ledgerWith(), persist);
    const empty = repository.snapshot();

    await expect(repository.createEntry(saleEntry())).rejects.toThrow(
      "Disk unavailable",
    );
    expect(repository.snapshot()).toEqual(empty);
    const created = await repository.createEntry(saleEntry());
    const committed = repository.snapshot();
    const edit = { ...created.entry, memo: "An edited sale" };

    persist.mockRejectedValueOnce(new Error("Disk unavailable"));
    await expect(
      repository.updateEntry(edit.id, edit, created.version),
    ).rejects.toThrow("Disk unavailable");
    expect(repository.snapshot()).toEqual(committed);
    expect(repository.getEntry(edit.id)).toEqual(created);

    const retried = await repository.updateEntry(
      edit.id,
      edit,
      created.version,
    );
    expect(retried.entry).toEqual(edit);
    expect(retried.version).not.toBe(created.version);
  });

  it("exposes the old snapshot and version until persistence finishes", async () => {
    const saveStarted = deferred();
    const saveAllowed = deferred();
    const source = ledgerWith(saleEntry());
    const repository = createMemoryLedgerRepository(source, async () => {
      saveStarted.resolve();
      await saveAllowed.promise;
    });
    const before = repository.getEntry("NEW-SALE");
    const pending = repository.updateEntry(
      before.entry.id,
      { ...before.entry, memo: "Not committed yet" },
      before.version,
    );

    try {
      await saveStarted.promise;
      expect(repository.snapshot()).toEqual(source);
      expect(repository.getEntry(before.entry.id)).toEqual(before);
    } finally {
      saveAllowed.resolve();
    }
    const saved = await pending;
    expect(saved.entry.memo).toBe("Not committed yet");
    expect(repository.getEntry(before.entry.id)).toEqual(saved);
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
