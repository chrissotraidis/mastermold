#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const candidates = [
  ...new Set(
    execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
      .split(/\n/)
      .filter(Boolean),
  ),
];

const allowedEnv = new Set([".env.example", "engine/.env.example"]);
const blockedExact = new Set([
  ".env",
  ".env.local",
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
const blockedPathPrefixes = [
  ".data/",
  ".claude/",
  ".rds/",
  ".scaffold/",
  ".scaffold-debug/",
  ".well-known/",
  "public/.well-known/",
  "lib/launch-build/",
  ".agents/",
  ".codex/",
  "artifacts/",
  "screenshots/",
  "reports/private/",
  "docs/private/",
  "docs/ui-passes/",
  "docs/ref/",
  "docs/review/",
  "docs/history/",
  "docs/research/",
  "docs/roadmap/",
  "docs/design/",
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
]);

const patterns = [
  ["personal path", /\/Users\/[^/\s"'`]+|\/home\/workspace\/Programs\/[^/\s"'`]+/i],
  ["old demo identity", /\b[A-Z][a-z]{4,8} Operator\b|\b[A-Z]{2,8} Reviewer\b|\b[A-Za-z0-9._%+-]+@demo\.local\b/],
  ["private portfolio amount", /real\s+~?\$?120k/i],
  ["known wallet or balance fragment", /Hfmr8|0\.5 SOL/i],
  ["secret inventory wording", /wallet secret|exhausted Helius key/i],
  ["private artifact reference", /(^|[\s"'(])docs\/(?:ui-passes|ref|review|history)\b|(^|[\s"'(])\.(?:scaffold|rds|claude)(?:\/|\b)/i],
  [
    "live secret token",
    /sk-proj-[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----/,
  ],
];

const findings = [];

for (const file of candidates) {
  if ((file.startsWith(".env") && !allowedEnv.has(file)) || blockedExact.has(file)) {
    findings.push(`${file}: blocked tracked config/workbench file`);
  }

  for (const prefix of blockedPathPrefixes) {
    if (file.startsWith(prefix)) findings.push(`${file}: blocked private/workbench path`);
  }

  for (const suffix of blockedSuffixes) {
    if (file.endsWith(suffix)) findings.push(`${file}: blocked local data suffix`);
  }

  const ext = extname(file);
  if (binaryExts.has(ext)) continue;
  if (file === ".gitignore" || file === "scripts/privacy-audit.mjs") continue;

  let content = "";
  try {
    content = readFileSync(file, "utf8");
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
  console.error("Privacy audit failed:");
  for (const finding of findings.slice(0, 200)) console.error(`- ${finding}`);
  if (findings.length > 200) console.error(`...and ${findings.length - 200} more`);
  process.exit(1);
}

console.log(`Privacy audit passed (${candidates.length} tracked and untracked candidate files checked).`);
