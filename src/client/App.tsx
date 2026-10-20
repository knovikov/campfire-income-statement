import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { IncomeStatementResponse, JournalEntry } from "../shared/types";
import { IncomeStatement } from "./components/IncomeStatement";
import { formatDateForDisplay } from "./utils/formatDate";
import { requestJson } from "./utils/requestJson";
import { JournalEntries } from "./components/JournalEntries";

const defaultPeriod = { start: "2026-01-01", end: "2026-03-31" };

export function App() {
  const [activeView, setActiveView] = useState<"income" | "journals">("income");
  const [startDate, setStartDate] = useState(defaultPeriod.start);
  const [endDate, setEndDate] = useState(defaultPeriod.end);
  const [requestedPeriod, setRequestedPeriod] = useState(defaultPeriod);
  const [report, setReport] = useState<IncomeStatementResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedEntry, setSavedEntry] = useState<JournalEntry | null>(null);
  const [revision, setRevision] = useState(0);
  const [isJournalEditing, setIsJournalEditing] = useState(false);

  function journalSaved(entry: JournalEntry) {
    setIsJournalEditing(false);
    setSavedEntry(entry);
    setRevision((current) => current + 1);
    // Refresh the applied period, even if the date inputs contain unapplied changes.
    setRequestedPeriod((current) => ({ ...current }));
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadReport() {
      setIsLoading(true);
      setError(null);
      const query = new URLSearchParams(requestedPeriod);
      try {
        const result = await requestJson<IncomeStatementResponse>(
          `/income-statement?${query}`,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setReport(result);
        }
      } catch (requestError: unknown) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load the report.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }
    void loadReport();
    return () => controller.abort();
  }, [requestedPeriod]);

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startDate || !endDate) {
      setFormError("Enter both a start date and an end date.");
      return;
    }
    if (startDate > endDate) {
      setFormError("Start date must be on or before end date.");
      return;
    }
    setFormError(null);
    setRequestedPeriod({ start: startDate, end: endDate });
  }

  return (
    <main className="page">
      <div className="page-heading">
        <span className="wordmark">NORTHWIND</span>
        <span className="page-context">Financial reporting</span>
      </div>

      <nav
        className="report-tabs"
        role="tablist"
        aria-label="Financial views"
        onKeyDown={(event) => {
          if (
            isJournalEditing ||
            !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
          )
            return;
          event.preventDefault();
          const nextView =
            event.key === "Home"
              ? "income"
              : event.key === "End"
                ? "journals"
                : activeView === "income"
                  ? "journals"
                  : "income";
          setActiveView(nextView);
          document.getElementById(`${nextView}-tab`)?.focus();
        }}
      >
        <button
          id="income-tab"
          type="button"
          role="tab"
          aria-selected={activeView === "income"}
          aria-controls="income-panel"
          tabIndex={activeView === "income" ? 0 : -1}
          disabled={isJournalEditing}
          onClick={() => setActiveView("income")}
        >
          Income statement
        </button>
        <button
          id="journals-tab"
          type="button"
          role="tab"
          aria-selected={activeView === "journals"}
          aria-controls="journals-panel"
          tabIndex={activeView === "journals" ? 0 : -1}
          disabled={isJournalEditing}
          onClick={() => setActiveView("journals")}
        >
          Journal entries
        </button>
      </nav>

      <div
        id="income-panel"
        role="tabpanel"
        aria-labelledby="income-tab"
        hidden={activeView !== "income"}
      >
        <section className="report-card" aria-labelledby="report-title">
          <header className="report-header">
            <p className="company-name">
              {report?.company ?? "Northwind Coffee Roasters"}
            </p>
            <div className="report-heading-row">
              <h1 id="report-title">Income Statement</h1>
            </div>
            <div className="report-meta">
              <p data-testid="report-period">
                {report
                  ? `${formatDateForDisplay(report.start_date)} through ${formatDateForDisplay(report.end_date)}`
                  : "Select a reporting period"}
              </p>
              <span className="currency-label">
                {report?.currency ?? "USD"}
              </span>
            </div>
          </header>

          <form className="date-controls" onSubmit={applyPeriod} noValidate>
            <div className="date-field">
              <label htmlFor="start-date">Start date</label>
              <input
                id="start-date"
                type="date"
                required
                disabled={isJournalEditing}
                min="0001-01-01"
                max="9999-12-31"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                aria-invalid={formError !== null}
                aria-describedby={formError ? "date-error" : undefined}
              />
            </div>
            <div className="date-field">
              <label htmlFor="end-date">End date</label>
              <input
                id="end-date"
                type="date"
                required
                disabled={isJournalEditing}
                min="0001-01-01"
                max="9999-12-31"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                aria-invalid={formError !== null}
                aria-describedby={formError ? "date-error" : undefined}
              />
            </div>
            <button
              className="apply-button"
              type="submit"
              disabled={isLoading || isJournalEditing}
            >
              {isLoading ? "Loading…" : "Apply"}
            </button>
            {formError && (
              <p id="date-error" className="form-error" role="alert">
                {formError}
              </p>
            )}
          </form>

          <div className="report-content" aria-busy={isLoading}>
            {savedEntry && (
              <p className="success-message" role="status">
                Journal entry {savedEntry.id} saved.
                {savedEntry.status !== "posted"
                  ? ` ${savedEntry.status === "draft" ? "Draft" : "Void"} entries do not affect the income statement.`
                  : savedEntry.date < requestedPeriod.start ||
                      savedEntry.date > requestedPeriod.end
                    ? " Its date is outside the selected reporting period."
                    : null}
              </p>
            )}
            {isLoading && (
              <p className="status-message" role="status">
                {report
                  ? "Updating report. Showing the last loaded period below."
                  : "Loading income statement…"}
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}{" "}
                {report
                  ? "The last loaded report is shown below."
                  : "Check that the API server is running, then apply the dates again."}
              </p>
            )}
            {report && (
              <IncomeStatement
                key={`${report.start_date}/${report.end_date}`}
                report={report}
                revision={revision}
                onJournalSaved={journalSaved}
                isJournalEditing={isJournalEditing || isLoading}
                onEditingChange={setIsJournalEditing}
              />
            )}
          </div>
          <footer className="report-footer">
            Posted entries only · Inclusive accounting dates · Amounts in{" "}
            {report?.currency ?? "USD"}
          </footer>
        </section>
      </div>
      <div
        id="journals-panel"
        role="tabpanel"
        aria-labelledby="journals-tab"
        hidden={activeView !== "journals"}
      >
        <JournalEntries
          active={activeView === "journals"}
          revision={revision}
          onJournalSaved={journalSaved}
          onEditingChange={setIsJournalEditing}
        />
      </div>
    </main>
  );
}
