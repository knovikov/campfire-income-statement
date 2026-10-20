import { describe, expect, it } from "vitest";
import {
  DateValidationError,
  validateAccountingDate,
  validateDateRange,
} from "../../src/server/domain/dates";

describe("accounting calendar dates", () => {
  it.each([
    "2026-01-01",
    "2026-02-28",
    "2028-02-29",
    "2000-02-29",
    "2026-12-31",
    "0001-01-01",
    "9999-12-31",
  ])("accepts the valid calendar date %s", (date) => {
    expect(() => validateAccountingDate(date)).not.toThrow();
  });

  it.each([
    "",
    "2026-02-29",
    "2026-02-30",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "2026-2-3",
    "0000-01-01",
    "10000-01-01",
    "2026-01-01T00:00:00Z",
    " 2026-01-01",
  ])("rejects %j as a date-only boundary", (date) => {
    expect(() => validateAccountingDate(date)).toThrow(DateValidationError);
  });

  it("accepts a single-day range and rejects reversed or invalid ranges", () => {
    expect(() => validateDateRange("2026-03-31", "2026-03-31")).not.toThrow();
    expect(() => validateDateRange("2026-04-01", "2026-03-31")).toThrow(
      DateValidationError,
    );
    expect(() => validateDateRange("2026-01-01", "2026-02-29")).toThrow(
      DateValidationError,
    );
  });
});
