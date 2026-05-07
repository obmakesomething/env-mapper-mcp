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
      cwd: path.join(__dirname, ".."),
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
      cwd: path.join(__dirname, ".."),
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
    cwd: path.join(__dirname, ".."),
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
    cwd: path.join(__dirname, ".."),
    input,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("postgres://"), false);
  assert.equal(result.stdout.includes("sk_test_secret_value"), false);

  const lines = result.stdout.trim().split(/\n/).map((line) => JSON.parse(line));
  assert.equal(lines[1].result.structuredContent.mode, "redacted-llm-review-packet");
});
