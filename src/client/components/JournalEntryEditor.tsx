import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { formatCentsAsDecimal } from "../../shared/money";
import type {
  Account,
  AccountType,
  JournalEntry,
  JournalEntryRecord,
  JournalLine,
} from "../../shared/types";
import { formatMoneyForDisplay } from "../utils/formatMoney";
import { getJournalTotals, prepareJournalEntry } from "../utils/journalForm";
import { requestJson } from "../utils/requestJson";

interface JournalEntryEditorProps {
  journalId?: string;
  initialDate?: string;
  initialAccount?: string;
  onSaved: (entry: JournalEntry) => void;
  onCancel: () => void;
}

const accountGroups: { type: AccountType; label: string }[] = [
  { type: "asset", label: "Assets" },
  { type: "liability", label: "Liabilities" },
  { type: "equity", label: "Equity" },
  { type: "revenue", label: "Revenue" },
  { type: "expense", label: "Expenses" },
];

function emptyLine(account = ""): JournalLine {
  return { account, debit: "", credit: "" };
}

function localToday(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function JournalEntryEditor({
  journalId,
  initialDate,
  initialAccount,
  onSaved,
  onCancel,
}: JournalEntryEditorProps) {
  const formId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nextLineKey = useRef(2);
  const [lineKeys, setLineKeys] = useState([0, 1]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [originalAccounts, setOriginalAccounts] = useState<string[]>([]);
  const [entry, setEntry] = useState<JournalEntry>({
    id: "",
    date: initialDate || localToday(),
    memo: "",
    status: "posted",
    lines: [emptyLine(initialAccount), emptyLine()],
  });
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    async function load() {
      try {
        const [accountResult, record] = await Promise.all([
          requestJson<{ accounts: Account[] }>("/accounts", controller.signal),
          journalId
            ? requestJson<JournalEntryRecord>(
                `/journal-entries/${encodeURIComponent(journalId)}`,
                controller.signal,
              )
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        setAccounts(accountResult.accounts);
        if (record) {
          setEntry(record.entry);
          setVersion(record.version);
          setOriginalAccounts(record.entry.lines.map((line) => line.account));
          setLineKeys(record.entry.lines.map((_, index) => index));
          nextLineKey.current = record.entry.lines.length;
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load the editor.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [journalId, loadAttempt]);

  useEffect(() => {
    if (!loading) titleRef.current?.focus({ preventScroll: true });
  }, [loading]);

  function updateLine(index: number, field: keyof JournalLine, value: string) {
    setEntry((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }

  function addLine() {
    const key = nextLineKey.current++;
    setLineKeys((current) => [...current, key]);
    setEntry((current) => ({
      ...current,
      lines: [...current.lines, emptyLine()],
    }));
  }

  function removeLine(index: number) {
    setLineKeys((current) =>
      current.filter((_, lineIndex) => lineIndex !== index),
    );
    setEntry((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    let prepared: JournalEntry;
    try {
      prepared = prepareJournalEntry(entry);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Check the entry.");
      return;
    }
    setSaving(true);
    try {
      const result = await requestJson<JournalEntryRecord>(
        journalId
          ? `/journal-entries/${encodeURIComponent(journalId)}`
          : "/journal-entries",
        undefined,
        {
          method: journalId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            journalId ? { entry: prepared, version } : prepared,
          ),
        },
      );
      onSaved(result.entry);
    } catch (error: unknown) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save the journal entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  const totals = getJournalTotals(entry.lines);
  const balance = totals ? totals.debits - totals.credits : null;
  const title = journalId
    ? `Edit journal entry ${journalId}`
    : "Add journal entry";

  return (
    <section
      className="journal-editor"
      aria-labelledby={`${formId}-title`}
      aria-busy={loading || saving}
    >
      <h3 id={`${formId}-title`} ref={titleRef} tabIndex={-1}>
        {title}
      </h3>
      {loading ? (
        <p role="status">Loading journal entry editor…</p>
      ) : loadError ? (
        <>
          <p className="error-message" role="alert">
            {loadError}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Retry loading
          </button>
        </>
      ) : (
        <form onSubmit={(event) => void save(event)}>
          <p className="editor-help">
            Edit the complete entry, including its balancing lines. All lines
            save together; total debits must equal total credits. Only posted
            entries affect the report.
          </p>
          <fieldset disabled={saving}>
            <legend className="visually-hidden">
              Journal entry details and lines
            </legend>
            <div className="journal-fields">
              <div className="journal-field">
                <label htmlFor={`${formId}-id`}>Journal entry ID</label>
                <input
                  id={`${formId}-id`}
                  value={entry.id}
                  required
                  readOnly={!!journalId}
                  placeholder="e.g. JE-030"
                  aria-describedby={`${formId}-id-help`}
                  onChange={(event) =>
                    setEntry((current) => ({
                      ...current,
                      id: event.target.value,
                    }))
                  }
                />
                <small id={`${formId}-id-help`} className="editor-help">
                  {journalId
                    ? "The existing entry ID stays the same."
                    : "The server checks this ID is unique when you save."}
                </small>
              </div>
              <div className="journal-field">
                <label htmlFor={`${formId}-date`}>Accounting date</label>
                <input
                  id={`${formId}-date`}
                  type="date"
                  value={entry.date}
                  min="0001-01-01"
                  max="9999-12-31"
                  required
                  onChange={(event) =>
                    setEntry((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="journal-field">
                <label htmlFor={`${formId}-status`}>Status</label>
                <select
                  id={`${formId}-status`}
                  value={entry.status}
                  onChange={(event) =>
                    setEntry((current) => ({
                      ...current,
                      status: event.target.value as JournalEntry["status"],
                    }))
                  }
                >
                  <option value="posted">Posted</option>
                  <option value="draft">Draft</option>
                  <option value="void">Void</option>
                </select>
              </div>
              <div className="journal-field journal-memo">
                <label htmlFor={`${formId}-memo`}>Description</label>
                <input
                  id={`${formId}-memo`}
                  value={entry.memo}
                  onChange={(event) =>
                    setEntry((current) => ({
                      ...current,
                      memo: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="activity-scroll">
              <table className="journal-lines">
                <caption className="visually-hidden">
                  Journal lines. Enter a positive debit or credit for each line.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Debit</th>
                    <th scope="col">Credit</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line, index) => (
                    <tr key={lineKeys[index]}>
                      <td>
                        <label
                          className="visually-hidden"
                          htmlFor={`${formId}-account-${lineKeys[index]}`}
                        >
                          Line {index + 1} account
                        </label>
                        <select
                          id={`${formId}-account-${lineKeys[index]}`}
                          value={line.account}
                          required
                          onChange={(event) =>
                            updateLine(index, "account", event.target.value)
                          }
                        >
                          <option value="">Choose an account</option>
                          {accountGroups.map((group) => (
                            <optgroup key={group.type} label={group.label}>
                              {accounts
                                .filter(
                                  (account) =>
                                    account.type === group.type &&
                                    (account.is_active ||
                                      (account.number === line.account &&
                                        originalAccounts.includes(
                                          account.number,
                                        ))),
                                )
                                .map((account) => (
                                  <option
                                    key={account.number}
                                    value={account.number}
                                    disabled={!account.is_active}
                                  >
                                    {account.number} · {account.name}
                                    {account.is_active ? "" : " (inactive)"}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      {(["debit", "credit"] as const).map((side) => (
                        <td key={side}>
                          <label
                            className="visually-hidden"
                            htmlFor={`${formId}-${side}-${lineKeys[index]}`}
                          >
                            Line {index + 1} {side}
                          </label>
                          <input
                            id={`${formId}-${side}-${lineKeys[index]}`}
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={line[side]}
                            onChange={(event) =>
                              updateLine(index, side, event.target.value)
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          disabled={entry.lines.length <= 2}
                          aria-label={`Remove line ${index + 1}`}
                          onClick={() => removeLine(index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={addLine}
            >
              Add line
            </button>
            <div className="journal-totals" aria-live="polite">
              <span>
                Debits:{" "}
                <strong>
                  {totals
                    ? formatMoneyForDisplay(formatCentsAsDecimal(totals.debits))
                    : "—"}
                </strong>
              </span>
              <span>
                Credits:{" "}
                <strong>
                  {totals
                    ? formatMoneyForDisplay(
                        formatCentsAsDecimal(totals.credits),
                      )
                    : "—"}
                </strong>
              </span>
              <span>
                {balance === 0n
                  ? "Balanced"
                  : balance === null
                    ? "Check amount formatting"
                    : `Difference: ${formatMoneyForDisplay(formatCentsAsDecimal(balance))}`}
              </span>
            </div>
            {saveError && (
              <p className="error-message" role="alert">
                {saveError} Your changes are still in this form.
              </p>
            )}
            {saveError && journalId && (
              <button
                type="button"
                className="link-button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                Reload latest entry (discard edits)
              </button>
            )}
            <div className="journal-actions">
              <button type="submit" className="apply-button">
                {saving
                  ? "Saving…"
                  : journalId
                    ? "Save entry"
                    : "Add journal entry"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {(loading || loadError) && (
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </section>
  );
}
