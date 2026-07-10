/**
 * Manual backup: `npm run backup`. Same one-snapshot-per-day semantics as the
 * daemon's automatic run — if today's snapshot exists this reports it and
 * exits 0, because two snapshots of the same day protect nothing extra.
 */
import { backupDir, runDailyBackup } from "../src/db/backup";

const result = runDailyBackup();
if (result.skipped && result.path) {
  console.log(`Today's snapshot already exists: ${result.path}`);
} else if (result.path) {
  console.log(`Backup saved: ${result.files.join(", ")} → ${result.path}`);
  if (result.pruned.length > 0) console.log(`Pruned: ${result.pruned.join(", ")}`);
} else {
  console.error(`Backup FAILED — check ${backupDir()} permissions and that .data exists.`);
  process.exit(1);
}
