import fs from "node:fs";
import path from "node:path";
import { VERSION } from "./constants.js";
import { classifyVariable } from "./classify.js";
import { detectFile } from "./detectors.js";
import { listScannableFiles } from "./fs-walk.js";

export function scanRepository(rootInput) {
  const root = path.resolve(rootInput || ".");
  validateRoot(root);
  const files = listScannableFiles(root);
  const byName = new Map();
  const warnings = [];
  let filesScanned = 0;

  for (const filePath of files) {
    let text;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      warnings.push(`Could not read ${path.relative(root, filePath)}: ${error.message}`);
      continue;
    }
    filesScanned += 1;
    for (const finding of detectFile(filePath, root, text)) {
      if (!byName.has(finding.name)) byName.set(finding.name, []);
      byName.get(finding.name).push(finding);
    }
  }

  const variables = [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, sources]) => {
      const classification = classifyVariable(name, sources);
      return {
        name,
        ...classification,
        usageCount: sources.filter((source) => source.kind === "usage").length,
        declarationCount: sources.filter((source) => source.kind === "declaration").length,
        referenceCount: sources.filter((source) => source.kind === "reference").length,
        providerReferenceCount: sources.filter((source) => source.kind === "provider-reference").length,
        sources: sources.sort(compareSource),
        notes: notesFor(classification)
      };
    });

  return {
    version: VERSION,
    root,
    generatedAt: new Date().toISOString(),
    filesScanned,
    totals: {
      variables: variables.length,
      missingDeclarations: variables.filter((item) => item.missingDeclaration).length,
      unusedDeclarations: variables.filter((item) => item.unusedDeclaration).length,
      secretCandidates: variables.filter((item) => item.sensitivity === "secret").length,
      reviewCandidates: variables.filter((item) => item.needsReview).length
    },
    variables,
    warnings
  };
}

function validateRoot(root) {
  let stat;
  try {
    stat = fs.statSync(root);
  } catch {
    throw new Error(`Scan root does not exist: ${root}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Scan root is not a directory: ${root}`);
  }
}

function compareSource(a, b) {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;
}

function notesFor(classification) {
  const notes = [];
  if (classification.missingDeclaration) notes.push("Used in code but no env-file declaration was found.");
  if (classification.unusedDeclaration) notes.push("Declared but no direct code usage was found.");
  if (classification.needsReview) notes.push("Public prefix combined with secret-like name; verify client exposure.");
  if (classification.sensitivity === "unknown") notes.push("No secret/public hint detected; review intended handling.");
  return notes;
}
