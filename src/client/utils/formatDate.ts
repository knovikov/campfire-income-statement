const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Display a validated accounting date directly, without timezone conversion. */
export function formatDateForDisplay(date: string): string {
  const [year, month, day] = date.split("-");
  return `${monthNames[Number(month) - 1]} ${Number(day)}, ${year}`;
}
