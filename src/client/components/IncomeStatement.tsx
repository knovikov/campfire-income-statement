import { Fragment, useState } from "react";
import type {
  IncomeStatementResponse,
  StatementAccount,
  StatementSection,
} from "../../shared/types";
import { ENABLE_ACCOUNT_DRILLDOWN } from "../config";
import { formatMoneyForDisplay } from "../utils/formatMoney";
import { AccountActivity } from "./AccountActivity";

interface SectionProps {
  title: string;
  totalLabel: string;
  section: StatementSection;
  startDate: string;
  endDate: string;
}

function AccountRow({
  account,
  startDate,
  endDate,
}: {
  account: StatementAccount;
  startDate: string;
  endDate: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = `activity-${account.account_number}`;
  return (
    <Fragment>
      <tr className="account-row">
        <td className="account-number">{account.account_number}</td>
        <th scope="row">
          {ENABLE_ACCOUNT_DRILLDOWN ? (
            <button
              type="button"
              className="account-toggle"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              aria-label={`${isExpanded ? "Hide" : "Show"} activity for ${account.account_name}`}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <span className="expand-icon" aria-hidden="true">
                {isExpanded ? "▾" : "▸"}
              </span>
              {account.account_name}
            </button>
          ) : (
            account.account_name
          )}
        </th>
        <td className="amount">{formatMoneyForDisplay(account.amount)}</td>
      </tr>
      {ENABLE_ACCOUNT_DRILLDOWN && isExpanded && (
        <tr className="activity-row">
          <td colSpan={3} id={panelId}>
            <AccountActivity
              accountNumber={account.account_number}
              startDate={startDate}
              endDate={endDate}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function AccountSection({
  title,
  totalLabel,
  section,
  startDate,
  endDate,
}: SectionProps) {
  return (
    <tbody>
      <tr className="section-heading">
        <th colSpan={3} scope="colgroup">
          {title}
        </th>
      </tr>
      {section.accounts.map((account) => (
        <AccountRow
          key={account.account_number}
          account={account}
          startDate={startDate}
          endDate={endDate}
        />
      ))}
      <tr className="subtotal-row">
        <th colSpan={2} scope="row">
          {totalLabel}
        </th>
        <td className="amount">{formatMoneyForDisplay(section.subtotal)}</td>
      </tr>
    </tbody>
  );
}

function ProfitRow({
  label,
  amount,
  isNetIncome = false,
}: {
  label: string;
  amount: string;
  isNetIncome?: boolean;
}) {
  return (
    <tbody>
      <tr className={isNetIncome ? "profit-row net-income" : "profit-row"}>
        <th colSpan={2} scope="row">
          {label}
        </th>
        <td className="amount">{formatMoneyForDisplay(amount)}</td>
      </tr>
    </tbody>
  );
}

export function IncomeStatement({
  report,
}: {
  report: IncomeStatementResponse;
}) {
  const period = { startDate: report.start_date, endDate: report.end_date };
  const allBalancesAreZero = [
    report.revenue,
    report.cost_of_goods_sold,
    report.operating_expenses,
    report.other_income,
  ].every((section) =>
    section.accounts.every((account) => account.amount === "0.00"),
  );

  return (
    <>
      {allBalancesAreZero && (
        <p className="empty-message" role="status">
          All account balances are zero for this period.
        </p>
      )}
      <div className="statement-scroll">
        <table className="statement-table">
          <caption className="visually-hidden">
            Income statement for {report.start_date} through {report.end_date},
            amounts in {report.currency}
          </caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Description</th>
              <th className="amount" scope="col">
                Amount ({report.currency})
              </th>
            </tr>
          </thead>
          <AccountSection
            title="Revenue"
            {...period}
            totalLabel="Total Revenue"
            section={report.revenue}
          />
          <AccountSection
            title="Cost of Goods Sold"
            {...period}
            totalLabel="Total Cost of Goods Sold"
            section={report.cost_of_goods_sold}
          />
          <ProfitRow label="Gross Profit" amount={report.gross_profit} />
          <AccountSection
            title="Operating Expenses"
            {...period}
            totalLabel="Total Operating Expenses"
            section={report.operating_expenses}
          />
          <ProfitRow
            label="Operating Income"
            amount={report.operating_income}
          />
          <AccountSection
            title="Other Income"
            {...period}
            totalLabel="Total Other Income"
            section={report.other_income}
          />
          <ProfitRow
            label="Net Income"
            amount={report.net_income}
            isNetIncome
          />
        </table>
      </div>
    </>
  );
}
