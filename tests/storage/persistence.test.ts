import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ledger } from "../../src/server/data/ledger";
import { openLedgerRepository } from "../../src/server/data/ledgerRepository";
import { ledgerWith, saleEntry } from "../fixtures";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryLedgerPath() {
  const directory = await mkdtemp(join(tmpdir(), "campfire-ledger-test-"));
  directories.push(directory);
  return join(directory, "ledger.json");
}

describe("file persistence (isolated temporary files)", () => {
  it("retains creates, edits, versions, and large decimal amounts across restarts", async () => {
    const filePath = await temporaryLedgerPath();
    await writeFile(filePath, JSON.stringify(ledgerWith()));
    const first = await openLedgerRepository(filePath);
    const created = await first.createEntry(
      saleEntry("LARGE", {
        lines: [
          { account: "1000", debit: "92233720368547758.07", credit: "0.00" },
          { account: "4000", debit: "0.00", credit: "92233720368547758.07" },
        ],
      }),
    );
    const second = await openLedgerRepository(filePath);
    expect(second.getEntry(created.entry.id)).toEqual(created);

    const updated = await second.updateEntry(
      created.entry.id,
      {
        ...created.entry,
        status: "void",
        memo: "Corrected after restart",
        lines: [
          { account: "1000", debit: "92233720368547758.08", credit: "0.00" },
          { account: "4000", debit: "0.00", credit: "92233720368547758.08" },
        ],
      },
      created.version,
    );
    const third = await openLedgerRepository(filePath);
    expect(third.getEntry(created.entry.id)).toEqual(updated);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(
      third.snapshot(),
    );
  });

  it("seeds a missing file without modifying the original fixture", async () => {
    const filePath = await temporaryLedgerPath();
    const original = structuredClone(ledger);
    const repository = await openLedgerRepository(filePath);
    expect(repository.snapshot()).toEqual(original);

    await repository.createEntry(saleEntry());
    const reopened = await openLedgerRepository(filePath);
    expect(reopened.getEntry("NEW-SALE").entry).toEqual(saleEntry());
    expect(ledger).toEqual(original);
  });
});
