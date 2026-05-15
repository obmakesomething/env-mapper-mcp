import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildGithubAudit } from "../src/format-github.js";
import { generateLlmReviewPacket } from "../src/generate-llm-packet.js";
import { generateSecretPlan } from "../src/generate-plan.js";
import { scanRepository } from "../src/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const fixtureRoot = path.join(__dirname, "fixtures", "basic");

test("fixture outputs validate against published JSON schemas", () => {
  const report = scanRepository(fixtureRoot);
  const outputs = [
    ["report.schema.json", report],
    ["llm-packet.schema.json", generateLlmReviewPacket(report)],
    ["secret-plan.schema.json", generateSecretPlan(report, "infisical")],
    ["github-audit.schema.json", buildGithubAudit(report)]
  ];

  for (const [schemaName, output] of outputs) {
    assert.deepEqual(validateWithSchema(readSchema(schemaName), output), [], schemaName);
    assert.equal(JSON.stringify(output).includes("postgres://"), false, schemaName);
    assert.equal(JSON.stringify(output).includes("sk_test_secret_value"), false, schemaName);
  }
});

test("github action json artifact validates against published github audit schema", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-action-schema-"));
  const outputPath = path.join(tempDir, "audit.json");
  const result = spawnSync(
    process.execPath,
    ["src/github-action.js", "--root", fixtureRoot, "--json-output", outputPath, "--output-format", "json"],
    { cwd: repoRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  const artifact = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.deepEqual(validateWithSchema(readSchema("github-audit.schema.json"), artifact), []);
  assert.equal(artifact.containsSecretValues, false);
  assert.equal(JSON.stringify(artifact).includes("postgres://"), false);
  assert.equal(JSON.stringify(artifact).includes("sk_test_secret_value"), false);
});

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, "schemas", name), "utf8"));
}

function validateWithSchema(schema, value) {
  const errors = [];
  validateNode(schema, value, "$", schema, errors);
  return errors;
}

function validateNode(schema, value, at, rootSchema, errors) {
  if (schema.anyOf) {
    const candidateErrors = schema.anyOf.map((candidate) => {
      const nestedErrors = [];
      validateNode(candidate, value, at, rootSchema, nestedErrors);
      return nestedErrors;
    });
    if (candidateErrors.some((nestedErrors) => nestedErrors.length === 0)) return;
    errors.push(`${at} did not match anyOf: ${candidateErrors.map((nestedErrors) => nestedErrors.join("; ")).join(" | ")}`);
    return;
  }

  if (schema.$ref) {
    validateNode(resolveRef(rootSchema, schema.$ref), value, at, rootSchema, errors);
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${at} expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at} expected one of ${schema.enum.join(", ")}, got ${JSON.stringify(value)}`);
    return;
  }

  if (schema.type && !matchesType(value, schema.type)) {
    const expected = Array.isArray(schema.type) ? schema.type.join(" or ") : schema.type;
    errors.push(`${at} expected ${expected}, got ${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}`);
    return;
  }

  if (schema.minimum !== undefined && typeof value === "number" && value < schema.minimum) {
    errors.push(`${at} expected >= ${schema.minimum}, got ${value}`);
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) errors.push(`${at}.${key} is required`);
    }
    const properties = schema.properties || {};
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateNode(child, value[key], `${at}.${key}`, rootSchema, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${at}.${key} is not allowed`);
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateNode(schema.items, item, `${at}[${index}]`, rootSchema, errors));
  }
}

function resolveRef(schema, ref) {
  assert.ok(ref.startsWith("#/"), `unsupported ref ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .reduce((node, part) => node[part], schema);
}

function matchesType(value, type) {
  if (Array.isArray(type)) return type.some((item) => matchesType(value, item));
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}
