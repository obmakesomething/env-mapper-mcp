import path from "node:path";

const KEY = "[A-Z][A-Z0-9_]{1,}";

const STATIC_CODE_PATTERNS = [
  { name: "process.env.dot", regex: new RegExp(`\\bprocess\\.env\\.(${KEY})\\b`, "g") },
  { name: "import.meta.env", regex: new RegExp(`\\bimport\\.meta\\.env\\.(${KEY})\\b`, "g") },
  { name: "bun.env", regex: new RegExp(`\\bBun\\.env\\.(${KEY})\\b`, "g") }
];

const JS_DYNAMIC_DETECTOR_PATTERNS = [
  { base: "process.env", staticPattern: "process.env.bracket", dynamicPattern: "process.env.bracket.dynamic", open: "[", close: "]" },
  { base: "import.meta.env", staticPattern: "import.meta.env.bracket", dynamicPattern: "import.meta.env.bracket.dynamic", open: "[", close: "]" },
  { base: "Bun.env", staticPattern: "Bun.env.bracket", dynamicPattern: "Bun.env.bracket.dynamic", open: "[", close: "]" },
  { base: "Deno.env.get", staticPattern: "Deno.env.get", dynamicPattern: "Deno.env.get.dynamic", open: "(", close: ")" }
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
  const dynamicUsages = [];
  const useJsSyntaxMask = isJavaScriptSource(relPath);
  const scanText = useJsSyntaxMask ? maskJavaScriptSource(text) : text;

  if (isEnvFile(relPath)) {
    findings.push(...detectEnvDeclarations(text, relPath));
  }

  if (isLikelyDockerOrYaml(relPath)) {
    findings.push(...detectComposeDeclarations(text, relPath));
  }

  for (const pattern of STATIC_CODE_PATTERNS) {
    collectMatches({ findings, text: scanText, lineStarts, relPath, pattern, kind: "usage" });
  }

  if (useJsSyntaxMask) {
    for (const pattern of JS_DYNAMIC_DETECTOR_PATTERNS) {
      collectDynamicEnvAccesses({
        text: scanText,
        originalText: text,
        lineStarts,
        relPath,
        dynamicUsages,
        findings,
        pattern
      });
    }
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

  return { findings, dynamicUsages };
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
    if (kind === "reference" && isNoisyReferenceKey(name)) continue;
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

function collectDynamicEnvAccesses({ text, originalText, lineStarts, relPath, pattern, findings, dynamicUsages }) {
  let searchFrom = 0;
  const token = `${pattern.base}${pattern.open}`;

  while (true) {
    const start = text.indexOf(token, searchFrom);
    if (start === -1) break;
    const openIndex = start + token.length - 1;
    const closeIndex = findMatchingDelimiter(text, openIndex, pattern.open, pattern.close);
    if (closeIndex === -1) {
      searchFrom = start + token.length;
      continue;
    }

    const rawExpr = originalText.slice(openIndex + 1, closeIndex);
    const staticMatch = parseStaticEnvKey(rawExpr);
    if (staticMatch) {
      const keyOffset = openIndex + 1 + staticMatch.keyOffset;
      findings.push({
        name: staticMatch.name,
        kind: "usage",
        file: relPath,
        line: offsetToLineColumn(lineStarts, keyOffset).line,
        column: offsetToLineColumn(lineStarts, keyOffset).column,
        pattern: pattern.staticPattern
      });
    } else {
      const position = offsetToLineColumn(lineStarts, openIndex + 1);
      dynamicUsages.push({
        kind: "dynamic-usage",
        file: relPath,
        line: position.line,
        column: position.column,
        pattern: pattern.dynamicPattern
      });
    }

    searchFrom = closeIndex + 1;
  }
}

function parseStaticEnvKey(rawExpr) {
  const trimmed = rawExpr.trim();
  if (!trimmed) return null;

  const trimmedLead = rawExpr.match(/^\s*/)?.[0].length ?? 0;

  const singleQuoted = trimmed.match(new RegExp(`^'(${KEY})'$`));
  if (singleQuoted && isValidKey(singleQuoted[1])) {
    return { name: singleQuoted[1], keyOffset: trimmedLead + 1 };
  }

  const doubleQuoted = trimmed.match(new RegExp(`^"(${KEY})"$`));
  if (doubleQuoted && isValidKey(doubleQuoted[1])) {
    return { name: doubleQuoted[1], keyOffset: trimmedLead + 1 };
  }

  const templateLiteral = trimmed.match(/^`(.+)`$/);
  if (templateLiteral && isValidKey(templateLiteral[1])) {
    if (templateLiteral[1].includes("${")) return null;
    return { name: templateLiteral[1], keyOffset: trimmedLead + 1 };
  }

  return null;
}

function findMatchingDelimiter(text, openIndex, open, close) {
  let depth = 1;
  for (let i = openIndex + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function maskJavaScriptSource(text) {
  const out = text.split("");
  const stack = [{ kind: "normal" }];

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    const frame = stack[stack.length - 1];

    if (frame.kind === "line-comment") {
      out[i] = maskOutputChar(ch);
      if (ch === "\n") stack.pop();
      continue;
    }

    if (frame.kind === "block-comment") {
      out[i] = maskOutputChar(ch);
      if (ch === "*" && next === "/") {
        out[i + 1] = maskOutputChar(text[i + 1]);
        i += 1;
        stack.pop();
      }
      continue;
    }

    if (frame.kind === "single-quoted" || frame.kind === "double-quoted") {
      out[i] = maskOutputChar(ch);
      if (frame.escaped) {
        frame.escaped = false;
        continue;
      }
      if (ch === "\\") {
        frame.escaped = true;
        continue;
      }
      if ((frame.kind === "single-quoted" && ch === "'") || (frame.kind === "double-quoted" && ch === '"')) {
        stack.pop();
      }
      continue;
    }

    if (frame.kind === "regex") {
      out[i] = maskOutputChar(ch);
      if (frame.escaped) {
        frame.escaped = false;
        continue;
      }
      if (ch === "\\") {
        frame.escaped = true;
        continue;
      }
      if (ch === "[") {
        frame.inCharClass = true;
        continue;
      }
      if (ch === "]") {
        frame.inCharClass = false;
        continue;
      }
      if (ch === "/" && !frame.inCharClass) {
        stack.pop();
        while (/[a-z]/i.test(text[i + 1] || "")) {
          out[i + 1] = maskOutputChar(text[i + 1]);
          i += 1;
        }
        continue;
      }
      if (ch === "\n") stack.pop();
      continue;
    }

    if (frame.kind === "template") {
      out[i] = maskOutputChar(ch);
      if (frame.escaped) {
        frame.escaped = false;
        continue;
      }
      if (ch === "\\") {
        frame.escaped = true;
        continue;
      }
      if (ch === "`") {
        stack.pop();
        continue;
      }
      if (ch === "$" && next === "{") {
        out[i] = maskOutputChar(ch);
        out[i + 1] = maskOutputChar(next);
        i += 1;
        stack.push({ kind: "template-expression", exprDepth: 1, escaped: false });
      }
      continue;
    }

    if (frame.kind === "template-expression") {
      if (frame.escaped) {
        out[i] = ch;
        frame.escaped = false;
        continue;
      }

      if (ch === "\\") {
        out[i] = ch;
        frame.escaped = true;
        continue;
      }

      if (ch === "'" || ch === "\"") {
        out[i] = ch;
        stack.push({
          kind: ch === "'" ? "single-quoted" : "double-quoted",
          quote: ch,
          escaped: false
        });
        continue;
      }

      if (ch === "`") {
        out[i] = maskOutputChar(ch);
        stack.push({ kind: "template", escaped: false });
        continue;
      }

      if (ch === "/" && next === "/") {
        out[i] = maskOutputChar(ch);
        out[i + 1] = maskOutputChar(next);
        i += 1;
        stack.push({ kind: "line-comment" });
        continue;
      }

      if (ch === "/" && next === "*") {
        out[i] = maskOutputChar(ch);
        out[i + 1] = maskOutputChar(next);
        i += 1;
        stack.push({ kind: "block-comment" });
        continue;
      }

      if (ch === "/" && isRegexLiteralStart(text, i)) {
        out[i] = maskOutputChar(ch);
        stack.push({ kind: "regex", escaped: false, inCharClass: false });
        continue;
      }

      if (ch === "{") frame.exprDepth += 1;
      if (ch === "}") {
        frame.exprDepth -= 1;
        out[i] = ch;
        if (frame.exprDepth === 0) {
          stack.pop();
          continue;
        }
      }

      if (frame.exprDepth > 0) {
        out[i] = ch;
      }
      continue;
    }

    if (frame.kind !== "normal") {
      out[i] = ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      out[i] = maskOutputChar(ch);
      out[i + 1] = maskOutputChar(next);
      i += 1;
      stack.push({ kind: "line-comment" });
      continue;
    }

    if (ch === "/" && next === "*") {
      out[i] = maskOutputChar(ch);
      out[i + 1] = maskOutputChar(next);
      i += 1;
      stack.push({ kind: "block-comment" });
      continue;
    }

    if (ch === "'" || ch === "\"") {
      out[i] = maskOutputChar(ch);
      stack.push({
        kind: ch === "'" ? "single-quoted" : "double-quoted",
        quote: ch,
        escaped: false
      });
      continue;
    }

    if (ch === "/" && isRegexLiteralStart(text, i)) {
      out[i] = maskOutputChar(ch);
      stack.push({ kind: "regex", escaped: false, inCharClass: false });
      continue;
    }

    if (ch === "`") {
      out[i] = maskOutputChar(ch);
      stack.push({ kind: "template", escaped: false });
      continue;
    }

    out[i] = ch;
  }

  return out.join("");
}

function maskOutputChar(ch) {
  return ch === "\n" ? "\n" : " ";
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
  if (["KEY", "FOO", "BAR", "BAZ", "USAGE"].includes(name)) {
    return false;
  }
  return /^[A-Z][A-Z0-9_]+$/.test(name);
}

function isNoisyReferenceKey(name) {
  return ["PATH", "HOME", "PWD", "SHELL", "USER", "TERM"].includes(name);
}

function isRegexLiteralStart(text, index) {
  if (text[index] !== "/") return false;
  const next = text[index + 1];
  if (!next || next === "/" || next === "*" || next === "=") return false;

  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) cursor -= 1;
  if (cursor < 0) return true;

  const previous = text[cursor];
  if ("([{=,:;!&|?+-~*%^<>".includes(previous)) return true;

  const previousWord = readPreviousWord(text, cursor);
  return ["return", "throw", "case", "delete", "typeof", "void", "new", "in", "of", "yield", "await"].includes(
    previousWord
  );
}

function readPreviousWord(text, endIndex) {
  let cursor = endIndex;
  while (cursor >= 0 && /[A-Za-z0-9_$]/.test(text[cursor])) cursor -= 1;
  return text.slice(cursor + 1, endIndex + 1);
}

function isJavaScriptSource(relPath) {
  const ext = path.extname(relPath);
  return new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]).has(ext);
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
