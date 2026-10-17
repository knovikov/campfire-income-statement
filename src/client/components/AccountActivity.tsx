import { useEffect, useState } from "react";
import type { AccountActivityResponse } from "../../shared/types";
import { formatMoneyForDisplay } from "../utils/formatMoney";

interface AccountActivityProps {
  accountNumber: string;
  startDate: string;
  endDate: string;
}

export function AccountActivity({
  accountNumber,
  startDate,
  endDate,
}: AccountActivityProps) {
  const [activity, setActivity] = useState<AccountActivityResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadActivity() {
      const query = new URLSearchParams({ start: startDate, end: endDate });
      try {
        const response = await fetch(
          `/accounts/${encodeURIComponent(accountNumber)}/activity?${query}`,
          {
            signal: controller.signal,
          },
        );
        const result: AccountActivityResponse | { error: string } =
          await response.json();
        if (!response.ok || "error" in result) {
          throw new Error(
            "error" in result
              ? result.error
              : "Unable to load account activity.",
          );
        }
        if (!controller.signal.aborted) {
          setActivity(result);
        }
      } catch (requestError: unknown) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load account activity.",
          );
        }
      }
    }
    void loadActivity();
    return () => controller.abort();
  }, [accountNumber, startDate, endDate]);

  if (error) {
    return (
      <p className="activity-status" role="alert">
        {error} Close and reopen the account to retry.
      </p>
    );
  }
  if (!activity) {
    return (
      <p className="activity-status" role="status">
        Loading account activity…
      </p>
    );
  }

  return (
    <div className="activity-panel">
      <p className="activity-label">
        Posted journal lines · {activity.account_name}
      </p>
      {activity.activity.length === 0 ? (
        <p className="activity-status">
          No posted activity for this account in the reporting period.
        </p>
      ) : (
        <div className="activity-scroll">
          <table className="activity-table">
            <caption className="visually-hidden">
              {activity.account_name} activity from {startDate} through{" "}
              {endDate}
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Journal</th>
                <th scope="col">Description</th>
                <th className="amount" scope="col">
                  Impact ({activity.currency})
                </th>
              </tr>
            </thead>
            <tbody>
              {activity.activity.map((line, index) => (
                <tr key={`${line.journal_id}/${index}`}>
                  <td className="activity-date">{line.date}</td>
                  <td>{line.journal_id}</td>
                  <td>{line.memo}</td>
                  <td className="amount">
                    {formatMoneyForDisplay(line.impact)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3} scope="row">
                  Account total
                </th>
                <td className="amount">
                  {formatMoneyForDisplay(activity.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
