#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { formatEmission } from "./format.js";
import { buildDiff } from "./diff.js";
import { startMcpServer, runCliScan } from "./mcp-server.js";

const USAGE = `Usage:
  env-mapper scan --root <path> [--config <path>] [--emit report|dmno|plan|llm|sarif|all] [--format json|text] [--provider infisical]
  env-mapper diff --root <path> --base <git-ref-or-report-json> [--head <git-ref-or-report-json>] [--config <path>] [--format json|text]
  env-mapper mcp [--config <path>]

Examples:
  env-mapper scan --root . --emit all --format json
  env-mapper scan --root . --config .env-mapper.json --emit report --format json
  env-mapper diff --root . --base origin/main --format text
  env-mapper scan --root . --emit dmno --format text
  env-mapper scan --root . --emit llm --format json
  env-mapper scan --root . --emit sarif --format json
  env-mapper mcp
`;

export function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "scan";
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === "mcp") {
    const options = parseOptions(argv.slice(1));
    startMcpServer({ defaultOptions: options });
    return 0;
  }

  if (command === "diff") {
    const options = parseOptions(argv.slice(1));
    const diff = buildDiff({ root: options.root, base: options.base, head: options.head, options });
    process.stdout.write(formatEmission(diff, options.format));
    return 0;
  }

  if (command !== "scan") {
    process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
    return 1;
  }

  const options = parseOptions(argv.slice(1));
  const emission = runCliScan(options.root, options);
  process.stdout.write(formatEmission(emission, options.format));
  return 0;
}

function parseOptions(args) {
  const options = {
    root: ".",
    emit: "report",
    format: "json",
    provider: "infisical",
    config: undefined
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") options.root = requireValue(args, ++i, arg);
    else if (arg === "--emit") options.emit = requireValue(args, ++i, arg);
    else if (arg === "--format") options.format = requireValue(args, ++i, arg);
    else if (arg === "--provider") options.provider = requireValue(args, ++i, arg);
    else if (arg === "--config") options.config = requireValue(args, ++i, arg);
    else if (arg === "--base") options.base = requireValue(args, ++i, arg);
    else if (arg === "--head") options.head = requireValue(args, ++i, arg);
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE);
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

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
}

if (isDirectInvocation()) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
