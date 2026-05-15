import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatGithubAuditMarkdown } from "../src/format-github.js";
import { buildSarif } from "../src/format-sarif.js";
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

test("sarif formatter emits redacted code scanning results", () => {
  const sarif = buildSarif(scanRepository(fixtureRoot));
  const run = sarif.runs[0];
  const missing = run.results.find((result) => result.ruleId === "missing-declaration");

  assert.equal(sarif.version, "2.1.0");
  assert.equal(run.tool.driver.name, "Env Mapper MCP");
  assert.ok(run.tool.driver.rules.find((rule) => rule.id === "missing-declaration"));
  assert.equal(run.invocations[0].properties.secretValuesIncluded, false);
  assert.equal(run.properties.secretValuesIncluded, false);
  assert.equal(missing.level, "error");
  assert.equal(missing.locations[0].physicalLocation.artifactLocation.uri, "src/app.js");
  assert.equal(missing.locations[0].physicalLocation.region.startLine, 3);
  assert.equal(missing.properties.safeForAgent, true);
  assert.equal(JSON.stringify(sarif).includes("postgres://"), false);
  assert.equal(JSON.stringify(sarif).includes("sk_test_secret_value"), false);
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

test("github action writes json artifact and fails on new missing declaration", () => {
  const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-base-"));
  const headRoot = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-head-"));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-gate-"));
  const githubOutput = path.join(tempDir, "github-output.txt");
  const markdownOutput = path.join(tempDir, "audit.md");
  const jsonOutput = path.join(tempDir, "audit.json");
  const baselinePath = path.join(tempDir, "baseline.json");
  fs.mkdirSync(path.join(baseRoot, "src"));
  fs.mkdirSync(path.join(headRoot, "src"));
  fs.writeFileSync(path.join(baseRoot, "src", "index.js"), "process.env.EXISTING_TOKEN;\n", "utf8");
  fs.writeFileSync(path.join(headRoot, "src", "index.js"), "process.env.EXISTING_TOKEN;\nprocess.env.NEW_API_TOKEN;\n", "utf8");
  fs.writeFileSync(baselinePath, JSON.stringify(scanRepository(baseRoot)), "utf8");

  const result = spawnSync(
    process.execPath,
    [
      "src/github-action.js",
      "--root",
      headRoot,
      "--baseline",
      baselinePath,
      "--fail-on",
      "new-missing-declaration",
      "--output",
      markdownOutput,
      "--json-output",
      jsonOutput,
      "--output-format",
      "all",
      "--annotations",
      "true",
      "--max-findings",
      "1"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: githubOutput
      }
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Env Mapper gate failed/);
  assert.match(result.stdout, /::error file=src\/index\.js,line=2::NEW_API_TOKEN/);
  assert.match(fs.readFileSync(markdownOutput, "utf8"), /1 more omitted by max-findings/);
  const json = JSON.parse(fs.readFileSync(jsonOutput, "utf8"));
  assert.equal(json.diff.summary.newlyMissingDeclarations, 1);
  const outputs = fs.readFileSync(githubOutput, "utf8");
  assert.match(outputs, /json_path<</);
  assert.match(outputs, /new_missing_declarations<<.*\n1\n/s);
  for (const output of [result.stdout, result.stderr, outputs, JSON.stringify(json)]) {
    assert.equal(output.includes("postgres://"), false);
    assert.equal(output.includes("sk_test_secret_value"), false);
  }
});

test("github action writes sarif artifact and output without leaking values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-sarif-"));
  const githubOutput = path.join(tempDir, "github-output.txt");
  const sarifOutput = path.join(tempDir, "env-mapper.sarif");

  const result = spawnSync(
    process.execPath,
    [
      "src/github-action.js",
      "--root",
      fixtureRoot,
      "--sarif-output",
      sarifOutput,
      "--output-format",
      "sarif"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: githubOutput
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const sarif = JSON.parse(fs.readFileSync(sarifOutput, "utf8"));
  const outputs = fs.readFileSync(githubOutput, "utf8");
  assert.equal(sarif.version, "2.1.0");
  assert.ok(sarif.runs[0].results.find((item) => item.ruleId === "missing-declaration"));
  assert.match(outputs, /sarif_path<</);
  assert.match(outputs, /sarif<</);
  for (const output of [JSON.stringify(sarif), outputs, result.stderr]) {
    assert.equal(output.includes("postgres://"), false);
    assert.equal(output.includes("sk_test_secret_value"), false);
  }
});

test("github action passes new finding gate when baseline has no new high findings", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-pass-"));
  const baselinePath = path.join(tempDir, "baseline.json");
  fs.writeFileSync(baselinePath, JSON.stringify(scanRepository(fixtureRoot)), "utf8");

  const result = spawnSync(
    process.execPath,
    ["src/github-action.js", "--root", fixtureRoot, "--baseline", baselinePath, "--fail-on", "new-high"],
    { cwd: repoRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
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
