/**
 * Fails fast with a readable message when Node is too old. Without this, an
 * older Node rejects --experimental-sqlite with a bare "bad option" error.
 */
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(
    "Master Mold needs Node 22.5 or newer for its built-in SQLite store (found " + process.versions.node + ").\n" +
      "Install a newer Node, for example with 'nvm install 22', then run the command again.",
  );
  process.exit(1);
}
