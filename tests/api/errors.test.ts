import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { createMemoryLedgerRepository } from "../../src/server/data/ledgerRepository";
import { ledgerWith, saleEntry } from "../fixtures";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function expectRequestLog(method: string, url: string, status: number) {
  expect(console.info).toHaveBeenCalledTimes(1);
  expect(console.info).toHaveBeenCalledWith(expect.any(String));
  const [message] = vi.mocked(console.info).mock.calls[0];
  const prefix = `${method} ${url} ${status} `;
  expect(message.slice(0, prefix.length)).toBe(prefix);
  expect(message.slice(prefix.length)).toMatch(/^\d+(?:\.\d+)? ms$/);
}

describe("API errors and request logging", () => {
  it.each([
    ["get", "/income-statement?start=2026-01-01&end=2026-03-31", 200],
    ["get", "/income-statement", 400],
    ["post", "/missing?source=browser", 404],
  ] as const)(
    "logs one completed %s %s response with status %s",
    async (method, url, status) => {
      await request(createApp(ledgerWith()))
        [method](url)
        .expect("Content-Type", /json/)
        .expect(status);
      expectRequestLog(method.toUpperCase(), url, status);
    },
  );

  it("returns JSON 404 when reading or editing a missing entry", async () => {
    const app = createApp(ledgerWith());
    const missing = await request(app)
      .get("/journal-entries/missing")
      .expect(404);
    const edit = await request(app)
      .put("/journal-entries/missing")
      .send({ entry: saleEntry("missing"), version: "old" })
      .expect(404);
    expect(missing.body).toEqual({ error: expect.any(String) });
    expect(edit.body).toEqual({ error: expect.any(String) });
  });

  it("returns JSON 400 for malformed JSON and 413 for oversized bodies", async () => {
    const app = createApp(ledgerWith());
    const malformed = await request(app)
      .post("/journal-entries")
      .type("json")
      .send('{"id":')
      .expect("Content-Type", /json/)
      .expect(400);
    const oversized = await request(app)
      .post("/journal-entries")
      .send(saleEntry("LARGE", { memo: "x".repeat(150_000) }))
      .expect("Content-Type", /json/)
      .expect(413);
    expect(malformed.body).toEqual({ error: expect.any(String) });
    expect(oversized.body).toEqual({ error: expect.any(String) });
  });

  it("logs unexpected failures as 500 without exposing internal details", async () => {
    const repository = createMemoryLedgerRepository(ledgerWith(), async () => {
      throw new Error("PRIVATE-DISK-ERROR");
    });
    const response = await request(createApp(repository))
      .post("/journal-entries")
      .send(saleEntry())
      .expect("Content-Type", /json/)
      .expect(500);
    expect(response.body).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|stack|\.ts/);
    expect(console.error).toHaveBeenCalled();
    expectRequestLog("POST", "/journal-entries", 500);
  });
});
