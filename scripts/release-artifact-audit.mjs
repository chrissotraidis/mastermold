#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const root = process.cwd();
const standaloneRoot = join(root, ".next", "standalone");

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

if (!exists(standaloneRoot)) {
  console.log("Release artifact audit skipped: .next/standalone does not exist.");
  process.exit(0);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

function normalize(path) {
  return path.split(sep).join("/");
}

const blockedExact = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "CLAUDE.md",
  "SKILLS.md",
  "tasks.json",
  "spec.md",
  "config.yml",
  "launch-build.sh",
  "runbook.md",
  "public/rds-deploy-fingerprint.json",
  "public/.well-known/rds-deploy-fingerprint.json",
]);

const blockedPrefixes = [
  ".data/",
  ".claude/",
  ".rds/",
  ".scaffold/",
  ".scaffold-debug/",
  ".well-known/",
  "public/.well-known/",
  ".agents/",
  ".codex/",
  ".codex-audits/",
  "artifacts/",
  "screenshots/",
  "reports/private/",
  "docs/private/",
  "docs/ref/",
  "docs/review/",
  "docs/history/",
  "docs/research/",
  "docs/roadmap/",
  "docs/design/",
  "engine/out/",
];

const blockedSuffixes = [
  ".db",
  ".db-journal",
  ".db-wal",
  ".db-shm",
  ".sqlite",
  ".sqlite-journal",
  ".sqlite-wal",
  ".sqlite-shm",
];

const binaryExts = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico",
  ".pdf",
  ".lock",
  ".dylib",
  ".node",
  ".pyc",
  ".wasm",
]);

const patterns = [
  ["personal path", /\/Users\/[^/\s"'`]+|\/home\/workspace\/Programs\/[^/\s"'`]+/i],
  [
    "live secret token",
    /sk-proj-[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----/,
  ],
];

const findings = [];

for (const absolutePath of walk(standaloneRoot)) {
  const file = normalize(relative(standaloneRoot, absolutePath));
  if (blockedExact.has(file)) findings.push(`${file}: blocked release artifact file`);
  if (file.startsWith(".env")) findings.push(`${file}: blocked release env file`);

  for (const prefix of blockedPrefixes) {
    if (file.startsWith(prefix)) findings.push(`${file}: blocked release artifact path`);
  }

  for (const suffix of blockedSuffixes) {
    if (file.endsWith(suffix)) findings.push(`${file}: blocked local data suffix`);
  }

  if (file.startsWith("node_modules/")) continue;
  if (binaryExts.has(extname(file))) continue;
  if (file === "scripts/privacy-audit.mjs" || file === "scripts/release-artifact-audit.mjs") continue;

  let content = "";
  try {
    content = readFileSync(absolutePath, "utf8");
  } catch {
    continue;
  }

  content.split(/\r?\n/).forEach((line, index) => {
    for (const [label, regex] of patterns) {
      if (regex.test(line)) findings.push(`${file}:${index + 1}: ${label}`);
    }
  });
}

if (findings.length > 0) {
  console.error("Release artifact audit failed:");
  for (const finding of findings.slice(0, 200)) console.error(`- ${finding}`);
  if (findings.length > 200) console.error(`...and ${findings.length - 200} more`);
  process.exit(1);
}

console.log("Release artifact audit passed.");
