#!/usr/bin/env node
import { formatEmission } from "./format.js";
import { startMcpServer, runCliScan } from "./mcp-server.js";

const USAGE = `Usage:
  env-mapper scan --root <path> [--emit report|dmno|plan|llm|all] [--format json|text] [--provider infisical]
  env-mapper mcp

Examples:
  node src/cli.js scan --root . --emit all --format json
  node src/cli.js scan --root . --emit dmno --format text
  node src/cli.js scan --root . --emit llm --format json
  node src/cli.js mcp
`;

export function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "scan";
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === "mcp") {
    startMcpServer();
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
    provider: "infisical"
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") options.root = requireValue(args, ++i, arg);
    else if (arg === "--emit") options.emit = requireValue(args, ++i, arg);
    else if (arg === "--format") options.format = requireValue(args, ++i, arg);
    else if (arg === "--provider") options.provider = requireValue(args, ++i, arg);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
