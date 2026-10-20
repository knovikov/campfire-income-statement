/** Format an exact API decimal for display without converting money to Number. */
export function formatMoneyForDisplay(amount: string): string {
  if (!/^-?\d+\.\d{2}$/.test(amount)) {
    throw new Error(
      "Expected a monetary string with exactly two fractional digits.",
    );
  }
  const isNegative = amount.startsWith("-");
  const unsignedAmount = isNegative ? amount.slice(1) : amount;
  const [wholePart, fractionalPart] = unsignedAmount.split(".");
  // Group digits in one pass so very large amounts remain inexpensive to display.
  const firstGroupSize = wholePart.length % 3 || 3;
  const groups = [wholePart.slice(0, firstGroupSize)];
  for (let index = firstGroupSize; index < wholePart.length; index += 3) {
    groups.push(wholePart.slice(index, index + 3));
  }
  const groupedWholePart = groups.join(",");
  const formatted = `${groupedWholePart}.${fractionalPart}`;
  return isNegative ? `(${formatted})` : formatted;
}
