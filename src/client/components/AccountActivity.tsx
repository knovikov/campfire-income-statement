import { Fragment, useEffect, useState } from "react";
import type { AccountActivityResponse, JournalEntry } from "../../shared/types";
import { formatMoneyForDisplay } from "../utils/formatMoney";
import { requestJson } from "../utils/requestJson";
import { JournalEntryEditor } from "./JournalEntryEditor";

interface AccountActivityProps {
  accountNumber: string;
  startDate: string;
  endDate: string;
  revision: number;
  onJournalSaved: (entry: JournalEntry) => void;
  isJournalEditing: boolean;
  onEditingChange: (editing: boolean) => void;
}

export function AccountActivity({
  accountNumber,
  startDate,
  endDate,
  revision,
  onJournalSaved,
  isJournalEditing,
  onEditingChange,
}: AccountActivityProps) {
  const [activity, setActivity] = useState<AccountActivityResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadActivity() {
      setActivity(null);
      setError(null);
      const query = new URLSearchParams({ start: startDate, end: endDate });
      try {
        const result = await requestJson<AccountActivityResponse>(
          `/accounts/${encodeURIComponent(accountNumber)}/activity?${query}`,
          controller.signal,
        );
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
  }, [accountNumber, startDate, endDate, revision, retry]);

  if (error) {
    return (
      <p className="activity-status" role="alert">
        {error}{" "}
        <button
          type="button"
          className="link-button"
          onClick={() => setRetry((current) => current + 1)}
        >
          Retry activity
        </button>
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
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {activity.activity.map((line, index) => (
                <Fragment key={`${line.journal_id}/${index}`}>
                  <tr>
                    <td className="activity-date">{line.date}</td>
                    <td>{line.journal_id}</td>
                    <td>{line.memo}</td>
                    <td className="amount">
                      {formatMoneyForDisplay(line.impact)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        disabled={isJournalEditing}
                        onClick={() => {
                          setEditingJournalId(`${line.journal_id}/${index}`);
                          onEditingChange(true);
                        }}
                        aria-label={`Edit ${line.journal_id}`}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                  {editingJournalId === `${line.journal_id}/${index}` && (
                    <tr className="journal-edit-row">
                      <td colSpan={5}>
                        <JournalEntryEditor
                          journalId={line.journal_id}
                          onCancel={() => {
                            setEditingJournalId(null);
                            onEditingChange(false);
                          }}
                          onSaved={(entry) => {
                            setEditingJournalId(null);
                            onJournalSaved(entry);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
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
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
