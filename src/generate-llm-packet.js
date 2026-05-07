export function generateLlmReviewPacket(report) {
  const items = report.variables
    .flatMap((variable) => reviewItemsFor(variable))
    .sort(compareReviewItems);

  return {
    mode: "redacted-llm-review-packet",
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
      sources: compactSources(variable)
    }))
  };
}

function reviewItemsFor(variable) {
  const items = [];
  if (variable.missingDeclaration) {
    items.push(itemFor(variable, "missing-declaration", "high", "Variable is used but no env-file declaration or provider reference was found."));
  }
  if (variable.unusedDeclaration) {
    items.push(itemFor(variable, "unused-declaration", "medium", "Variable is declared but no direct usage was found."));
  }
  if (variable.needsReview) {
    items.push(itemFor(variable, "public-secret-conflict", "high", "Variable has a public prefix but also looks secret-like."));
  }
  if (variable.sensitivity === "unknown") {
    items.push(itemFor(variable, "unknown-sensitivity", "medium", "Variable does not match public or secret naming hints."));
  }
  if (variable.confidence < 0.7) {
    items.push(itemFor(variable, "low-confidence", "low", "Classification confidence is low enough to benefit from human or LLM review."));
  }
  return items;
}

function itemFor(variable, kind, severity, reason) {
  return {
    kind,
    severity,
    variable: variable.name,
    reason,
    currentClassification: {
      visibility: variable.visibility,
      sensitivity: variable.sensitivity,
      required: variable.required,
      confidence: variable.confidence
    },
    evidence: compactSources(variable),
    suggestedQuestions: questionsFor(kind, variable)
  };
}

function questionsFor(kind, variable) {
  if (kind === "missing-declaration") {
    return [
      `Should ${variable.name} be added to .env.example or the DMNO schema?`,
      `Is ${variable.name} a secret or public config key?`,
      `Which service or environment owns ${variable.name}?`
    ];
  }
  if (kind === "unused-declaration") {
    return [
      `Is ${variable.name} still required by runtime configuration outside the scanned code?`,
      `Should ${variable.name} stay in the schema as optional or move to a cleanup ticket?`
    ];
  }
  if (kind === "public-secret-conflict") {
    return [
      `Is ${variable.name} safe to expose to client-side code?`,
      `Should the key be renamed without a public prefix or split into public and server-only values?`
    ];
  }
  if (kind === "unknown-sensitivity") {
    return [
      `What is the intended sensitivity of ${variable.name}?`,
      `Does the name need a clearer suffix such as _URL, _TOKEN, or _PUBLIC?`
    ];
  }
  return [`Does ${variable.name} need human review before being added to shared config?`];
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

