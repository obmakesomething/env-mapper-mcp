import { REPORT_SCHEMA_VERSION, VERSION } from "./constants.js";

export function generateLlmReviewPacket(report) {
  const variablesByName = new Map(report.variables.map((variable) => [variable.name, variable]));
  const reportFindings = report.findings || legacyFindingsFor(report);
  const items = reportFindings.map((finding) => reviewItemForFinding(finding, variablesByName)).sort(compareReviewItems);

  return {
    mode: "redacted-llm-review-packet",
    schemaVersion: report.schemaVersion || REPORT_SCHEMA_VERSION,
    toolVersion: report.toolVersion || VERSION,
    version: report.version || VERSION,
    generatedAt: report.generatedAt,
    root: report.root,
    purpose: "Help an LLM review env var classification, missing declarations, unused declarations, and sync-plan safety without seeing secret values.",
    safety: {
      containsSecretValues: false,
      mayRequestSecretValues: false,
      mayMutateProviders: false,
      allowedOutputs: [
        "classification suggestions",
        "DMNO schema review notes",
        "dry-run provider plan review notes",
        "PR or issue comment drafts"
      ],
      forbiddenOutputs: [
        "raw secret values",
        "generated credentials",
        "live provider mutations",
        "commands that print local secret files"
      ]
    },
    modelInstructions: [
      "Treat all evidence as redacted metadata.",
      "Do not ask for or infer secret values.",
      "Do not recommend live provider mutations; recommend dry-run plan changes only.",
      "Mark uncertain classifications as needs-human-review.",
      "Prefer small, reviewable follow-up changes."
    ],
    summary: {
      variables: report.totals.variables,
      reviewItems: items.length,
      findings: reportFindings.length,
      dynamicUsageCandidates: report.totals.dynamicUsageCandidates || 0,
      missingDeclarations: report.totals.missingDeclarations,
      unusedDeclarations: report.totals.unusedDeclarations,
      secretCandidates: report.totals.secretCandidates,
      reviewCandidates: report.totals.reviewCandidates
    },
    reviewItems: items,
    redactedVariables: report.variables.map((variable) => ({
      name: variable.name,
      visibility: variable.visibility,
      sensitivity: variable.sensitivity,
      required: variable.required,
      confidence: variable.confidence,
      usageCount: variable.usageCount,
      declarationCount: variable.declarationCount,
      referenceCount: variable.referenceCount,
      providerReferenceCount: variable.providerReferenceCount,
      notes: variable.notes,
      findings: variable.findings || [],
      sources: compactSources(variable)
    }))
  };
}

function reviewItemForFinding(finding, variablesByName) {
  const variable = variablesByName.get(finding.variable);
  return {
    id: finding.id,
    kind: finding.kind,
    severity: finding.severity,
    variable: finding.variable || "DYNAMIC_ENV_KEY",
    reason: finding.message,
    currentClassification: currentClassificationFor(variable),
    evidence: finding.evidence,
    suggestedQuestions: questionsFor(finding.kind, finding.variable || "DYNAMIC_ENV_KEY")
  };
}

function currentClassificationFor(variable) {
  if (!variable) {
    return {
      visibility: "server",
      sensitivity: "unknown",
      required: true,
      confidence: 0.42
    };
  }
  return {
    visibility: variable.visibility,
    sensitivity: variable.sensitivity,
    required: variable.required,
    confidence: variable.confidence
  };
}

function questionsFor(kind, variableName) {
  if (kind === "missing-declaration") {
    return [
      `Should ${variableName} be added to .env.example or the DMNO schema?`,
      `Is ${variableName} a secret or public config key?`,
      `Which service or environment owns ${variableName}?`
    ];
  }
  if (kind === "declared-only" || kind === "unused-in-code") {
    return [
      `Is ${variableName} still required by runtime configuration outside the scanned code?`,
      `Should ${variableName} stay in the schema as optional or move to a cleanup ticket?`
    ];
  }
  if (kind === "public-secret-conflict") {
    return [
      `Is ${variableName} safe to expose to client-side code?`,
      `Should the key be renamed without a public prefix or split into public and server-only values?`
    ];
  }
  if (kind === "unknown-sensitivity") {
    return [
      `What is the intended sensitivity of ${variableName}?`,
      `Does the name need a clearer suffix such as _URL, _TOKEN, or _PUBLIC?`
    ];
  }
  if (kind === "dynamic-env-access") {
    return [
      "What concrete variable name does this access resolve to in each runtime path?",
      "Should this be replaced with explicit variable names for better scanner coverage?"
    ];
  }
  if (kind === "provider-reference-without-declaration") {
    return [
      `Should ${variableName} be declared in the shared env schema?`,
      `Is the provider reference intentionally outside the scanned app runtime?`
    ];
  }
  return [`Does ${variableName} need human review before being added to shared config?`];
}

function compactSources(variable) {
  return variable.sources.slice(0, 6).map((source) => ({
    kind: source.kind,
    file: source.file,
    line: source.line,
    pattern: source.pattern
  }));
}

function compareReviewItems(a, b) {
  const rank = { high: 0, medium: 1, low: 2 };
  return rank[a.severity] - rank[b.severity] || a.variable.localeCompare(b.variable) || a.kind.localeCompare(b.kind);
}

function legacyFindingsFor(report) {
  return report.variables.flatMap((variable) => variable.findings || []);
}
