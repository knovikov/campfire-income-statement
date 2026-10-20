import { fileURLToPath } from "node:url";

export const ledgerFilePath =
  process.env.LEDGER_FILE ??
  fileURLToPath(new URL("../../../data/ledger.local.json", import.meta.url));
