import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_FILE_BYTES } from "./constants.js";

const CONFIG_CANDIDATES = ["env-mapper.config.mjs", ".env-mapper.json"];

export function loadScanConfig(root, options = {}) {
  const configPath = findConfigPath(root, options.config);
  const rawConfig = configPath ? readConfigFile(configPath) : {};
  const config = normalizeConfig(rawConfig, configPath);
  validateAllowedRoot(root, config);
  return {
    config,
    configPath,
    hash: stableConfigHash(config)
  };
}

export function scanConfigForReport(loaded) {
  return {
    configPath: loaded.configPath || null,
    include: loaded.config.include,
    exclude: loaded.config.exclude,
    serviceRoots: loaded.config.serviceRoots,
    knownPublic: loaded.config.knownPublic,
    knownSecret: loaded.config.knownSecret,
    ignoreKeys: loaded.config.ignoreKeys,
    envHelpers: loaded.config.envHelpers,
    publicPrefixes: loaded.config.publicPrefixes,
    secretHints: loaded.config.secretHints,
    allowedRoots: loaded.config.allowedRoots,
    limits: {
      maxFiles: loaded.config.maxFiles ?? null,
      maxFileBytes: loaded.config.maxFileBytes,
      maxVariables: loaded.config.maxVariables ?? null,
      maxSourcesPerVariable: loaded.config.maxSourcesPerVariable ?? null,
      maxOutputBytes: loaded.config.maxOutputBytes ?? null
    }
  };
}

export function rootSafetyWarnings(root) {
  const warnings = [];
  const resolvedRoot = path.resolve(root);
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    warnings.push("Scan root is the filesystem root; use a narrower project root to avoid exposing broad metadata.");
  }
  if (resolvedRoot === os.homedir()) {
    warnings.push("Scan root is the home directory; use a narrower project root to avoid exposing personal metadata.");
  }
  return warnings;
}

function findConfigPath(root, explicitPath) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!fs.existsSync(resolved)) throw new Error(`Config file does not exist: ${resolved}`);
    return resolved;
  }

  for (const candidate of CONFIG_CANDIDATES) {
    const fullPath = path.join(root, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

function readConfigFile(configPath) {
  if (configPath.endsWith(".json")) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (error) {
      throw new Error(`Invalid JSON config ${configPath}: ${error.message}`);
    }
  }

  if (configPath.endsWith(".mjs")) {
    const script = [
      `const mod = await import(${JSON.stringify(pathToFileURL(configPath).href)});`,
      "const config = mod.default ?? mod.config ?? {};",
      "process.stdout.write(JSON.stringify(config));"
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.status !== 0) {
      throw new Error(`Could not load config ${configPath}: ${result.stderr.trim() || "unknown error"}`);
    }
    try {
      return JSON.parse(result.stdout || "{}");
    } catch (error) {
      throw new Error(`Config ${configPath} must export a JSON-serializable object: ${error.message}`);
    }
  }

  throw new Error(`Unsupported config file type: ${configPath}`);
}

function normalizeConfig(rawConfig, configPath) {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new Error(`Config ${configPath || ""} must be an object.`);
  }

  const configDir = configPath ? path.dirname(configPath) : process.cwd();
  const normalized = {
    include: stringArray(rawConfig.include, "include"),
    exclude: stringArray(rawConfig.exclude, "exclude"),
    serviceRoots: stringArray(rawConfig.serviceRoots, "serviceRoots"),
    knownPublic: stringArray(rawConfig.knownPublic, "knownPublic"),
    knownSecret: stringArray(rawConfig.knownSecret, "knownSecret"),
    ignoreKeys: stringArray(rawConfig.ignoreKeys, "ignoreKeys"),
    envHelpers: stringArray(rawConfig.envHelpers, "envHelpers"),
    publicPrefixes: stringArray(rawConfig.publicPrefixes, "publicPrefixes"),
    secretHints: stringArray(rawConfig.secretHints, "secretHints"),
    allowedRoots: stringArray(rawConfig.allowedRoots, "allowedRoots").map((item) => path.resolve(configDir, item)),
    maxFiles: positiveInteger(rawConfig.maxFiles ?? rawConfig.limits?.maxFiles, "maxFiles"),
    maxFileBytes: positiveInteger(rawConfig.maxFileBytes ?? rawConfig.limits?.maxFileBytes, "maxFileBytes") || MAX_FILE_BYTES,
    maxVariables: positiveInteger(rawConfig.maxVariables ?? rawConfig.limits?.maxVariables, "maxVariables"),
    maxSourcesPerVariable: positiveInteger(
      rawConfig.maxSourcesPerVariable ?? rawConfig.limits?.maxSourcesPerVariable,
      "maxSourcesPerVariable"
    ),
    maxOutputBytes: positiveInteger(rawConfig.maxOutputBytes ?? rawConfig.limits?.maxOutputBytes, "maxOutputBytes")
  };

  if (rawConfig.ci && typeof rawConfig.ci !== "object") throw new Error("Config ci must be an object.");
  normalized.ci = rawConfig.ci || {};
  return normalized;
}

function stringArray(value, key) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Config ${key} must be an array of strings.`);
  }
  return value;
}

function positiveInteger(value, key) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Config ${key} must be a positive integer.`);
  return value;
}

function validateAllowedRoot(root, config) {
  if (config.allowedRoots.length === 0) return;
  const resolvedRoot = path.resolve(root);
  const allowed = config.allowedRoots.some((allowedRoot) => {
    const relative = path.relative(allowedRoot, resolvedRoot);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  if (!allowed) {
    throw new Error(`Scan root is outside allowedRoots: ${resolvedRoot}`);
  }
}

function stableConfigHash(config) {
  return crypto.createHash("sha256").update(stableStringify(config)).digest("hex").slice(0, 16);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
