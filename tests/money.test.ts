import { describe, expect, it } from "vitest";
import {
  formatCentsAsDecimal,
  parseMoneyToCents,
} from "../src/server/domain/money";

describe("exact money", () => {
  it.each([
    ["0", 0n],
    ["0.00", 0n],
    ["12", 1200n],
    ["12.4", 1240n],
    ["12450.75", 1245075n],
    ["-650.25", -65025n],
    ["-0.01", -1n],
    ["-0.00", 0n],
    ["900719925474099312345.67", 90071992547409931234567n],
  ])("parses %s directly into integer cents", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each([
    "",
    " 1.00",
    "1.00 ",
    "+1.00",
    "1,000.00",
    "1e3",
    ".25",
    "1.",
    "1.001",
    "-1.999",
    "NaN",
    "Infinity",
    "--1",
  ])("rejects invalid or rounding-requiring input %j", (input) => {
    expect(() => parseMoneyToCents(input)).toThrow();
  });

  it.each([
    [0n, "0.00"],
    [1n, "0.01"],
    [1200n, "12.00"],
    [-65025n, "-650.25"],
    [-1n, "-0.01"],
    [90071992547409931234567n, "900719925474099312345.67"],
  ])("serializes %s cents without losing precision", (cents, expected) => {
    expect(formatCentsAsDecimal(cents)).toBe(expected);
  });

  it("adds and subtracts precision-sensitive values exactly", () => {
    const sum = parseMoneyToCents("0.10") + parseMoneyToCents("0.20");
    const net = parseMoneyToCents("1199.97") - parseMoneyToCents("100.00");
    expect(sum).toBe(30n);
    expect(formatCentsAsDecimal(sum)).toBe("0.30");
    expect(formatCentsAsDecimal(net)).toBe("1099.97");
  });
});
