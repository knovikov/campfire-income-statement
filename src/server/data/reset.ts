import { rm } from "node:fs/promises";
import { ledgerFilePath } from "./ledgerFile";

await rm(ledgerFilePath, { force: true });
console.log(
  "Local journal changes cleared. Restart the API to load the original ledger.",
);
