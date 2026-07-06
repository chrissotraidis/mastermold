import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneRoot = join(root, ".next", "standalone");

if (!existsSync(standaloneRoot)) {
  process.exit(0);
}

function copyFresh(source, destination) {
  if (!existsSync(source)) return;
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

copyFresh(join(root, ".next", "static"), join(standaloneRoot, ".next", "static"));
copyFresh(join(root, "public"), join(standaloneRoot, "public"));

const localOnlyPaths = [
  ".data",
  ".env",
  ".env.local",
  "engine/.env",
  "engine/out",
  "artifacts",
  "screenshots",
  "reports/private",
  "docs/private",
  ".claude",
  ".rds",
  ".scaffold",
  ".scaffold-debug",
  ".agents",
  ".codex",
  ".codex-audits",
];

for (const localPath of localOnlyPaths) {
  rmSync(join(standaloneRoot, localPath), { recursive: true, force: true });
}

function walk(dir, visit) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    visit(path, entry, stat);
    if (stat.isDirectory() && existsSync(path)) walk(path, visit);
  }
}

walk(standaloneRoot, (path, entry, stat) => {
  if ((stat.isDirectory() && entry === "__pycache__") || (stat.isFile() && entry.endsWith(".pyc"))) {
    rmSync(path, { recursive: true, force: true });
  }
});

for (const file of [join(standaloneRoot, "server.js"), join(standaloneRoot, ".next", "required-server-files.json")]) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, "utf8");
  writeFileSync(file, content.split(root).join("."), "utf8");
}
