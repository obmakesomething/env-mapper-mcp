import fs from "node:fs";
import path from "node:path";
import { DEFAULT_IGNORE_DIRS, MAX_FILE_BYTES, TEXT_EXTENSIONS } from "./constants.js";
import { isEnvFile } from "./detectors.js";

export function listScannableFiles(root, scanConfig = {}, warnings = []) {
  const files = [];
  walk(root, root, files, scanConfig, warnings);
  return files.sort();
}

function walk(root, current, files, scanConfig, warnings) {
  if (scanConfig.maxFiles && files.length >= scanConfig.maxFiles) return;
  let entries;
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
      const relDir = normalizePath(path.relative(root, fullPath));
      if (matchesAny(relDir, scanConfig.exclude)) continue;
      walk(root, fullPath, files, scanConfig, warnings);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isScannableFile(fullPath, root, scanConfig)) files.push(fullPath);
    if (scanConfig.maxFiles && files.length === scanConfig.maxFiles) {
      warnings.push(`Scan stopped after maxFiles=${scanConfig.maxFiles}.`);
      return;
    }
  }
}

function isScannableFile(filePath, root, scanConfig) {
  const relPath = normalizePath(path.relative(root, filePath));
  const base = path.basename(filePath);
  if (base.startsWith(".env") && isEnvFile(relPath)) return true;
  if (base === ".env" || base.startsWith(".env.")) return false;
  if (scanConfig.include?.length && !matchesAny(relPath, scanConfig.include)) return false;
  if (matchesAny(relPath, scanConfig.exclude)) return false;
  const ext = path.extname(base);
  if (!TEXT_EXTENSIONS.has(ext)) return false;
  try {
    const stat = fs.statSync(filePath);
    return stat.size <= (scanConfig.maxFileBytes || MAX_FILE_BYTES);
  } catch {
    return false;
  }
}

function matchesAny(relPath, patterns = []) {
  return patterns.some((pattern) => matchesPattern(relPath, normalizePath(pattern)));
}

function matchesPattern(relPath, pattern) {
  if (!pattern) return false;
  if (pattern.endsWith("/**")) return relPath === pattern.slice(0, -3) || relPath.startsWith(pattern.slice(0, -2));
  if (!pattern.includes("*")) return relPath === pattern || relPath.startsWith(`${pattern}/`);
  const regex = new RegExp(`^${globToRegex(pattern)}$`);
  return regex.test(relPath);
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function globToRegex(pattern) {
  let out = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const ch = pattern[index];
    const next = pattern[index + 1];
    if (ch === "*" && next === "*") {
      out += ".*";
      index += 1;
    } else if (ch === "*") {
      out += "[^/]*";
    } else {
      out += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return out;
}
