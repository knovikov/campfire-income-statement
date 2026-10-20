import { Fragment, useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { formatCentsAsDecimal, parseMoneyToCents } from "../../shared/money";
import type {
  Account,
  JournalEntry,
  JournalEntryListResponse,
} from "../../shared/types";
import { formatDateForDisplay } from "../utils/formatDate";
import { formatMoneyForDisplay } from "../utils/formatMoney";
import { requestJson } from "../utils/requestJson";
import { JournalEntryEditor } from "./JournalEntryEditor";

interface JournalEntriesProps {
  active: boolean;
  revision: number;
  onJournalSaved: (entry: JournalEntry) => void;
  onEditingChange: (editing: boolean) => void;
}

interface JournalFilters {
  q: string;
  start: string;
  end: string;
  status: "" | JournalEntry["status"];
}

const emptyFilters: JournalFilters = { q: "", start: "", end: "", status: "" };

function totalFor(entry: JournalEntry, side: "debit" | "credit"): string {
  return formatMoneyForDisplay(
    formatCentsAsDecimal(
      entry.lines.reduce(
        (total, line) => total + parseMoneyToCents(line[side]),
        0n,
      ),
    ),
  );
}

function EntryDetails({
  entry,
  accounts,
}: {
  entry: JournalEntry;
  accounts: Account[];
}) {
  const accountsByNumber = new Map(
    accounts.map((account) => [account.number, account]),
  );
  return (
    <div className="journal-entry-details">
      <table className="activity-table">
        <caption className="visually-hidden">
          All lines in journal entry {entry.id}
        </caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Type</th>
            <th scope="col" className="amount">
              Debit
            </th>
            <th scope="col" className="amount">
              Credit
            </th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((line, index) => {
            const account = accountsByNumber.get(line.account);
            return (
              <tr key={index}>
                <td>
                  {line.account} · {account?.name ?? "Unknown account"}
                  {account && !account.is_active ? " (inactive)" : ""}
                </td>
                <td>{account?.type ?? "—"}</td>
                <td className="amount">
                  {formatMoneyForDisplay(
                    formatCentsAsDecimal(parseMoneyToCents(line.debit)),
                  )}
                </td>
                <td className="amount">
                  {formatMoneyForDisplay(
                    formatCentsAsDecimal(parseMoneyToCents(line.credit)),
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Entry totals
            </th>
            <td className="amount">{totalFor(entry, "debit")}</td>
            <td className="amount">{totalFor(entry, "credit")}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function JournalEntries({
  active,
  revision,
  onJournalSaved,
  onEditingChange,
}: JournalEntriesProps) {
  const viewId = useId();
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [addingEntry, setAddingEntry] = useState(false);
  const [savedEntry, setSavedEntry] = useState<JournalEntry | null>(null);
  const editing = addingEntry || editingEntryId !== null;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setEntries(null);
    async function load() {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(appliedFilters)) {
        if (value) query.set(key, value);
      }
      try {
        const [result, accountResult] = await Promise.all([
          requestJson<JournalEntryListResponse>(
            `/journal-entries${query.size ? `?${query}` : ""}`,
            controller.signal,
          ),
          requestJson<{ accounts: Account[] }>("/accounts", controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setEntries(result.entries);
          setAccounts(accountResult.accounts);
        }
      } catch (requestError: unknown) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load journal entries.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [active, revision, appliedFilters, retry]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.start && filters.end && filters.start > filters.end) {
      setFormError("Start date must be on or before end date.");
      return;
    }
    setFormError(null);
    setAppliedFilters({ ...filters, q: filters.q.trim() });
  }

  function cancelEditing() {
    setAddingEntry(false);
    setEditingEntryId(null);
    onEditingChange(false);
  }

  function saved(entry: JournalEntry) {
    setSavedEntry(entry);
    cancelEditing();
    onJournalSaved(entry);
  }

  const dateSummary =
    appliedFilters.start || appliedFilters.end
      ? `${appliedFilters.start ? formatDateForDisplay(appliedFilters.start) : "Earliest date"} through ${appliedFilters.end ? formatDateForDisplay(appliedFilters.end) : "latest date"}`
      : "All dates";

  return (
    <section
      className="report-card journal-browser"
      aria-labelledby={`${viewId}-title`}
      hidden={!active}
    >
      <header className="report-header">
        <div className="report-heading-row">
          <h1 id={`${viewId}-title`}>Journal entries</h1>
          <button
            type="button"
            className="secondary-button"
            disabled={editing || loading}
            onClick={() => {
              setAddingEntry(true);
              onEditingChange(true);
            }}
          >
            + Add journal entry
          </button>
        </div>
        <p className="editor-help">
          Browse all posted, draft, and void entries. These filters are
          independent of the income statement period.
        </p>
      </header>

      <form className="journal-filter-controls" onSubmit={applyFilters}>
        <fieldset disabled={editing || loading}>
          <legend className="visually-hidden">Filter journal entries</legend>
          <div className="journal-field">
            <label htmlFor={`${viewId}-search`}>Search</label>
            <input
              id={`${viewId}-search`}
              type="search"
              maxLength={200}
              value={filters.q}
              placeholder="ID, description, or account"
              onChange={(event) =>
                setFilters((current) => ({ ...current, q: event.target.value }))
              }
            />
          </div>
          <div className="journal-field">
            <label htmlFor={`${viewId}-start`}>Start date (optional)</label>
            <input
              id={`${viewId}-start`}
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={filters.start}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  start: event.target.value,
                }))
              }
            />
          </div>
          <div className="journal-field">
            <label htmlFor={`${viewId}-end`}>End date (optional)</label>
            <input
              id={`${viewId}-end`}
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={filters.end}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  end: event.target.value,
                }))
              }
            />
          </div>
          <div className="journal-field">
            <label htmlFor={`${viewId}-status`}>Status</label>
            <select
              id={`${viewId}-status`}
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as JournalFilters["status"],
                }))
              }
            >
              <option value="">All statuses</option>
              <option value="posted">Posted</option>
              <option value="draft">Draft</option>
              <option value="void">Void</option>
            </select>
          </div>
          <button type="submit" className="apply-button">
            Apply filters
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setFilters(emptyFilters);
              setAppliedFilters({ ...emptyFilters });
              setFormError(null);
            }}
          >
            Clear filters
          </button>
        </fieldset>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
      </form>

      {addingEntry && (
        <div className="journal-create">
          <JournalEntryEditor onCancel={cancelEditing} onSaved={saved} />
        </div>
      )}

      <div className="report-content" aria-busy={loading}>
        {savedEntry && (
          <p className="success-message" role="status">
            Journal entry {savedEntry.id} saved.
            {entries && !entries.some((entry) => entry.id === savedEntry.id)
              ? " It does not match the current filters."
              : null}
          </p>
        )}
        {loading && (
          <p className="status-message" role="status">
            Loading journal entries…
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => setRetry((current) => current + 1)}
            >
              Retry journal entries
            </button>
          </p>
        )}
        {entries && (
          <>
            <p className="journal-result-count" role="status">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
              {dateSummary} · {appliedFilters.status || "All statuses"}
              {appliedFilters.q ? ` · Search: “${appliedFilters.q}”` : ""}
            </p>
            {entries.length === 0 ? (
              <p className="empty-message">
                No journal entries match these filters. Try clearing the filters
                or add a journal entry.
              </p>
            ) : (
              <div className="activity-scroll">
                <table className="journal-list-table">
                  <caption className="visually-hidden">
                    Journal entries, newest accounting date first. Amounts in
                    USD.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Journal</th>
                      <th scope="col">Status</th>
                      <th scope="col">Description</th>
                      <th scope="col" className="amount">
                        Total debits (USD)
                      </th>
                      <th scope="col">Lines</th>
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <Fragment key={entry.id}>
                        <tr>
                          <td className="entry-date">{entry.date}</td>
                          <th scope="row">{entry.id}</th>
                          <td>
                            <span
                              className={`status-badge status-${entry.status}`}
                            >
                              {entry.status}
                            </span>
                          </td>
                          <td>{entry.memo || "—"}</td>
                          <td className="amount">{totalFor(entry, "debit")}</td>
                          <td>{entry.lines.length}</td>
                          <td>
                            <button
                              type="button"
                              className="link-button"
                              disabled={editing}
                              aria-expanded={expandedEntryId === entry.id}
                              aria-controls={`${viewId}-details-${entry.id}`}
                              aria-label={`${expandedEntryId === entry.id ? "Hide" : "Show"} details for ${entry.id}`}
                              onClick={() =>
                                setExpandedEntryId((current) =>
                                  current === entry.id ? null : entry.id,
                                )
                              }
                            >
                              {expandedEntryId === entry.id
                                ? "Hide details"
                                : "Show details"}
                            </button>
                            <button
                              type="button"
                              className="link-button"
                              disabled={editing}
                              aria-label={`Edit ${entry.id}`}
                              onClick={() => {
                                setEditingEntryId(entry.id);
                                onEditingChange(true);
                              }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                        {expandedEntryId === entry.id && (
                          <tr>
                            <td
                              colSpan={7}
                              id={`${viewId}-details-${entry.id}`}
                            >
                              <EntryDetails entry={entry} accounts={accounts} />
                            </td>
                          </tr>
                        )}
                        {editingEntryId === entry.id && (
                          <tr className="journal-edit-row">
                            <td colSpan={7}>
                              <JournalEntryEditor
                                journalId={entry.id}
                                onCancel={cancelEditing}
                                onSaved={saved}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
