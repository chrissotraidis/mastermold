/// <reference types="bun" />
/**
 * Test isolation: every run gets its own throwaway store unless a test sets
 * MASTERMOLD_DB itself. Without this, tests that read the default store would
 * open the operator's real book at .data/mastermold.db.json (the web server
 * and Bun now share one book) and could even write to it.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.MASTERMOLD_DB) {
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-test-store-")), "mastermold.db");
}
