import path from "node:path";

const KEY = "[A-Z][A-Z0-9_]{1,}";

const CODE_PATTERNS = [
  { name: "process.env.dot", regex: new RegExp(`\\bprocess\\.env\\.(${KEY})\\b`, "g") },
  { name: "process.env.bracket", regex: new RegExp(`\\bprocess\\.env\\[['"](${KEY})['"]\\]`, "g") },
  { name: "import.meta.env", regex: new RegExp(`\\bimport\\.meta\\.env\\.(${KEY})\\b`, "g") },
  { name: "deno.env.get", regex: new RegExp(`\\bDeno\\.env\\.get\\(['"](${KEY})['"]\\)`, "g") },
  { name: "bun.env", regex: new RegExp(`\\bBun\\.env\\.(${KEY})\\b`, "g") }
];

const REFERENCE_PATTERNS = [
  { name: "shell.braced", regex: new RegExp(`\\$\\{(${KEY})\\}`, "g") },
  { name: "shell.simple", regex: new RegExp(`(^|[^A-Z0-9_])\\$(${KEY})\\b`, "g"), group: 2 },
  { name: "github.secrets", regex: new RegExp(`\\$\\{\\{\\s*secrets\\.(${KEY})\\s*\\}\\}`, "g"), kind: "provider-reference" },
  { name: "github.vars", regex: new RegExp(`\\$\\{\\{\\s*vars\\.(${KEY})\\s*\\}\\}`, "g"), kind: "provider-reference" }
];

export function detectFile(filePath, root, text) {
  const relPath = path.relative(root, filePath) || path.basename(filePath);
  const lineStarts = computeLineStarts(text);
  const findings = [];

  if (isEnvFile(relPath)) {
    findings.push(...detectEnvDeclarations(text, relPath));
  }

  if (isLikelyDockerOrYaml(relPath)) {
    findings.push(...detectComposeDeclarations(text, relPath));
  }

  for (const pattern of CODE_PATTERNS) {
    collectMatches({ findings, text, lineStarts, relPath, pattern, kind: "usage" });
  }

  if (shouldDetectReferences(relPath)) {
    for (const pattern of REFERENCE_PATTERNS) {
      collectMatches({
        findings,
        text,
        lineStarts,
        relPath,
        pattern,
        kind: pattern.kind || "reference"
      });
    }
  }

  return findings;
}

export function isEnvFile(relPath) {
  const base = path.basename(relPath);
  return (
    base === ".env.example" ||
    base === ".env.sample" ||
    base === ".env.template" ||
    base === ".env.defaults" ||
    /^\.env\.[A-Za-z0-9_-]+\.(example|sample|template|defaults)$/.test(base)
  );
}

function detectEnvDeclarations(text, relPath) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(#|$)/.test(line)) continue;
    const match = line.match(new RegExp(`^\\s*(?:export\\s+)?(${KEY})\\s*=`));
    if (!match) continue;
    const [, name] = match;
    const rawValue = line.slice(line.indexOf("=") + 1).trim();
    findings.push({
      name,
      kind: "declaration",
      file: relPath,
      line: index + 1,
      column: line.indexOf(name) + 1,
      pattern: "env.assignment",
      hasValue: rawValue.length > 0,
      value: "[redacted]"
    });
  }
  return findings;
}

function detectComposeDeclarations(text, relPath) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const listMatch = line.match(new RegExp(`^\\s*-\\s*(${KEY})(?:\\s*=|\\s*$)`));
    const mapMatch = line.match(new RegExp(`^\\s{2,}(${KEY})\\s*:\\s*(?:\\$|\\$\\{|"\\$|'\\$|$)`));
    const match = listMatch || mapMatch;
    if (!match) continue;
    const [, name] = match;
    findings.push({
      name,
      kind: "declaration",
      file: relPath,
      line: index + 1,
      column: line.indexOf(name) + 1,
      pattern: listMatch ? "compose.env-list" : "yaml.env-map",
      hasValue: /=\s*\S+/.test(line),
      value: "[redacted]"
    });
  }
  return findings;
}

function collectMatches({ findings, text, lineStarts, relPath, pattern, kind }) {
  for (const match of text.matchAll(pattern.regex)) {
    const groupIndex = pattern.group || 1;
    const name = match[groupIndex];
    if (!name || !isValidKey(name)) continue;
    const position = offsetToLineColumn(lineStarts, match.index + match[0].indexOf(name));
    findings.push({
      name,
      kind,
      file: relPath,
      line: position.line,
      column: position.column,
      pattern: pattern.name
    });
  }
}

function isLikelyDockerOrYaml(relPath) {
  const base = path.basename(relPath);
  return (
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    relPath.endsWith(".yml") ||
    relPath.endsWith(".yaml")
  );
}

function shouldDetectReferences(relPath) {
  const base = path.basename(relPath);
  const ext = path.extname(base);
  return (
    isEnvFile(relPath) ||
    base === "Dockerfile" ||
    base === "docker-compose.yml" ||
    base === "docker-compose.yaml" ||
    [".json", ".md", ".sh", ".toml", ".txt", ".yaml", ".yml"].includes(ext)
  );
}

function isValidKey(name) {
  if (name.length < 2 || name.length > 120) return false;
  if (["PATH", "HOME", "PWD", "SHELL", "USER", "TERM", "KEY", "FOO", "BAR", "BAZ", "USAGE"].includes(name)) {
    return false;
  }
  return /^[A-Z][A-Z0-9_]+$/.test(name);
}

function computeLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function offsetToLineColumn(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (starts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  const lineIndex = Math.max(0, low - 1);
  return {
    line: lineIndex + 1,
    column: offset - starts[lineIndex] + 1
  };
}
