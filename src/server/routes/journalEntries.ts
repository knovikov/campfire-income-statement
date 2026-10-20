import { Router } from "express";
import type { LedgerRepository } from "../data/ledgerRepository";
import { JournalEntryError } from "../domain/journalEntries";
import { listJournalEntries } from "../domain/journalEntryList";

export function createJournalRouter(repository: LedgerRepository): Router {
  const router = Router();

  router.get("/accounts", (_request, response) => {
    response.json({ accounts: repository.listAccounts() });
  });

  router.get("/journal-entries", (request, response) => {
    const entries = listJournalEntries(
      repository.listEntries(),
      repository.listAccounts(),
      request.query,
    );
    response.json({ entries });
  });

  router.get("/journal-entries/:id", (request, response) => {
    response.json(repository.getEntry(request.params.id));
  });

  router.post("/journal-entries", async (request, response) => {
    const record = await repository.createEntry(request.body);
    response.location(
      `/journal-entries/${encodeURIComponent(record.entry.id)}`,
    );
    response.status(201).json(record);
  });

  router.put("/journal-entries/:id", async (request, response) => {
    const body: unknown = request.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new JournalEntryError(400, "Provide an entry and its version.");
    }
    const { entry, version } = body as Record<string, unknown>;
    response.json(
      await repository.updateEntry(request.params.id, entry, version),
    );
  });

  return router;
}
