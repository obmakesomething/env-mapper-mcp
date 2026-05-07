export function formatGithubAuditMarkdown(report) {
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
    section("Missing Declarations", missing, "No missing declarations found."),
    "",
    section("Unused Declarations", unused, "No unused declarations found."),
    "",
    section("Public/Secret Review Candidates", review, "No public/secret conflicts found."),
    "",
    section("Secret Candidates", secretCandidates, "No secret candidates found."),
    "",
    section("Public Config Candidates", publicCandidates, "No public config candidates found.")
  ];

  if (report.warnings.length > 0) {
    lines.push("", "### Scanner Warnings", "");
    for (const warning of report.warnings) lines.push(`- ${escapeMarkdown(warning)}`);
  }

  return `${lines.join("\n")}\n`;
}

function section(title, variables, emptyMessage) {
  const lines = [`### ${title}`, ""];
  if (variables.length === 0) {
    lines.push(`- ${emptyMessage}`);
    return lines.join("\n");
  }

  for (const variable of variables) {
    lines.push(
      `- \`${variable.name}\` ${badge(variable.visibility)} ${badge(variable.sensitivity)} required=${variable.required ? "yes" : "no"}`
    );
    lines.push(`  - Evidence: ${formatEvidence(variable.sources)}`);
    if (variable.notes.length > 0) lines.push(`  - Notes: ${variable.notes.map(escapeMarkdown).join(" ")}`);
  }

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
