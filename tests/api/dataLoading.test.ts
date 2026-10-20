import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppFromLedgerFile } from "../../src/server/app";
import {
  LedgerLoadError,
  openLedgerRepository,
} from "../../src/server/data/ledgerRepository";
import { ledgerWith, saleEntry } from "../fixtures";

let directory: string;
let filePath: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "campfire-invalid-ledger-"));
  filePath = join(directory, "ledger.json");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

describe("stored data failures", () => {
  const unbalanced = saleEntry("BROKEN");
  unbalanced.lines[0].debit = "10.02";

  it.each([
    ["truncated JSON", '{"company":', "the stored file is not valid JSON."],
    [
      "invalid ledger shape",
      "null",
      "Ledger must contain company and currency strings.",
    ],
    [
      "unbalanced journal",
      JSON.stringify(ledgerWith(unbalanced)),
      "Journal entry BROKEN is unbalanced: debits do not equal credits.",
    ],
  ])(
    "serves an actionable JSON error for %s without replacing stored data",
    async (_name, contents, detail) => {
      await writeFile(filePath, contents);
      await expect(openLedgerRepository(filePath)).rejects.toBeInstanceOf(
        LedgerLoadError,
      );
      const app = await createAppFromLedgerFile(filePath);
      const response = await request(app)
        .get("/income-statement?start=2026-01-01&end=2026-03-31")
        .expect("Content-Type", /json/)
        .expect(503);

      expect(response.body).toEqual({
        error: `Failed to load ledger data: ${detail} Check the stored ledger and restart the API.`,
      });
      const write = await request(app)
        .post("/journal-entries")
        .send(saleEntry())
        .expect(503);
      const browse = await request(app).get("/journal-entries").expect(503);
      expect(write.body).toEqual(response.body);
      expect(browse.body).toEqual(response.body);
      expect(JSON.stringify(response.body)).not.toContain(directory);
      expect(await readFile(filePath, "utf8")).toBe(contents);
    },
  );

  it("explains unreadable storage without exposing filesystem details", async () => {
    const app = await createAppFromLedgerFile(directory);
    const response = await request(app).get("/accounts").expect(503);
    expect(response.body).toEqual({
      error:
        "Failed to load ledger data: the stored file could not be read. Check the stored ledger and restart the API.",
    });
    expect(JSON.stringify(response.body)).not.toMatch(/EISDIR|stack|\/var\//);
  });

  it("loads repaired data on restart instead of retaining the previous failure", async () => {
    await writeFile(filePath, "not JSON");
    const failed = await createAppFromLedgerFile(filePath);
    await request(failed).get("/accounts").expect(503);

    const repaired = ledgerWith(saleEntry());
    await writeFile(filePath, JSON.stringify(repaired));
    const restarted = await createAppFromLedgerFile(filePath);
    const report = await request(restarted)
      .get("/income-statement?start=2026-03-31&end=2026-03-31")
      .expect(200);
    expect(report.body.net_income).toBe("10.01");
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(repaired);
  });
});
