import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatGithubAuditMarkdown } from "../src/format-github.js";
import { scanRepository } from "../src/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const fixtureRoot = path.join(__dirname, "fixtures", "basic");

test("github formatter emits redacted PR audit markdown with evidence", () => {
  const markdown = formatGithubAuditMarkdown(scanRepository(fixtureRoot));

  assert.match(markdown, /## Env Mapper MCP audit/);
  assert.match(markdown, /Missing Declarations/);
  assert.match(markdown, /`MISSING_API_TOKEN`/);
  assert.match(markdown, /src\/app\.js:3/);
  assert.match(markdown, /Unused Declarations/);
  assert.match(markdown, /`UNUSED_LEGACY_TOKEN`/);
  assert.match(markdown, /Secret Candidates/);
  assert.match(markdown, /Public Config Candidates/);
  assert.equal(markdown.includes("postgres://"), false);
  assert.equal(markdown.includes("sk_test_secret_value"), false);
});

test("github action writes summary, outputs, and optional markdown file without leaking values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-"));
  const githubOutput = path.join(tempDir, "github-output.txt");
  const stepSummary = path.join(tempDir, "step-summary.md");
  const markdownOutput = path.join(tempDir, "audit.md");

  const result = spawnSync(
    process.execPath,
    ["src/github-action.js", "--root", fixtureRoot, "--output", markdownOutput],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: githubOutput,
        GITHUB_STEP_SUMMARY: stepSummary
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");

  const markdown = fs.readFileSync(markdownOutput, "utf8");
  const summary = fs.readFileSync(stepSummary, "utf8");
  const outputs = fs.readFileSync(githubOutput, "utf8");

  assert.equal(summary, markdown);
  assert.match(outputs, /markdown<</);
  assert.match(outputs, /markdown_path<</);
  assert.match(outputs, /missing_declarations<<.*\n1\n/s);
  assert.match(outputs, /unused_declarations<<.*\n2\n/s);
  assert.match(markdown, /`MISSING_API_TOKEN`/);

  for (const output of [markdown, summary, outputs, result.stderr]) {
    assert.equal(output.includes("postgres://"), false);
    assert.equal(output.includes("sk_test_secret_value"), false);
  }
});

test("github action reads INPUT_ROOT and INPUT_OUTPUT", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-input-"));
  const githubOutput = path.join(tempDir, "github-output.txt");
  const markdownOutput = path.join(tempDir, "nested", "audit.md");

  const result = spawnSync(process.execPath, ["src/github-action.js"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      INPUT_ROOT: fixtureRoot,
      INPUT_OUTPUT: markdownOutput,
      GITHUB_OUTPUT: githubOutput
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(fs.readFileSync(markdownOutput, "utf8"), /## Env Mapper MCP audit/);
  assert.match(fs.readFileSync(githubOutput, "utf8"), /markdown_path<</);
});

test("github action omits markdown_path when output is not set", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-no-output-"));
  const githubOutput = path.join(tempDir, "github-output.txt");
  const stepSummary = path.join(tempDir, "step-summary.md");

  const result = spawnSync(process.execPath, ["src/github-action.js", "--root", fixtureRoot], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_OUTPUT: githubOutput,
      GITHUB_STEP_SUMMARY: stepSummary
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");

  const outputs = fs.readFileSync(githubOutput, "utf8");
  assert.match(outputs, /markdown<</);
  assert.doesNotMatch(outputs, /markdown_path<</);
  assert.match(fs.readFileSync(stepSummary, "utf8"), /^## Env Mapper MCP audit/);
});

test("github action appends step summary with a blank-line separator", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-summary-"));
  const stepSummary = path.join(tempDir, "step-summary.md");
  fs.writeFileSync(stepSummary, "Existing summary", "utf8");

  const result = spawnSync(process.execPath, ["src/github-action.js", "--root", fixtureRoot], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: stepSummary
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(stepSummary, "utf8").startsWith("Existing summary\n\n## Env Mapper MCP audit"), true);
});

test("github formatter escapes evidence fields for markdown comments", () => {
  const markdown = formatGithubAuditMarkdown({
    filesScanned: 1,
    totals: {
      variables: 1,
      missingDeclarations: 1,
      unusedDeclarations: 0,
      secretCandidates: 1,
      reviewCandidates: 0
    },
    warnings: [],
    variables: [
      {
        name: "EVIL_TOKEN",
        visibility: "server",
        sensitivity: "secret",
        required: true,
        missingDeclaration: true,
        unusedDeclaration: false,
        needsReview: false,
        notes: ["Review [link](https://example.invalid)."],
        sources: [
          {
            kind: "usage|table",
            file: "src/evil`name](https://example.invalid).js",
            line: 7,
            pattern: "process.env.*_[x]"
          }
        ]
      }
    ]
  });

  assert.match(markdown, /usage\\\|table/);
  assert.match(markdown, /``src\/evil`name\]\(https:\/\/example\.invalid\)\.js:7``/);
  assert.doesNotMatch(markdown, /at `src\/evil`name/);
  assert.match(markdown, /process\.env\.\\\*\\\_\\\[x\\\]/);
  assert.doesNotMatch(markdown, /\[link\]\(https:\/\/example\.invalid\)/);
});
