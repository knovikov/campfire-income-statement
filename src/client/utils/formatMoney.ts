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
  const groupedWholePart = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = `${groupedWholePart}.${fractionalPart}`;
  return isNegative ? `(${formatted})` : formatted;
}
