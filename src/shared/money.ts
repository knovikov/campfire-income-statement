/** Parse a signed decimal with zero, one, or two fractional digits, without rounding. */
export function parseMoneyToCents(amount: string): bigint {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(amount)) {
    throw new Error(`Invalid monetary amount: ${JSON.stringify(amount)}`);
  }

  const isNegative = amount.startsWith("-");
  const unsignedAmount = isNegative ? amount.slice(1) : amount;
  const [wholePart, fractionalPart = ""] = unsignedAmount.split(".");
  // Convert decimal digits directly to integer cents, never through Number.
  const cents =
    BigInt(wholePart) * 100n + BigInt(fractionalPart.padEnd(2, "0"));
  return isNegative ? -cents : cents;
}

/** Serialize integer cents as a signed decimal string with exactly two fractional digits. */
export function formatCentsAsDecimal(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const magnitude = cents < 0n ? -cents : cents;
  const wholePart = magnitude / 100n;
  const fractionalPart = (magnitude % 100n).toString().padStart(2, "0");
  return `${sign}${wholePart}.${fractionalPart}`;
}
