import readline from "node:readline";
import { VERSION } from "./constants.js";
import { formatEmission, buildEmission } from "./format.js";
import { generateDmnoDraft } from "./generate-dmno.js";
import { generateLlmReviewPacket } from "./generate-llm-packet.js";
import { generateSecretPlan } from "./generate-plan.js";
import { scanRepository } from "./scanner.js";

const PROTOCOL_VERSION = "2025-06-18";

const tools = [
  {
    name: "env_mapper_scan",
    title: "Scan Environment Variables",
    description: "Scan a repository and return a redacted environment-variable inventory.",
    inputSchema: rootSchema()
  },
  {
    name: "env_mapper_dmno_draft",
    title: "Generate DMNO Draft",
    description: "Scan a repository and return a DMNO .dmno/config.mts draft.",
    inputSchema: rootSchema()
  },
  {
    name: "env_mapper_secret_plan",
    title: "Generate Secret Store Plan",
    description: "Scan a repository and return a dry-run secret-store sync plan.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Repository root to scan." },
        config: { type: "string", description: "Optional env-mapper config path." },
        provider: { type: "string", description: "Provider label for plan metadata.", default: "infisical" }
      },
      required: ["root"]
    }
  },
  {
    name: "env_mapper_llm_packet",
    title: "Generate LLM Review Packet",
    description: "Scan a repository and return redacted facts and review questions for LLM-assisted env mapping.",
    inputSchema: rootSchema()
  }
];

export function startMcpServer({ input = process.stdin, output = process.stdout, defaultOptions = {} } = {}) {
  const rl = readline.createInterface({ input, terminal: false });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    handleMessage(line, output, defaultOptions);
  });
}

function handleMessage(line, output, defaultOptions) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    write(output, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } });
    return;
  }

  if (!message.id && message.method?.startsWith("notifications/")) return;

  try {
    const result = dispatch(message, defaultOptions);
    if (message.id !== undefined) write(output, { jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    if (message.id !== undefined) {
      write(output, {
        jsonrpc: "2.0",
        id: message.id,
        error: { code: error.code || -32603, message: error.message }
      });
    }
  }
}

function dispatch(message, defaultOptions = {}) {
  switch (message.method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "env-mapper-mcp", title: "Env Mapper MCP", version: VERSION },
        instructions: "Use read-only tools to map env var names. Secret values are never returned."
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools };
    case "tools/call":
      return callTool(message.params || {}, defaultOptions);
    default:
      throw Object.assign(new Error(`Method not found: ${message.method}`), { code: -32601 });
  }
}

function callTool(params, defaultOptions = {}) {
  const name = params.name;
  const args = params.arguments || {};
  if (!name) throw Object.assign(new Error("Missing tool name"), { code: -32602 });

  if (name === "env_mapper_scan") {
    const report = scanRepository(requiredRoot(args), scanOptions(args, defaultOptions));
    return toolResult(report);
  }

  if (name === "env_mapper_dmno_draft") {
    const report = scanRepository(requiredRoot(args), scanOptions(args, defaultOptions));
    const result = { file: ".dmno/config.mts", content: generateDmnoDraft(report) };
    return toolResult(result);
  }

  if (name === "env_mapper_secret_plan") {
    const report = scanRepository(requiredRoot(args), scanOptions(args, defaultOptions));
    const result = generateSecretPlan(report, args.provider || "infisical");
    return toolResult(result);
  }

  if (name === "env_mapper_llm_packet") {
    const report = scanRepository(requiredRoot(args), scanOptions(args, defaultOptions));
    const result = generateLlmReviewPacket(report);
    return toolResult(result);
  }

  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
}

function toolResult(value) {
  return {
    content: [{ type: "text", text: formatEmission(value, "json") }],
    structuredContent: value,
    isError: false
  };
}

function requiredRoot(args) {
  if (!args.root || typeof args.root !== "string") {
    throw Object.assign(new Error("root argument is required"), { code: -32602 });
  }
  return args.root;
}

function rootSchema() {
  return {
    type: "object",
    properties: {
      root: { type: "string", description: "Repository root to scan." },
      config: { type: "string", description: "Optional env-mapper config path." }
    },
    required: ["root"]
  };
}

function write(output, message) {
  output.write(`${JSON.stringify(message)}\n`);
}

export function runCliScan(root, options) {
  return buildEmission(scanRepository(root, options), options);
}

function scanOptions(args, defaultOptions) {
  return {
    config: args.config || defaultOptions.config
  };
}
