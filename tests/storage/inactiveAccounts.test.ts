import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLedgerRepository } from "../../src/server/data/ledgerRepository";
import type { Ledger } from "../../src/shared/types";
import { ledgerWith, saleEntry } from "../fixtures";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function savedLedger(source: Ledger) {
  const directory = await mkdtemp(join(tmpdir(), "campfire-inactive-test-"));
  directories.push(directory);
  const filePath = join(directory, "ledger.json");
  await writeFile(filePath, JSON.stringify(source));
  return filePath;
}

describe("inactive accounts across ledger loads", () => {
  it("retains posted history but prevents posting a draft after its account is deactivated", async () => {
    const historical = saleEntry("HISTORY");
    const filePath = await savedLedger(ledgerWith(historical));
    const first = await openLedgerRepository(filePath);
    const draft = await first.createEntry(
      saleEntry("DRAFT", { status: "draft" }),
    );
    const deactivated = first.snapshot();
    deactivated.accounts = deactivated.accounts.map((account) =>
      account.number === "4000" ? { ...account, is_active: false } : account,
    );
    const before = JSON.stringify(deactivated);
    await writeFile(filePath, before);
    const reopened = await openLedgerRepository(filePath);

    expect(reopened.getEntry(historical.id).entry).toEqual(historical);
    await expect(
      reopened.updateEntry(
        draft.entry.id,
        { ...draft.entry, status: "posted" },
        draft.version,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("inactive account 4000"),
    });
    expect(reopened.getEntry(draft.entry.id)).toEqual(draft);
    expect(reopened.snapshot()).toEqual(deactivated);
    expect(await readFile(filePath, "utf8")).toBe(before);
  });
});
