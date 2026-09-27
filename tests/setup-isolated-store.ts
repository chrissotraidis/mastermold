/// <reference types="bun" />
/**
 * Test isolation: every run gets its own throwaway store unless a test sets
 * MASTERMOLD_DB itself. Without this, tests that read the default store would
 * open the operator's real book at .data/mastermold.db.json (the web server
 * and Bun now share one book) and could even write to it.
 *
 * Every test's mkdtempSync(tmpdir()) lands in one folder per run, removed when
 * the run exits. Before this, each run left ~800 folders behind in the system
 * temp dir (35,000 and 2 GB after a day of runs).
 */
import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runRoot = mkdtempSync(join(tmpdir(), "mm-test-run-"));
process.env.TMPDIR = runRoot;
// A preload afterAll is global: it runs once, after every test file.
afterAll(() => rmSync(runRoot, { recursive: true, force: true }));

if (!process.env.MASTERMOLD_DB) {
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-test-store-")), "mastermold.db");
}
