#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { formatGithubAuditMarkdown } from "./format-github.js";
import { buildDiff } from "./diff.js";
import { scanRepository } from "./scanner.js";

export function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseOptions(argv, env);
  const report = scanRepository(options.root);
  const diff = options.baseline ? buildDiff({ root: options.root, base: options.baseline }) : null;
  const markdown = formatGithubAuditMarkdown(report, { maxFindings: options.maxFindings });
  const jsonAudit = JSON.stringify({ report, diff, gate: evaluateGate(report, diff, options.failOn) }, null, 2);

  if (options.output && shouldWriteFormat(options.outputFormat, "markdown")) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, markdown, "utf8");
    writeOutput("markdown_path", outputPath, env);
  }

  if (options.jsonOutput && shouldWriteFormat(options.outputFormat, "json")) {
    const outputPath = path.resolve(options.jsonOutput);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, jsonAudit, "utf8");
    writeOutput("json_path", outputPath, env);
  }

  if (env.GITHUB_STEP_SUMMARY && shouldWriteFormat(options.outputFormat, "markdown")) {
    appendStepSummary(env.GITHUB_STEP_SUMMARY, markdown);
  }

  if (options.annotations) writeAnnotations(report, diff);

  writeOutput("markdown", markdown, env);
  if (shouldWriteFormat(options.outputFormat, "json")) writeOutput("json", jsonAudit, env);
  writeOutput("missing_declarations", String(report.totals.missingDeclarations), env);
  writeOutput("unused_declarations", String(report.totals.unusedDeclarations), env);
  writeOutput("review_candidates", String(report.totals.reviewCandidates), env);
  writeOutput("findings", String(report.totals.findings || 0), env);
  writeOutput("new_findings", String(diff?.summary.newFindings || 0), env);
  writeOutput("new_high_findings", String(diff?.summary.newHighFindings || 0), env);
  writeOutput("new_missing_declarations", String(diff?.summary.newlyMissingDeclarations || 0), env);
  writeOutput("new_public_secret_conflicts", String(diff?.summary.newlyPublicSecretConflicts || 0), env);

  if (!env.GITHUB_OUTPUT && !env.GITHUB_STEP_SUMMARY && !options.output) {
    process.stdout.write(markdown);
  }

  const gate = evaluateGate(report, diff, options.failOn);
  if (gate.fail) {
    process.stderr.write(`Env Mapper gate failed: ${gate.reason}\n`);
    return 1;
  }
  return 0;
}

function parseOptions(args, env) {
  const options = {
    root: input(env, "root") || ".",
    output: input(env, "output") || "",
    jsonOutput: input(env, "json-output") || "",
    failOn: input(env, "fail-on") || "none",
    baseline: input(env, "baseline") || "",
    outputFormat: input(env, "output-format") || "markdown",
    annotations: parseBoolean(input(env, "annotations"), false),
    maxFindings: parsePositiveInteger(input(env, "max-findings"))
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") options.root = requireValue(args, ++i, arg);
    else if (arg === "--output") options.output = requireValue(args, ++i, arg);
    else if (arg === "--json-output") options.jsonOutput = requireValue(args, ++i, arg);
    else if (arg === "--fail-on") options.failOn = requireValue(args, ++i, arg);
    else if (arg === "--baseline") options.baseline = requireValue(args, ++i, arg);
    else if (arg === "--output-format") options.outputFormat = requireValue(args, ++i, arg);
    else if (arg === "--annotations") options.annotations = parseBoolean(requireValue(args, ++i, arg), false);
    else if (arg === "--max-findings") options.maxFindings = parsePositiveInteger(requireValue(args, ++i, arg));
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage: node src/github-action.js [--root <path>] [--output <path>] [--json-output <path>] [--fail-on <policy>] [--baseline <ref-or-report>] [--output-format markdown|json|all]\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function input(env, name) {
  const hyphenKey = `INPUT_${name.toUpperCase()}`;
  const underscoreKey = `INPUT_${name.replaceAll("-", "_").toUpperCase()}`;
  return env[hyphenKey] ?? env[underscoreKey];
}

function evaluateGate(report, diff, failOn = "none") {
  if (failOn === "none" || !failOn) return { fail: false, reason: "No fail-on policy configured." };
  if (failOn === "missing-declaration") {
    return gateResult(report.totals.missingDeclarations > 0, `${report.totals.missingDeclarations} missing declarations`);
  }
  if (failOn === "public-secret-conflict") {
    return gateResult((report.findings || []).some((finding) => finding.kind === "public-secret-conflict"), "public/secret conflict found");
  }
  if (failOn === "high") {
    return gateResult((report.findings || []).some((finding) => finding.severity === "high"), "high severity finding found");
  }
  if (failOn === "new-high") {
    requireDiff(diff, failOn);
    return gateResult(diff.summary.newHighFindings > 0, `${diff.summary.newHighFindings} new high findings`);
  }
  if (failOn === "new-missing-declaration") {
    requireDiff(diff, failOn);
    return gateResult(diff.summary.newlyMissingDeclarations > 0, `${diff.summary.newlyMissingDeclarations} new missing declarations`);
  }
  throw new Error(`Unknown fail-on policy: ${failOn}`);
}

function gateResult(fail, reason) {
  return { fail, reason: fail ? reason : "Gate passed." };
}

function requireDiff(diff, failOn) {
  if (!diff) throw new Error(`fail-on=${failOn} requires baseline input.`);
}

function shouldWriteFormat(outputFormat, format) {
  return outputFormat === "all" || outputFormat === format;
}

function writeAnnotations(report, diff) {
  const findings = diff ? diff.newFindings : report.findings || [];
  for (const finding of findings) {
    const evidence = finding.evidence?.[0];
    if (!evidence) continue;
    const level = finding.severity === "high" ? "error" : "warning";
    const file = annotationValue(evidence.file);
    const line = evidence.line || 1;
    const message = annotationValue(`${finding.variable} ${finding.kind}: ${finding.message}`);
    process.stdout.write(`::${level} file=${file},line=${line}::${message}\n`);
  }
}

function annotationValue(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A").replaceAll(",", "%2C").replaceAll(":", "%3A");
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
}

function parsePositiveInteger(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Expected positive integer, got ${value}`);
  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${flag}`);
  return value;
}

function writeOutput(name, value, env) {
  if (!env.GITHUB_OUTPUT) return;
  const delimiter = `env_mapper_${name}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  fs.appendFileSync(env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`, "utf8");
}

function appendStepSummary(summaryPath, markdown) {
  let prefix = "";
  try {
    const stat = fs.statSync(summaryPath);
    if (stat.size > 0) {
      const existing = fs.readFileSync(summaryPath, "utf8");
      if (!existing.endsWith("\n")) prefix = "\n\n";
      else if (!existing.endsWith("\n\n")) prefix = "\n";
    }
  } catch {
    // Missing summaries are normal in local smoke tests.
  }
  fs.appendFileSync(summaryPath, `${prefix}${markdown}`, "utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
