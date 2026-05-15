#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32"
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const [pack] = JSON.parse(result.stdout);
const paths = pack.files.map((file) => file.path);
const required = [
  "LICENSE",
  "README.md",
  "action.yml",
  "docs/npm-publishing.md",
  "package.json",
  "schemas/report.schema.json",
  "schemas/llm-packet.schema.json",
  "schemas/secret-plan.schema.json",
  "schemas/github-audit.schema.json",
  "src/cli.js",
  "src/github-action.js",
  "src/mcp-server.js",
  "src/scanner.js"
];
const forbiddenPatterns = [
  /^\.github\//,
  /^scripts\//,
  /^test\//,
  /^worktrees\//,
  /^node_modules\//,
  /^.*\.env(?:\.|$)/,
  /^.*\.tgz$/,
  /^.*\.log$/
];

const missing = required.filter((item) => !paths.includes(item));
const forbidden = paths.filter((item) => forbiddenPatterns.some((pattern) => pattern.test(item)));

if (missing.length > 0 || forbidden.length > 0) {
  if (missing.length > 0) process.stderr.write(`Missing package files: ${missing.join(", ")}\n`);
  if (forbidden.length > 0) process.stderr.write(`Forbidden package files: ${forbidden.join(", ")}\n`);
  process.exit(1);
}

process.stdout.write(
  JSON.stringify(
    {
      name: pack.name,
      version: pack.version,
      entryCount: pack.entryCount,
      files: paths
    },
    null,
    2
  )
);
process.stdout.write("\n");
