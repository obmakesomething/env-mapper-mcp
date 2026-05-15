import fs from "node:fs";
import path from "node:path";
import { REPORT_SCHEMA_VERSION, VERSION } from "./constants.js";
import { classifyVariable } from "./classify.js";
import { loadScanConfig, rootSafetyWarnings, scanConfigForReport } from "./config.js";
import { detectFile } from "./detectors.js";
import { listScannableFiles } from "./fs-walk.js";

export function scanRepository(rootInput, options = {}) {
  const root = path.resolve(rootInput || ".");
  validateRoot(root);
  const loadedConfig = loadScanConfig(root, options);
  const scanConfig = loadedConfig.config;
  const byName = new Map();
  const warnings = rootSafetyWarnings(root);
  const files = listScannableFiles(root, scanConfig, warnings);
  let filesScanned = 0;
  const dynamicUsages = [];

  for (const filePath of files) {
    let text;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      warnings.push(`Could not read ${path.relative(root, filePath)}: ${error.message}`);
      continue;
    }
    filesScanned += 1;
    const scanResult = detectFile(filePath, root, text, scanConfig);
    for (const finding of scanResult.findings) {
      if (!byName.has(finding.name)) byName.set(finding.name, []);
      byName.get(finding.name).push(finding);
    }
    if (Array.isArray(scanResult.dynamicUsages)) {
      dynamicUsages.push(...scanResult.dynamicUsages);
    }
  }

  let variables = [...byName.entries()]
    .filter(([name]) => !(scanConfig.ignoreKeys || []).includes(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, sources]) => {
      const sortedSources = sources.sort(compareSource);
      const classification = classifyVariable(name, sortedSources, scanConfig);
      const variable = {
        name,
        ...classification,
        usageCount: sources.filter((source) => source.kind === "usage").length,
        declarationCount: sources.filter((source) => source.kind === "declaration").length,
        referenceCount: sources.filter((source) => source.kind === "reference").length,
        providerReferenceCount: sources.filter((source) => source.kind === "provider-reference").length,
        sources: limitSources(sortedSources, scanConfig, warnings, name),
        notes: notesFor(classification),
        findings: []
      };
      variable.findings = findingsForVariable(variable);
      return variable;
    });
  if (scanConfig.maxVariables && variables.length > scanConfig.maxVariables) {
    warnings.push(`Report truncated after maxVariables=${scanConfig.maxVariables}.`);
    variables = variables.slice(0, scanConfig.maxVariables);
  }
  const findings = variables
    .flatMap((variable) => variable.findings)
    .concat(dynamicUsages.map(dynamicFindingFor))
    .sort(compareFindings);

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    toolVersion: VERSION,
    scanConfigHash: loadedConfig.hash,
    scanConfig: scanConfigForReport(loadedConfig),
    dynamicUsages,
    version: VERSION,
    root,
    generatedAt: new Date().toISOString(),
    filesScanned,
    totals: {
      variables: variables.length,
      missingDeclarations: variables.filter((item) => item.missingDeclaration).length,
      unusedDeclarations: variables.filter((item) => item.unusedDeclaration).length,
      secretCandidates: variables.filter((item) => item.sensitivity === "secret").length,
      reviewCandidates: variables.filter((item) => item.needsReview).length,
      dynamicUsageCandidates: dynamicUsages.length,
      findings: findings.length
    },
    variables,
    findings,
    warnings
  };
  enforceOutputLimit(report, scanConfig);
  return report;
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

function limitSources(sources, scanConfig, warnings, name) {
  if (!scanConfig.maxSourcesPerVariable || sources.length <= scanConfig.maxSourcesPerVariable) return sources;
  warnings.push(`Sources for ${name} truncated after maxSourcesPerVariable=${scanConfig.maxSourcesPerVariable}.`);
  return sources.slice(0, scanConfig.maxSourcesPerVariable);
}

function findingsForVariable(variable) {
  const findings = [];
  if (variable.missingDeclaration) {
    findings.push(
      buildFinding({
        kind: "missing-declaration",
        severity: "high",
        variable: variable.name,
        message: "Variable is used in code but no env-file declaration or provider reference was found.",
        evidence: evidenceFrom(variable.sources.filter((source) => source.kind === "usage"))
      })
    );
  }
  if (variable.unusedDeclaration) {
    findings.push(
      buildFinding({
        kind: "declared-only",
        severity: "medium",
        variable: variable.name,
        message: "Variable is declared but no direct code usage was found; review before treating it as cleanup.",
        evidence: evidenceFrom(
          variable.sources.filter((source) => source.kind === "declaration" || source.kind === "provider-reference")
        )
      })
    );
  }
  if (variable.needsReview) {
    findings.push(
      buildFinding({
        kind: "public-secret-conflict",
        severity: "high",
        variable: variable.name,
        message: "Variable has a public prefix but also matches secret-like naming hints.",
        evidence: evidenceFrom(variable.sources)
      })
    );
  }
  if (variable.sensitivity === "unknown") {
    findings.push(
      buildFinding({
        kind: "unknown-sensitivity",
        severity: "medium",
        variable: variable.name,
        message: "Variable does not match public or secret naming hints.",
        evidence: evidenceFrom(variable.sources)
      })
    );
  }
  if (variable.providerReferenceCount > 0 && variable.declarationCount === 0) {
    findings.push(
      buildFinding({
        kind: "provider-reference-without-declaration",
        severity: "medium",
        variable: variable.name,
        message: "Variable is referenced by a provider expression but no env-file declaration was found.",
        evidence: evidenceFrom(variable.sources.filter((source) => source.kind === "provider-reference"))
      })
    );
  }
  return findings;
}

function dynamicFindingFor(source) {
  return buildFinding({
    kind: "dynamic-env-access",
    severity: "medium",
    variable: "DYNAMIC_ENV_KEY",
    message: "Environment access uses a computed key that could not be resolved to a concrete variable name.",
    evidence: evidenceFrom([source])
  });
}

function buildFinding({ kind, severity, variable, message, evidence }) {
  const evidenceIdentity = [...new Set(evidence.map((item) => `${item.kind}:${item.file}:${item.pattern || ""}`))]
    .sort()
    .join("|");
  const idInput = `${REPORT_SCHEMA_VERSION}|${kind}|${variable || ""}|${evidenceIdentity}`;
  return {
    id: `fnd_${stableHash(idInput)}`,
    kind,
    severity,
    variable,
    message,
    evidence
  };
}

function enforceOutputLimit(report, scanConfig) {
  if (!scanConfig.maxOutputBytes) return;
  const bytes = Buffer.byteLength(JSON.stringify(report), "utf8");
  if (bytes <= scanConfig.maxOutputBytes) return;
  throw new Error(`Report exceeds maxOutputBytes=${scanConfig.maxOutputBytes}; narrow the root, include/exclude paths, or raise the limit.`);
}

function evidenceFrom(sources) {
  return sources.map((source) => {
    const evidence = {
      kind: source.kind,
      file: source.file,
      line: source.line,
      pattern: source.pattern
    };
    if (source.column !== undefined) evidence.column = source.column;
    return evidence;
  });
}

function compareFindings(a, b) {
  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  return (
    rank[a.severity] - rank[b.severity] ||
    String(a.variable || "").localeCompare(String(b.variable || "")) ||
    a.kind.localeCompare(b.kind) ||
    a.id.localeCompare(b.id)
  );
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}
