export function generateSecretPlan(report, provider = "infisical") {
  const actions = [];

  for (const variable of report.variables) {
    if (variable.unusedDeclaration && variable.providerReferenceCount === 0) {
      actions.push({
        action: "mark_unused_candidate",
        provider,
        key: variable.name,
        reason: "Declared but no direct usage or provider reference was found.",
        requiresValue: false,
        applySupported: false,
        sources: compactSources(variable)
      });
      continue;
    }

    if (variable.sensitivity === "secret") {
      actions.push({
        action: "ensure_secret_key",
        provider,
        key: variable.name,
        reason: reasonFor(variable),
        requiresValue: true,
        applySupported: false,
        sources: compactSources(variable)
      });
      continue;
    }

    if (variable.visibility === "public" || variable.sensitivity === "public-config") {
      actions.push({
        action: "ensure_public_config_key",
        provider,
        key: variable.name,
        reason: reasonFor(variable),
        requiresValue: false,
        applySupported: false,
        sources: compactSources(variable)
      });
      continue;
    }

    if (variable.unusedDeclaration) continue;
  }

  return {
    mode: "dry-run",
    provider,
    generatedAt: report.generatedAt,
    root: report.root,
    summary: {
      actions: actions.length,
      secretKeys: actions.filter((item) => item.action === "ensure_secret_key").length,
      publicConfigKeys: actions.filter((item) => item.action === "ensure_public_config_key").length,
      unusedCandidates: actions.filter((item) => item.action === "mark_unused_candidate").length
    },
    actions,
    warnings: [
      "Plan mode does not create, update, delete, or read secret values.",
      "Apply mode is intentionally unsupported in this MVP."
    ]
  };
}

function reasonFor(variable) {
  if (variable.missingDeclaration) return "Used in code and missing from env-file declarations.";
  if (variable.unusedDeclaration) return "Declared in env files but not directly used in code.";
  return `Classified as ${variable.sensitivity} with ${variable.confidence} confidence.`;
}

function compactSources(variable) {
  return variable.sources.slice(0, 6).map((source) => ({
    kind: source.kind,
    file: source.file,
    line: source.line,
    pattern: source.pattern
  }));
}
