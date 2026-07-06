import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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
