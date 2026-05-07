import fs from "node:fs";
import path from "node:path";
import { DEFAULT_IGNORE_DIRS, MAX_FILE_BYTES, TEXT_EXTENSIONS } from "./constants.js";
import { isEnvFile } from "./detectors.js";

export function listScannableFiles(root) {
  const files = [];
  walk(root, root, files);
  return files.sort();
}

function walk(root, current, files) {
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
      walk(root, fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isScannableFile(fullPath, root)) files.push(fullPath);
  }
}

function isScannableFile(filePath, root) {
  const relPath = path.relative(root, filePath);
  const base = path.basename(filePath);
  if (base.startsWith(".env") && isEnvFile(relPath)) return true;
  if (base === ".env" || base.startsWith(".env.")) return false;
  const ext = path.extname(base);
  if (!TEXT_EXTENSIONS.has(ext)) return false;
  try {
    const stat = fs.statSync(filePath);
    return stat.size <= MAX_FILE_BYTES;
  } catch {
    return false;
  }
}
