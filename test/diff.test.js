import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compareReports } from "../src/diff.js";
import { scanRepository } from "../src/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

test("diff separates new, resolved, unchanged, classification, and variable changes", () => {
  const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-base-"));
  const headRoot = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-head-"));
  fs.mkdirSync(path.join(baseRoot, "src"));
  fs.mkdirSync(path.join(headRoot, "src"));
  fs.writeFileSync(path.join(baseRoot, ".env.example"), "DECLARED_ONLY_TOKEN=\nPUBLIC_URL=\n", "utf8");
  fs.writeFileSync(path.join(baseRoot, "src", "index.js"), "process.env.EXISTING_TOKEN;\nprocess.env.PUBLIC_URL;\n", "utf8");
  fs.writeFileSync(path.join(headRoot, ".env.example"), "PUBLIC_URL=\n", "utf8");
  fs.writeFileSync(
    path.join(headRoot, "src", "index.js"),
    "process.env.EXISTING_TOKEN;\nprocess.env.NEXT_PUBLIC_SECRET_TOKEN;\nprocess.env.NEW_API_TOKEN;\n",
    "utf8"
  );

  const diff = compareReports(scanRepository(baseRoot), scanRepository(headRoot), {
    root: headRoot,
    base: "base.json",
    head: "head.json"
  });

  assert.equal(diff.mode, "env-mapper-diff");
  assert.equal(diff.summary.newVariables, 2);
  assert.ok(diff.newVariables.includes("NEW_API_TOKEN"));
  assert.ok(diff.newVariables.includes("NEXT_PUBLIC_SECRET_TOKEN"));
  assert.ok(diff.removedVariables.includes("DECLARED_ONLY_TOKEN"));
  assert.ok(diff.changedClassifications.find((item) => item.variable === "PUBLIC_URL"));
  assert.equal(diff.summary.newlyMissingDeclarations, 2);
  assert.equal(diff.summary.newlyPublicSecretConflicts, 1);
  assert.ok(diff.summary.resolvedFindings >= 1);
  assert.ok(diff.summary.unchangedFindings >= 1);
});

test("diff cli compares baseline report file to current scan", () => {
  const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-base-"));
  const headRoot = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-head-"));
  fs.mkdirSync(path.join(baseRoot, "src"));
  fs.mkdirSync(path.join(headRoot, "src"));
  fs.writeFileSync(path.join(baseRoot, "src", "index.js"), "process.env.EXISTING_TOKEN;\n", "utf8");
  fs.writeFileSync(path.join(headRoot, "src", "index.js"), "process.env.EXISTING_TOKEN;\nprocess.env.NEW_API_TOKEN;\n", "utf8");
  const baselinePath = path.join(os.tmpdir(), `env-mapper-baseline-${Date.now()}.json`);
  fs.writeFileSync(baselinePath, JSON.stringify(scanRepository(baseRoot)), "utf8");

  const result = spawnSync(
    process.execPath,
    ["src/cli.js", "diff", "--root", headRoot, "--base", baselinePath, "--format", "json"],
    { cwd: repoRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, "env-mapper-diff");
  assert.equal(output.summary.newlyMissingDeclarations, 1);
  assert.equal(JSON.stringify(output).includes("postgres://"), false);
});
