import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../../src/client/utils/requestJson";

function respondWith(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe("API response handling", () => {
  it("returns exact JSON strings and forwards POST options and cancellation", async () => {
    const payload = { entry: { debit: "9007199254740993.99" }, version: "v1" };
    const fetchMock = respondWith(Response.json(payload));
    const { signal } = new AbortController();
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debit: "10.01" }),
    };

    await expect(
      requestJson("/journal-entries", signal, options),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/journal-entries", {
      ...options,
      signal,
    });
  });

  it("shows the server's JSON validation message", async () => {
    respondWith(Response.json({ error: "Invalid date." }, { status: 400 }));
    await expect(requestJson("/income-statement")).rejects.toThrow(
      "Invalid date.",
    );
  });

  it("falls back to the HTTP status when an error has no message", async () => {
    respondWith(Response.json({}, { status: 500 }));
    await expect(requestJson("/income-statement")).rejects.toThrow(
      "Unable to load data (HTTP 500).",
    );
  });

  it.each(["", "<html>Bad gateway</html>"])(
    "explains an unreadable proxy response: %j",
    async (body) => {
      respondWith(new Response(body, { status: 502 }));
      await expect(requestJson("/income-statement")).rejects.toThrow(
        "Unable to read the server response. Please try again.",
      );
    },
  );

  it("propagates cancellation so callers can ignore it", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(controller.signal.reason));
    await expect(
      requestJson("/income-statement", controller.signal),
    ).rejects.toBe(controller.signal.reason);
  });
});
