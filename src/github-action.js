#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { formatGithubAuditMarkdown } from "./format-github.js";
import { scanRepository } from "./scanner.js";

export function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseOptions(argv, env);
  const report = scanRepository(options.root);
  const markdown = formatGithubAuditMarkdown(report);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, markdown, "utf8");
    writeOutput("markdown_path", outputPath, env);
  }

  if (env.GITHUB_STEP_SUMMARY) {
    appendStepSummary(env.GITHUB_STEP_SUMMARY, markdown);
  }

  writeOutput("markdown", markdown, env);
  writeOutput("missing_declarations", String(report.totals.missingDeclarations), env);
  writeOutput("unused_declarations", String(report.totals.unusedDeclarations), env);
  writeOutput("review_candidates", String(report.totals.reviewCandidates), env);

  if (!env.GITHUB_OUTPUT && !env.GITHUB_STEP_SUMMARY && !options.output) {
    process.stdout.write(markdown);
  }

  return 0;
}

function parseOptions(args, env) {
  const options = {
    root: env.INPUT_ROOT || ".",
    output: env.INPUT_OUTPUT || ""
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") options.root = requireValue(args, ++i, arg);
    else if (arg === "--output") options.output = requireValue(args, ++i, arg);
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage: node src/github-action.js [--root <path>] [--output <path>]\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
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
