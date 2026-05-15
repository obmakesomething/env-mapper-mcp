export function buildGithubAudit(report, options = {}) {
  const markdown = formatGithubAuditMarkdown(report, options);
  return {
    mode: "github-audit",
    schemaVersion: report.schemaVersion,
    toolVersion: report.toolVersion,
    version: report.version,
    generatedAt: report.generatedAt,
    root: report.root,
    summary: report.totals,
    containsSecretValues: false,
    findings: report.findings || [],
    markdown
  };
}

export function formatGithubAuditMarkdown(report, options = {}) {
  const maxFindings = options.maxFindings;
  const missing = report.variables.filter((item) => item.missingDeclaration);
  const unused = report.variables.filter((item) => item.unusedDeclaration);
  const review = report.variables.filter((item) => item.needsReview);
  const publicCandidates = report.variables.filter((item) => item.visibility === "public");
  const secretCandidates = report.variables.filter((item) => item.sensitivity === "secret");

  const lines = [
    "## Env Mapper MCP audit",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Files scanned | ${report.filesScanned} |`,
    `| Variables found | ${report.totals.variables} |`,
    `| Missing declarations | ${report.totals.missingDeclarations} |`,
    `| Unused declarations | ${report.totals.unusedDeclarations} |`,
    `| Secret candidates | ${report.totals.secretCandidates} |`,
    `| Public/secret review candidates | ${report.totals.reviewCandidates} |`,
    "",
    "> Secret values are not included. Evidence is limited to variable names, source files, line numbers, and detector patterns.",
    "",
    section("Missing Declarations", missing, "No missing declarations found.", maxFindings),
    "",
    section("Unused Declarations", unused, "No unused declarations found.", maxFindings),
    "",
    section("Public/Secret Review Candidates", review, "No public/secret conflicts found.", maxFindings),
    "",
    section("Secret Candidates", secretCandidates, "No secret candidates found.", maxFindings),
    "",
    section("Public Config Candidates", publicCandidates, "No public config candidates found.", maxFindings)
  ];

  if (report.warnings.length > 0) {
    lines.push("", "### Scanner Warnings", "");
    for (const warning of report.warnings) lines.push(`- ${escapeMarkdown(warning)}`);
  }

  return `${lines.join("\n")}\n`;
}

function section(title, variables, emptyMessage, maxFindings) {
  const lines = [`### ${title}`, ""];
  if (variables.length === 0) {
    lines.push(`- ${emptyMessage}`);
    return lines.join("\n");
  }

  const visibleVariables = maxFindings ? variables.slice(0, maxFindings) : variables;
  for (const variable of visibleVariables) {
    lines.push(
      `- \`${variable.name}\` ${badge(variable.visibility)} ${badge(variable.sensitivity)} required=${variable.required ? "yes" : "no"}`
    );
    lines.push(`  - Evidence: ${formatEvidence(variable.sources)}`);
    if (variable.notes.length > 0) lines.push(`  - Notes: ${variable.notes.map(escapeMarkdown).join(" ")}`);
  }
  if (visibleVariables.length < variables.length) lines.push(`- ${variables.length - visibleVariables.length} more omitted by max-findings.`);

  return lines.join("\n");
}

function formatEvidence(sources) {
  const compact = sources.slice(0, 4).map((source) => {
    const kind = escapeMarkdown(source.kind);
    const file = codeSpan(`${source.file}:${source.line}`);
    const pattern = source.pattern ? ` (${escapeMarkdown(source.pattern)})` : "";
    return `${kind} at ${file}${pattern}`;
  });
  if (sources.length > compact.length) compact.push(`${sources.length - compact.length} more`);
  return compact.join("; ");
}

function badge(value) {
  return `\`${value}\``;
}

function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_{}[\]()#|]/g, "\\$&");
}

function codeSpan(value) {
  const text = String(value);
  const longestRun = Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));
  const delimiter = "`".repeat(longestRun + 1);
  const needsPadding = text.startsWith("`") || text.endsWith("`") || text.includes(delimiter);
  const content = needsPadding ? ` ${text} ` : text;
  return `${delimiter}${content}${delimiter}`;
}
