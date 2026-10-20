import { formatCentsAsDecimal, parseMoneyToCents } from "../../shared/money";
import type {
  Account,
  IncomeStatementResponse,
  JournalEntry,
  JournalLine,
  Ledger,
  StatementSection,
} from "../../shared/types";
import { validateDateRange } from "./dates";

type SectionName =
  "revenue" | "cost_of_goods_sold" | "operating_expenses" | "other_income";
const sectionNames: SectionName[] = [
  "revenue",
  "cost_of_goods_sold",
  "operating_expenses",
  "other_income",
];

interface AccountBalance {
  account: Account;
  section: SectionName;
  cents: bigint;
}

function getSection(account: Account): SectionName | undefined {
  if (account.type !== "revenue" && account.type !== "expense") {
    return undefined;
  }
  switch (account.subtype) {
    case "operating_revenue":
    case "contra_revenue":
      return "revenue";
    case "cogs":
      return "cost_of_goods_sold";
    case "operating_expense":
      return "operating_expenses";
    case "other_income":
      return "other_income";
    default:
      throw new Error(
        `Income statement account ${account.number} has an invalid subtype.`,
      );
  }
}

/** Return a journal line's signed normal-balance impact in exact cents. */
export function getAccountContribution(
  account: Account,
  line: JournalLine,
): bigint {
  const debit = parseMoneyToCents(line.debit);
  const credit = parseMoneyToCents(line.credit);

  // Revenue increases with credits, while expenses increase with debits.
  // Preserve signs so refunds and vendor credits reduce the appropriate totals.
  if (
    account.type === "revenue" ||
    account.type === "liability" ||
    account.type === "equity"
  ) {
    return credit - debit;
  }
  return debit - credit;
}

/** Select posted activity using inclusive, already validated accounting-date boundaries. */
export function isEntryInPeriod(
  entry: JournalEntry,
  startDate: string,
  endDate: string,
): boolean {
  return (
    entry.status === "posted" &&
    entry.date >= startDate &&
    entry.date <= endDate
  );
}

/** Build an exact statement for an inclusive date range without mutating the ledger. */
export function buildIncomeStatement(
  ledger: Ledger,
  startDate: string,
  endDate: string,
): IncomeStatementResponse {
  validateDateRange(startDate, endDate);
  const accountsByNumber = new Map(
    ledger.accounts.map((account) => [account.number, account]),
  );
  const balances = new Map<string, AccountBalance>();

  for (const account of ledger.accounts) {
    const section = getSection(account);
    // Include zero-balance and inactive accounts to keep the statement consistent.
    if (section) {
      balances.set(account.number, { account, section, cents: 0n });
    }
  }

  for (const entry of ledger.journal_entries) {
    if (!isEntryInPeriod(entry, startDate, endDate)) {
      continue;
    }
    for (const line of entry.lines) {
      const account = accountsByNumber.get(line.account);
      if (!account) {
        throw new Error(
          `Journal entry ${entry.id} references unknown account ${line.account}.`,
        );
      }
      const balance = balances.get(account.number);
      if (balance) {
        balance.cents += getAccountContribution(account, line);
      }
    }
  }

  const sections: Record<SectionName, StatementSection> = {
    revenue: { accounts: [], subtotal: "0.00" },
    cost_of_goods_sold: { accounts: [], subtotal: "0.00" },
    operating_expenses: { accounts: [], subtotal: "0.00" },
    other_income: { accounts: [], subtotal: "0.00" },
  };
  const totals: Record<SectionName, bigint> = {
    revenue: 0n,
    cost_of_goods_sold: 0n,
    operating_expenses: 0n,
    other_income: 0n,
  };
  const sortedBalances = [...balances.values()].sort((left, right) =>
    left.account.number.localeCompare(right.account.number, "en", {
      numeric: true,
    }),
  );

  for (const balance of sortedBalances) {
    sections[balance.section].accounts.push({
      account_number: balance.account.number,
      account_name: balance.account.name,
      amount: formatCentsAsDecimal(balance.cents),
    });
    totals[balance.section] += balance.cents;
  }
  for (const section of sectionNames) {
    sections[section].subtotal = formatCentsAsDecimal(totals[section]);
  }

  const grossProfit = totals.revenue - totals.cost_of_goods_sold;
  const operatingIncome = grossProfit - totals.operating_expenses;
  const netIncome = operatingIncome + totals.other_income;

  return {
    company: ledger.company,
    currency: ledger.currency,
    start_date: startDate,
    end_date: endDate,
    ...sections,
    gross_profit: formatCentsAsDecimal(grossProfit),
    operating_income: formatCentsAsDecimal(operatingIncome),
    net_income: formatCentsAsDecimal(netIncome),
  };
}
