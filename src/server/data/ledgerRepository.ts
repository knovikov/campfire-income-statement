import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  Account,
  JournalEntry,
  JournalEntryRecord,
  Ledger,
} from "../../shared/types";
import {
  JournalEntryError,
  normalizeJournalEntry,
} from "../domain/journalEntries";
import {
  ledger as seedLedger,
  LedgerValidationError,
  validateLedger,
} from "./ledger";

/** A known storage failure with a safe, actionable message for API clients. */
export class LedgerLoadError extends Error {
  constructor(detail: string, cause: unknown) {
    super(
      `Failed to load ledger data: ${detail} Check the stored ledger and restart the API.`,
      { cause },
    );
  }
}

export interface LedgerRepository {
  snapshot(): Ledger;
  getEntry(id: string): JournalEntryRecord;
  listEntries(): JournalEntry[];
  listAccounts(): Account[];
  createEntry(value: unknown): Promise<JournalEntryRecord>;
  updateEntry(
    id: string,
    value: unknown,
    version: unknown,
  ): Promise<JournalEntryRecord>;
}

function recordFor(entry: JournalEntry): JournalEntryRecord {
  return {
    entry: structuredClone(entry),
    version: createHash("sha256").update(JSON.stringify(entry)).digest("hex"),
  };
}

/** Serialize complete mutations; publish a new snapshot only after persistence succeeds. */
export function createMemoryLedgerRepository(
  source: unknown,
  persist?: (ledger: Ledger) => Promise<void>,
): LedgerRepository {
  validateLedger(source);
  let current = structuredClone(source);
  let writes = Promise.resolve();

  function findEntry(id: string): JournalEntry {
    const entry = current.journal_entries.find(
      (entry) => entry.id === id.trim(),
    );
    if (!entry) {
      throw new JournalEntryError(404, `Journal entry ${id} was not found.`);
    }
    return entry;
  }

  function mutate(
    change: (candidate: Ledger) => JournalEntry,
  ): Promise<JournalEntryRecord> {
    const pending = writes.then(async () => {
      const candidate = structuredClone(current);
      const entry = change(candidate);
      validateLedger(candidate);
      await persist?.(structuredClone(candidate));
      current = candidate;
      return recordFor(entry);
    });
    // A rejected write must not prevent later independent mutations.
    writes = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  return {
    snapshot: () => structuredClone(current),
    getEntry: (id) => recordFor(findEntry(id)),
    listEntries: () => structuredClone(current.journal_entries),
    listAccounts: () => structuredClone(current.accounts),
    async createEntry(value) {
      const input = structuredClone(value);
      return mutate((candidate) => {
        const entry = normalizeJournalEntry(input, candidate.accounts);
        if (
          candidate.journal_entries.some((existing) => existing.id === entry.id)
        ) {
          throw new JournalEntryError(
            409,
            `Journal entry ${entry.id} already exists.`,
          );
        }
        candidate.journal_entries.push(entry);
        return entry;
      });
    },
    async updateEntry(id, value, version) {
      const input = structuredClone(value);
      return mutate((candidate) => {
        const previous = findEntry(id);
        if (typeof version !== "string" || version.trim() === "") {
          throw new JournalEntryError(
            400,
            "Provide the entry version loaded before editing.",
          );
        }
        if (recordFor(previous).version !== version) {
          throw new JournalEntryError(
            409,
            "This entry has changed. Reload it before saving your changes.",
          );
        }
        const entry = normalizeJournalEntry(
          input,
          candidate.accounts,
          previous,
        );
        const index = candidate.journal_entries.findIndex(
          (existing) => existing.id === previous.id,
        );
        candidate.journal_entries[index] = entry;
        return entry;
      });
    },
  };
}

/** Open the writable ledger, or start from the original fixture when it does not exist. */
export async function openLedgerRepository(
  filePath: string,
): Promise<LedgerRepository> {
  let source: unknown;
  try {
    source = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      source = seedLedger;
    } else if (error instanceof SyntaxError) {
      throw new LedgerLoadError("the stored file is not valid JSON.", error);
    } else {
      throw new LedgerLoadError("the stored file could not be read.", error);
    }
  }
  try {
    return createMemoryLedgerRepository(source, async (candidate) => {
      await mkdir(dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(
          temporaryPath,
          `${JSON.stringify(candidate, null, 2)}\n`,
          { flag: "wx" },
        );
        await rename(temporaryPath, filePath);
      } finally {
        await unlink(temporaryPath).catch(() => undefined);
      }
    });
  } catch (error) {
    if (error instanceof LedgerValidationError) {
      throw new LedgerLoadError(error.message, error);
    }
    throw error;
  }
}
