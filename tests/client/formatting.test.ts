import { describe, expect, it } from "vitest";
import { formatMoneyForDisplay } from "../../src/client/utils/formatMoney";
import { formatDateForDisplay } from "../../src/client/utils/formatDate";

describe("accountant-facing formatting", () => {
  it("preserves cents, large amounts, and negative signs without floating point", () => {
    expect(formatMoneyForDisplay("12450.75")).toBe("12,450.75");
    expect(formatMoneyForDisplay("-650.25")).toBe("(650.25)");
    expect(formatMoneyForDisplay("0.00")).toBe("0.00");
    expect(() => formatMoneyForDisplay("1.999")).toThrow();
  });

  it("formats the signed 64-bit cent maximum exactly in either direction", () => {
    expect(formatMoneyForDisplay("92233720368547758.07")).toBe(
      "92,233,720,368,547,758.07",
    );
    expect(formatMoneyForDisplay("-92233720368547758.07")).toBe(
      "(92,233,720,368,547,758.07)",
    );
  });

  it("groups a payload-sized decimal without dropping digits or cents", () => {
    const whole = "123".repeat(10_000);
    expect(formatMoneyForDisplay(`${whole}.99`)).toBe(
      `${"123,".repeat(9_999)}123.99`,
    );
  });

  it("displays accounting dates without relying on the process timezone", () => {
    expect(formatDateForDisplay("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDateForDisplay("2026-03-31")).toBe("Mar 31, 2026");
    expect(formatDateForDisplay("2028-02-29")).toBe("Feb 29, 2028");
  });
});
