export type AccountType =
  "asset" | "liability" | "equity" | "revenue" | "expense";

export type AccountSubtype =
  | "operating_revenue"
  | "contra_revenue"
  | "cogs"
  | "operating_expense"
  | "other_income"
  | "balance_sheet";

export interface Account {
  number: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  is_active: boolean;
}

export interface JournalLine {
  account: string;
  debit: string;
  credit: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  status: "posted" | "draft" | "void";
  memo: string;
  lines: JournalLine[];
}

/** An opaque content version prevents stale edits overwriting newer changes. */
export interface JournalEntryRecord {
  entry: JournalEntry;
  version: string;
}

export interface JournalEntryListResponse {
  entries: JournalEntry[];
}

export interface Ledger {
  company: string;
  currency: string;
  accounts: Account[];
  journal_entries: JournalEntry[];
}

// API amounts are signed decimal strings with exactly two fractional digits.
// JSON cannot represent bigint, and numbers would lose monetary precision.
export interface StatementAccount {
  account_number: string;
  account_name: string;
  amount: string;
}

export interface StatementSection {
  accounts: StatementAccount[];
  subtotal: string;
}

export interface IncomeStatementResponse {
  company: string;
  currency: string;
  start_date: string;
  end_date: string;
  revenue: StatementSection;
  cost_of_goods_sold: StatementSection;
  gross_profit: string;
  operating_expenses: StatementSection;
  operating_income: string;
  other_income: StatementSection;
  net_income: string;
}

export interface AccountActivityLine {
  journal_id: string;
  date: string;
  memo: string;
  debit: string;
  credit: string;
  impact: string;
}

export interface AccountActivityResponse {
  account_number: string;
  account_name: string;
  currency: string;
  start_date: string;
  end_date: string;
  total: string;
  activity: AccountActivityLine[];
}
