import { createRequire } from "node:module";

const DEFAULT_ENV_HELPERS = ["env", "getEnv", "requiredEnv", "config", "readEnv"];
const require = createRequire(import.meta.url);

let cachedParser;

export function hasJavaScriptAstParser() {
  return Boolean(loadJavaScriptAstParser());
}

export function detectJavaScriptAst(text, relPath, options = {}) {
  const parser = loadJavaScriptAstParser();
  if (!parser) return null;

  let ast;
  try {
    ast = parser.parse(text, {
      sourceType: "unambiguous",
      errorRecovery: true,
      plugins: ["typescript", "jsx", "importMeta", "topLevelAwait"]
    });
  } catch {
    return null;
  }

  const findings = [];
  const dynamicUsages = [];
  const aliases = new Map();
  const envHelpers = new Set([...DEFAULT_ENV_HELPERS, ...(options.envHelpers || [])]);
  const seenFindings = new Set();
  const seenDynamic = new Set();

  traverse(ast, (node) => {
    if (node.type !== "VariableDeclarator") return;
    if (node.id?.type === "Identifier" && isKnownEnvObject(node.init, aliases)) {
      aliases.set(node.id.name, envObjectLabel(node.init, aliases));
      return;
    }
    if (node.id?.type === "ObjectPattern" && isKnownEnvObject(node.init, aliases)) {
      for (const property of node.id.properties || []) {
        if (property.type !== "ObjectProperty") continue;
        const name = staticPropertyName(property);
        if (!isValidKey(name)) continue;
        pushFinding(findings, seenFindings, {
          name,
          kind: "usage",
          file: relPath,
          line: lineOf(property.key),
          column: columnOf(property.key),
          pattern: "process.env.destructure"
        });
      }
    }
  });

  traverse(ast, (node) => {
    if (isEnvMemberExpression(node, aliases)) {
      collectEnvMember(node, aliases, findings, dynamicUsages, seenFindings, seenDynamic, relPath);
      return;
    }
    if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
      collectCallExpression(node, aliases, envHelpers, findings, dynamicUsages, seenFindings, seenDynamic, relPath);
    }
  });

  return { findings, dynamicUsages };
}

function loadJavaScriptAstParser() {
  if (cachedParser !== undefined) return cachedParser;
  try {
    cachedParser = require("@babel/parser");
  } catch {
    cachedParser = null;
  }
  return cachedParser;
}

function collectEnvMember(node, aliases, findings, dynamicUsages, seenFindings, seenDynamic, relPath) {
  const object = node.object;
  if (!isKnownEnvObject(object, aliases)) return;
  const base = envObjectLabel(object, aliases);
  const name = staticPropertyName(node);
  if (isValidKey(name)) {
    pushFinding(findings, seenFindings, {
      name,
      kind: "usage",
      file: relPath,
      line: lineOf(node.property),
      column: columnOf(node.property),
      pattern: node.computed ? `${base}.bracket` : `${base}.dot`
    });
    return;
  }
  if (node.computed) {
    pushDynamic(dynamicUsages, seenDynamic, {
      kind: "dynamic-usage",
      file: relPath,
      line: lineOf(node.property),
      column: columnOf(node.property),
      pattern: `${base}.bracket.dynamic`
    });
  }
}

function collectCallExpression(node, aliases, envHelpers, findings, dynamicUsages, seenFindings, seenDynamic, relPath) {
  if (isDenoEnvGet(node.callee)) {
    const name = staticString(node.arguments?.[0]);
    if (isValidKey(name)) {
      pushFinding(findings, seenFindings, {
        name,
        kind: "usage",
        file: relPath,
        line: lineOf(node.arguments[0]),
        column: columnOf(node.arguments[0]),
        pattern: "Deno.env.get"
      });
    } else {
      pushDynamic(dynamicUsages, seenDynamic, {
        kind: "dynamic-usage",
        file: relPath,
        line: lineOf(node.arguments?.[0] || node),
        column: columnOf(node.arguments?.[0] || node),
        pattern: "Deno.env.get.dynamic"
      });
    }
    return;
  }

  if (node.callee?.type === "Identifier" && envHelpers.has(node.callee.name)) {
    const name = staticString(node.arguments?.[0]);
    if (isValidKey(name)) {
      pushFinding(findings, seenFindings, {
        name,
        kind: "usage",
        file: relPath,
        line: lineOf(node.arguments[0]),
        column: columnOf(node.arguments[0]),
        pattern: `helper.${node.callee.name}`
      });
    } else if (node.arguments?.length) {
      pushDynamic(dynamicUsages, seenDynamic, {
        kind: "dynamic-usage",
        file: relPath,
        line: lineOf(node.arguments[0]),
        column: columnOf(node.arguments[0]),
        pattern: `helper.${node.callee.name}.dynamic`
      });
    }
    return;
  }

  if (node.callee?.type === "Identifier" && node.callee.name === "cleanEnv" && isKnownEnvObject(node.arguments?.[0], aliases)) {
    collectSchemaObject(node.arguments?.[1], findings, seenFindings, relPath, "cleanEnv.schema");
  }
}

function collectSchemaObject(node, findings, seenFindings, relPath, pattern) {
  if (node?.type !== "ObjectExpression") return;
  for (const property of node.properties || []) {
    if (property.type !== "ObjectProperty") continue;
    const name = staticPropertyName(property);
    if (!isValidKey(name)) continue;
    pushFinding(findings, seenFindings, {
      name,
      kind: "usage",
      file: relPath,
      line: lineOf(property.key),
      column: columnOf(property.key),
      pattern
    });
  }
}

function isEnvMemberExpression(node, aliases) {
  return (node?.type === "MemberExpression" || node?.type === "OptionalMemberExpression") && isKnownEnvObject(node.object, aliases);
}

function isKnownEnvObject(node, aliases) {
  return isProcessEnv(node) || isImportMetaEnv(node) || isBunEnv(node) || (node?.type === "Identifier" && aliases.has(node.name));
}

function envObjectLabel(node, aliases) {
  if (isProcessEnv(node)) return "process.env";
  if (isImportMetaEnv(node)) return "import.meta.env";
  if (isBunEnv(node)) return "Bun.env";
  if (node?.type === "Identifier" && aliases.has(node.name)) return aliases.get(node.name);
  return "env";
}

function isProcessEnv(node) {
  return (
    (node?.type === "MemberExpression" || node?.type === "OptionalMemberExpression") &&
    node.object?.type === "Identifier" &&
    node.object.name === "process" &&
    staticPropertyName(node) === "env"
  );
}

function isImportMetaEnv(node) {
  return (
    (node?.type === "MemberExpression" || node?.type === "OptionalMemberExpression") &&
    node.object?.type === "MetaProperty" &&
    node.object.meta?.name === "import" &&
    node.object.property?.name === "meta" &&
    staticPropertyName(node) === "env"
  );
}

function isBunEnv(node) {
  return (
    (node?.type === "MemberExpression" || node?.type === "OptionalMemberExpression") &&
    node.object?.type === "Identifier" &&
    node.object.name === "Bun" &&
    staticPropertyName(node) === "env"
  );
}

function isDenoEnvGet(node) {
  return (
    (node?.type === "MemberExpression" || node?.type === "OptionalMemberExpression") &&
    staticPropertyName(node) === "get" &&
    node.object &&
    (node.object.type === "MemberExpression" || node.object.type === "OptionalMemberExpression") &&
    node.object.object?.type === "Identifier" &&
    node.object.object.name === "Deno" &&
    staticPropertyName(node.object) === "env"
  );
}

function staticPropertyName(node) {
  if (!node) return null;
  const key = node.key || node.property;
  if (!node.computed && key?.type === "Identifier") return key.name;
  return staticString(key);
}

function staticString(node) {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value?.cooked || node.quasis[0]?.value?.raw;
  return null;
}

function pushFinding(findings, seen, finding) {
  const key = `${finding.kind}|${finding.name}|${finding.file}|${finding.line}|${finding.column}|${finding.pattern}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push(finding);
}

function pushDynamic(dynamicUsages, seen, usage) {
  const key = `${usage.file}|${usage.line}|${usage.column}|${usage.pattern}`;
  if (seen.has(key)) return;
  seen.add(key);
  dynamicUsages.push(usage);
}

function lineOf(node) {
  return node?.loc?.start?.line || 1;
}

function columnOf(node) {
  return (node?.loc?.start?.column ?? 0) + 1;
}

function traverse(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments") continue;
    if (Array.isArray(value)) {
      for (const item of value) traverse(item, visit);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      traverse(value, visit);
    }
  }
}

function isValidKey(name) {
  if (!name || name.length < 2 || name.length > 120) return false;
  if (["KEY", "FOO", "BAR", "BAZ", "USAGE"].includes(name)) return false;
  return /^[A-Z][A-Z0-9_]+$/.test(name);
}
