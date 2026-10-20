import { describe, expect, it } from "vitest";
import {
  formatCentsAsDecimal,
  parseMoneyToCents,
} from "../../src/shared/money";

describe("exact money", () => {
  it.each([
    ["0", 0n, "0.00"],
    ["0.01", 1n, "0.01"],
    ["12", 1200n, "12.00"],
    ["12.4", 1240n, "12.40"],
    ["-650.25", -65025n, "-650.25"],
    ["-0.01", -1n, "-0.01"],
    ["-0.00", 0n, "0.00"],
    [
      "900719925474099312345.67",
      90071992547409931234567n,
      "900719925474099312345.67",
    ],
  ])(
    "parses %s to exact cents and serializes the canonical decimal",
    (input, cents, decimal) => {
      expect(parseMoneyToCents(input)).toBe(cents);
      expect(formatCentsAsDecimal(cents)).toBe(decimal);
    },
  );

  it.each([
    "",
    " 1.00",
    "+1.00",
    "1,000.00",
    "1e3",
    ".25",
    "1.",
    "1.001",
    "NaN",
  ])("rejects invalid or rounding-requiring input %j", (input) =>
    expect(() => parseMoneyToCents(input)).toThrow(),
  );

  it("adds and subtracts precision-sensitive values exactly", () => {
    const sum = parseMoneyToCents("0.10") + parseMoneyToCents("0.20");
    const net = parseMoneyToCents("1199.97") - parseMoneyToCents("100.00");
    expect(sum).toBe(30n);
    expect(formatCentsAsDecimal(sum)).toBe("0.30");
    expect(formatCentsAsDecimal(net)).toBe("1099.97");
  });
});
