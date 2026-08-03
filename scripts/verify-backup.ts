/**
 * Non-destructive recovery drill: copies the newest snapshot to an isolated
 * temp directory, validates every JSON document and runs SQLite integrity
 * checks, then removes the temporary copy. Live `.data/` is never touched.
 */
import { runRestoreDrill } from "../src/db/backup";

const result = runRestoreDrill();
if (!result.ok) {
  console.error(`Restore drill FAILED: ${result.detail}`);
  process.exit(1);
}

console.log(`Restore drill passed: ${result.files.length} stores from ${result.snapshot}`);
console.log(result.detail);
