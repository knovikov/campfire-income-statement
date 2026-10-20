import { formatCentsAsDecimal, parseMoneyToCents } from "../../shared/money";
import type {
  AccountActivityLine,
  AccountActivityResponse,
  Ledger,
} from "../../shared/types";
import { validateDateRange } from "./dates";
import { getAccountContribution, isEntryInPeriod } from "./incomeStatement";

export class AccountNotFoundError extends Error {}

/** List each contributing posted line and its exact total for an inclusive period. */
export function buildAccountActivity(
  ledger: Ledger,
  accountNumber: string,
  startDate: string,
  endDate: string,
): AccountActivityResponse {
  validateDateRange(startDate, endDate);
  const account = ledger.accounts.find(
    (candidate) => candidate.number === accountNumber,
  );
  if (!account) {
    throw new AccountNotFoundError(`Account ${accountNumber} was not found.`);
  }

  const activity: AccountActivityLine[] = [];
  let totalCents = 0n;
  for (const entry of ledger.journal_entries) {
    if (!isEntryInPeriod(entry, startDate, endDate)) {
      continue;
    }
    for (const line of entry.lines) {
      if (line.account !== accountNumber) {
        continue;
      }
      const contribution = getAccountContribution(account, line);
      totalCents += contribution;
      activity.push({
        journal_id: entry.id,
        date: entry.date,
        memo: entry.memo,
        debit: formatCentsAsDecimal(parseMoneyToCents(line.debit)),
        credit: formatCentsAsDecimal(parseMoneyToCents(line.credit)),
        impact: formatCentsAsDecimal(contribution),
      });
    }
  }
  activity.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.journal_id.localeCompare(right.journal_id),
  );

  return {
    account_number: account.number,
    account_name: account.name,
    currency: ledger.currency,
    start_date: startDate,
    end_date: endDate,
    total: formatCentsAsDecimal(totalCents),
    activity,
  };
}
