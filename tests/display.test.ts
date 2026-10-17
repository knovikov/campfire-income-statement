import { describe, expect, it } from "vitest";
import { formatMoneyForDisplay } from "../src/client/utils/formatMoney";
import { formatDateForDisplay } from "../src/client/utils/formatDate";

describe("accountant-facing formatting", () => {
  it("preserves cents, large amounts, and negative signs without floating point", () => {
    expect(formatMoneyForDisplay("12450.75")).toBe("12,450.75");
    expect(formatMoneyForDisplay("-650.25")).toBe("(650.25)");
    expect(formatMoneyForDisplay("0.00")).toBe("0.00");
    expect(formatMoneyForDisplay("9007199254740993.99")).toBe(
      "9,007,199,254,740,993.99",
    );
    expect(() => formatMoneyForDisplay("1.999")).toThrow();
  });

  it("displays accounting dates without relying on the process timezone", () => {
    expect(formatDateForDisplay("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDateForDisplay("2026-03-31")).toBe("Mar 31, 2026");
    expect(formatDateForDisplay("2028-02-29")).toBe("Feb 29, 2028");
  });
});
