import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateDmnoDraft } from "../src/generate-dmno.js";
import { generateLlmReviewPacket } from "../src/generate-llm-packet.js";
import { generateSecretPlan } from "../src/generate-plan.js";
import { scanRepository } from "../src/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const fixtureRoot = path.join(__dirname, "fixtures", "basic");

test("scanner maps usage, declarations, and provider references without values", () => {
  const report = scanRepository(fixtureRoot);
  const byName = new Map(report.variables.map((item) => [item.name, item]));

  assert.equal(byName.get("DATABASE_URL").sensitivity, "secret");
  assert.equal(byName.get("DATABASE_URL").missingDeclaration, false);
  assert.equal(byName.get("NEXT_PUBLIC_APP_URL").visibility, "public");
  assert.equal(byName.get("MISSING_API_TOKEN").missingDeclaration, true);
  assert.equal(byName.get("UNUSED_LEGACY_TOKEN").unusedDeclaration, true);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("postgres://"), false);
  assert.equal(serialized.includes("sk_test_secret_value"), false);
  assert.equal(serialized.includes("[redacted]"), true);
});

test("scanner ignores local env files by default", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, ".env.local"), "LOCAL_ONLY_SECRET=super-secret\n", "utf8");
  fs.writeFileSync(path.join(root, ".env.example"), "SAFE_EXAMPLE_TOKEN=example\n", "utf8");
  fs.writeFileSync(path.join(root, "src", "index.js"), "process.env.SAFE_EXAMPLE_TOKEN;\n", "utf8");

  const report = scanRepository(root);
  const names = report.variables.map((item) => item.name);

  assert.deepEqual(names, ["SAFE_EXAMPLE_TOKEN"]);
  assert.equal(JSON.stringify(report).includes("super-secret"), false);
});

test("scanner ignores codex artifact directories by default", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-"));
  fs.mkdirSync(path.join(root, ".codex-artifacts", "old"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, ".codex-artifacts", "old", "env.js"), "process.env.ARTIFACT_ONLY_TOKEN;\n", "utf8");
  fs.writeFileSync(path.join(root, "src", "index.js"), "process.env.ACTIVE_SOURCE_TOKEN;\n", "utf8");

  const report = scanRepository(root);
  const names = report.variables.map((item) => item.name);

  assert.deepEqual(names, ["ACTIVE_SOURCE_TOKEN"]);
});

test("scanner ignores Python virtual environment directories by default", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-"));
  fs.mkdirSync(path.join(root, "venv", "lib"), { recursive: true });
  fs.mkdirSync(path.join(root, ".venv", "lib"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "venv", "lib", "package.js"), "process.env.VENV_ONLY_TOKEN;\n", "utf8");
  fs.writeFileSync(path.join(root, ".venv", "lib", "package.js"), "process.env.DOT_VENV_ONLY_TOKEN;\n", "utf8");
  fs.writeFileSync(path.join(root, "src", "index.js"), "process.env.ACTIVE_SOURCE_TOKEN;\n", "utf8");

  const report = scanRepository(root);
  const names = report.variables.map((item) => item.name);

  assert.deepEqual(names, ["ACTIVE_SOURCE_TOKEN"]);
});

test("scanner does not treat JS template literals as shell env references", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "src", "index.js"),
    "const name = 'world';\nconst message = `hello ${NAME}`;\nconst env = process.env.REAL_ENV_KEY;\n",
    "utf8"
  );

  const report = scanRepository(root);
  const names = report.variables.map((item) => item.name);

  assert.deepEqual(names, ["REAL_ENV_KEY"]);
});

test("scanner ignores comments/strings and flags js dynamic env keys for review", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    [
      "const real = process.env.REAL_ENV_KEY;",
      "const templated = process.env[`TEMPLATE_ENV_KEY`];",
      "const computed = process.env[dynamicKey];",
      "const metadata = import.meta.env['META_PUBLIC_ENV'];",
      "const metadataDynamic = import.meta.env[metaKey];",
      "const deno = Deno.env.get(\"DENO_STATIC_KEY\");",
      "const denoComputed = Deno.env.get(runtimeEnvKey);",
      "const bun = Bun.env.BUN_STATIC;",
      "const bunComputed = Bun.env[`BUN_${suffix}`];",
      "const commented = `process.env.DONT_COUNT`;",
      "const exprRegex = `${/process\\.env\\.TEMPLATE_REGEX_SECRET/.test(input)}`;",
      "const exprReal = `${process.env.TEMPLATE_EXPR_REAL}`;",
      "const stringed = 'process.env.NOT_A_REAL_KEY';",
      "const lines = [",
      "  // process.env.LINE_COMMENT_KEY",
      "  /* import.meta.env.BLOCK_COMMENT_KEY */",
      "]"
    ].join("\n"),
    "utf8"
  );

  const report = scanRepository(root);
  const names = report.variables.map((item) => item.name).sort();
  const dynamicPatterns = report.dynamicUsages.map((item) => item.pattern).sort();

  assert.deepEqual(names, [
    "BUN_STATIC",
    "DENO_STATIC_KEY",
    "META_PUBLIC_ENV",
    "REAL_ENV_KEY",
    "TEMPLATE_ENV_KEY",
    "TEMPLATE_EXPR_REAL"
  ]);
  assert.equal(report.totals.dynamicUsageCandidates, 4);
  assert.deepEqual(dynamicPatterns, [
    "Bun.env.bracket.dynamic",
    "Deno.env.get.dynamic",
    "import.meta.env.bracket.dynamic",
    "process.env.bracket.dynamic"
  ]);
});

test("scanner ignores JS regex literals while preserving common process env keys", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(
    path.join(root, "src", "regex.js"),
    [
      "const matcher = /process\\.env\\.REGEX_ONLY_SECRET/;",
      "const matcherWithClass = /[A-Z]process\\.env\\.REGEX_CLASS_TOKEN\\//;",
      "const pathValue = process.env.PATH;",
      "const homeValue = process.env['HOME'];"
    ].join("\n"),
    "utf8"
  );

  const report = scanRepository(root);
  const names = report.variables.map((item) => item.name).sort();

  assert.deepEqual(names, ["HOME", "PATH"]);
});

test("scanner rejects missing roots", () => {
  assert.throws(
    () => scanRepository(path.join(os.tmpdir(), "env-mapper-definitely-missing")),
    /Scan root does not exist/
  );
});

test("dmno draft marks secret candidates sensitive", () => {
  const report = scanRepository(fixtureRoot);
  const draft = generateDmnoDraft(report);

  assert.match(draft, /DATABASE_URL:/);
  assert.match(draft, /sensitive: true/);
  assert.match(draft, /NEXT_PUBLIC_APP_URL:/);
  assert.match(draft, /Secret values are intentionally not included/);
});

test("secret plan is dry-run and contains no apply support", () => {
  const report = scanRepository(fixtureRoot);
  const plan = generateSecretPlan(report, "infisical");

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.actions.some((action) => action.applySupported), false);
  assert.ok(plan.actions.find((action) => action.key === "DATABASE_URL"));
  assert.equal(plan.actions.find((action) => action.key === "UNUSED_LEGACY_TOKEN").action, "mark_unused_candidate");
});

test("scan cli emits redacted output", () => {
  const result = spawnSync(
    process.execPath,
    ["src/cli.js", "scan", "--root", fixtureRoot, "--emit", "all", "--format", "json"],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("postgres://"), false);
  assert.equal(result.stdout.includes("sk_test_secret_value"), false);

  const output = JSON.parse(result.stdout);
  assert.equal(output.report.totals.variables, 5);
  assert.equal(output.plan.mode, "dry-run");
  assert.equal(output.llm.mode, "redacted-llm-review-packet");
});

test("scan cli runs through an npm-style bin symlink", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-bin-"));
  const binPath = path.join(tempDir, "env-mapper");
  fs.symlinkSync(path.join(repoRoot, "src", "cli.js"), binPath);

  const result = spawnSync(
    process.execPath,
    [binPath, "scan", "--root", fixtureRoot, "--emit", "report", "--format", "text"],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Env Mapper report/);
  assert.match(result.stdout, /MISSING_API_TOKEN/);
  assert.equal(result.stdout.includes("postgres://"), false);
});

test("llm packet includes dynamic env access review candidates", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "index.js"), "const value = Bun.env[process.env.DYN_KEY];\n", "utf8");

  const report = scanRepository(root);
  const packet = generateLlmReviewPacket(report);
  const dynamicReviewItem = packet.reviewItems.find((item) => item.kind === "dynamic-usage");

  assert.equal(packet.summary.dynamicUsageCandidates, 1);
  assert.equal(dynamicReviewItem.kind, "dynamic-usage");
  assert.equal(dynamicReviewItem.variable, "DYNAMIC_ENV_KEY");
  assert.equal(dynamicReviewItem.evidence[0].pattern, "Bun.env.bracket.dynamic");
});

test("llm packet provides redacted review items", () => {
  const report = scanRepository(fixtureRoot);
  const packet = generateLlmReviewPacket(report);

  assert.equal(packet.mode, "redacted-llm-review-packet");
  assert.equal(packet.safety.containsSecretValues, false);
  assert.equal(packet.safety.mayMutateProviders, false);
  assert.ok(packet.reviewItems.find((item) => item.variable === "MISSING_API_TOKEN"));

  const serialized = JSON.stringify(packet);
  assert.equal(serialized.includes("postgres://"), false);
  assert.equal(serialized.includes("sk_test_secret_value"), false);
});

test("scan cli exits non-zero for missing root", () => {
  const result = spawnSync(
    process.execPath,
    ["src/cli.js", "scan", "--root", path.join(os.tmpdir(), "env-mapper-definitely-missing")],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Scan root does not exist/);
});

test("mcp stdio exposes scan tool without leaking raw env values", () => {
  const input = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "node-test", version: "0.0.0" }
      }
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "env_mapper_scan",
        arguments: { root: fixtureRoot }
      }
    }
  ]
    .map((message) => JSON.stringify(message))
    .join("\n");

  const result = spawnSync(process.execPath, ["src/cli.js", "mcp"], {
    cwd: repoRoot,
    input,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("postgres://"), false);
  assert.equal(result.stdout.includes("sk_test_secret_value"), false);

  const lines = result.stdout.trim().split(/\n/).map((line) => JSON.parse(line));
  assert.equal(lines[1].result.tools.length, 4);
  assert.equal(lines[2].result.structuredContent.totals.variables, 5);
});

test("mcp stdio exposes redacted llm packet", () => {
  const input = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "node-test", version: "0.0.0" }
      }
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "env_mapper_llm_packet",
        arguments: { root: fixtureRoot }
      }
    }
  ]
    .map((message) => JSON.stringify(message))
    .join("\n");

  const result = spawnSync(process.execPath, ["src/cli.js", "mcp"], {
    cwd: repoRoot,
    input,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("postgres://"), false);
  assert.equal(result.stdout.includes("sk_test_secret_value"), false);

  const lines = result.stdout.trim().split(/\n/).map((line) => JSON.parse(line));
  assert.equal(lines[1].result.structuredContent.mode, "redacted-llm-review-packet");
});
