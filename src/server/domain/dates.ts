export class DateValidationError extends Error {}

/** Require a real, zero-padded Gregorian calendar date in years 0001 through 9999. */
export function validateAccountingDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new DateValidationError("Dates must use YYYY-MM-DD format.");
  }

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1]
  ) {
    throw new DateValidationError(`Invalid calendar date: ${date}.`);
  }
}

/** Validate inclusive accounting-date boundaries; a single-day range is valid. */
export function validateDateRange(startDate: string, endDate: string): void {
  validateAccountingDate(startDate);
  validateAccountingDate(endDate);

  // Accounting dates are calendar dates, not timestamps. Comparing validated
  // YYYY-MM-DD strings avoids timezone shifts and includes both boundaries.
  if (startDate > endDate) {
    throw new DateValidationError("Start date must be on or before end date.");
  }
}
