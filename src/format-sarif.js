const SARIF_VERSION = "2.1.0";
const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

const RULES = [
  {
    id: "missing-declaration",
    name: "Missing env declaration",
    shortDescription: "Env var is used in code but has no declaration or provider reference.",
    fullDescription: "A configuration key is referenced by code, but Env Mapper did not find a matching safe declaration or provider metadata reference.",
    help: "Add a placeholder to .env.example, document the key, or ensure read-only provider metadata includes the key before deployment."
  },
  {
    id: "public-secret-conflict",
    name: "Public secret-like env var",
    shortDescription: "Env var uses a public prefix and secret-like name.",
    fullDescription: "A configuration key appears client-exposed but also matches secret-like naming hints.",
    help: "Verify that the value is safe for client exposure. Rename or move the key to server-only config if it is secret."
  },
  {
    id: "dynamic-env-access",
    name: "Dynamic env access",
    shortDescription: "Env access uses a computed key.",
    fullDescription: "A computed env key cannot be mapped to a concrete configuration key without human review.",
    help: "Prefer explicit env keys for deployment review, or document the dynamic key pattern and ownership."
  },
  {
    id: "unknown-sensitivity",
    name: "Unknown env sensitivity",
    shortDescription: "Env var does not match known public or secret hints.",
    fullDescription: "A configuration key could not be confidently classified as public, internal, or secret-like metadata.",
    help: "Classify the key in env-mapper config using knownPublic, knownSecret, publicPrefixes, or secretHints."
  },
  {
    id: "declared-only",
    name: "Declared-only env var",
    shortDescription: "Env var is declared but no direct code usage was found.",
    fullDescription: "A configuration key appears in declarations or provider references, but Env Mapper did not find direct code usage.",
    help: "Review before cleanup. Runtime-only, CI-only, docs-only, or provider-only variables can be legitimate."
  },
  {
    id: "provider-reference-without-declaration",
    name: "Provider reference without declaration",
    shortDescription: "Provider metadata reference exists without env-file declaration.",
    fullDescription: "A configuration key is referenced through provider metadata, but no safe env declaration template was found.",
    help: "Add a placeholder declaration or document why the key is provider-only."
  }
];

const LEVEL_BY_SEVERITY = {
  high: "error",
  medium: "warning",
  low: "note",
  info: "note"
};

export function buildSarif(report, options = {}) {
  const findings = limitFindings(report.findings || [], options.maxFindings);
  return {
    version: SARIF_VERSION,
    $schema: SARIF_SCHEMA,
    runs: [
      {
        tool: {
          driver: {
            name: "Env Mapper MCP",
            informationUri: "https://github.com/obmakesomething/env-mapper-mcp",
            semanticVersion: report.toolVersion || report.version,
            rules: RULES.map(formatRule)
          }
        },
        automationDetails: {
          id: "env-mapper/config-audit"
        },
        invocations: [
          {
            executionSuccessful: true,
            properties: {
              schemaVersion: report.schemaVersion,
              scanConfigHash: report.scanConfigHash,
              secretValuesIncluded: false
            }
          }
        ],
        results: findings.map((finding) => formatResult(finding, report)),
        properties: {
          generatedAt: report.generatedAt,
          root: report.root,
          filesScanned: report.filesScanned,
          totals: report.totals,
          secretValuesIncluded: false,
          truncated: Boolean(options.maxFindings && (report.findings || []).length > options.maxFindings)
        }
      }
    ]
  };
}

function formatRule(rule) {
  return {
    id: rule.id,
    name: rule.name,
    shortDescription: {
      text: rule.shortDescription
    },
    fullDescription: {
      text: rule.fullDescription
    },
    help: {
      text: rule.help
    },
    defaultConfiguration: {
      level: defaultLevelForRule(rule.id)
    },
    properties: {
      category: "env-config-drift",
      precision: "medium",
      tags: ["configuration", "environment", "ai-safe"]
    }
  };
}

function formatResult(finding, report) {
  const evidence = firstEvidence(finding);
  const result = {
    ruleId: ruleIdFor(finding.kind),
    ruleIndex: ruleIndexFor(finding.kind),
    level: LEVEL_BY_SEVERITY[finding.severity] || "warning",
    message: {
      text: `${finding.variable} ${finding.kind}: ${finding.message}`
    },
    locations: evidence ? [formatLocation(evidence)] : [],
    partialFingerprints: {
      envMapperFindingId: finding.id
    },
    properties: {
      findingId: finding.id,
      variable: finding.variable,
      severity: finding.severity,
      safeForAgent: true,
      secretValuesIncluded: false,
      evidence: (finding.evidence || []).map(redactedEvidence),
      repoRoot: report.root
    }
  };
  return result;
}

function formatLocation(evidence) {
  const region = {
    startLine: evidence.line || 1
  };
  if (evidence.column) region.startColumn = evidence.column;
  return {
    physicalLocation: {
      artifactLocation: {
        uri: normalizeUri(evidence.file || "unknown")
      },
      region
    },
    message: {
      text: evidence.pattern ? `${evidence.kind} (${evidence.pattern})` : evidence.kind
    }
  };
}

function redactedEvidence(evidence) {
  const item = {
    kind: evidence.kind,
    file: evidence.file,
    line: evidence.line,
    pattern: evidence.pattern
  };
  if (evidence.column !== undefined) item.column = evidence.column;
  return item;
}

function firstEvidence(finding) {
  return (finding.evidence || []).find((item) => item.file && item.line);
}

function ruleIdFor(kind) {
  return RULES.some((rule) => rule.id === kind) ? kind : "unknown-sensitivity";
}

function ruleIndexFor(kind) {
  const index = RULES.findIndex((rule) => rule.id === ruleIdFor(kind));
  return index >= 0 ? index : 0;
}

function defaultLevelForRule(id) {
  if (id === "missing-declaration" || id === "public-secret-conflict") return "error";
  if (id === "dynamic-env-access" || id === "unknown-sensitivity" || id === "provider-reference-without-declaration") return "warning";
  return "note";
}

function limitFindings(findings, maxFindings) {
  if (!maxFindings || findings.length <= maxFindings) return findings;
  return findings.slice(0, maxFindings);
}

function normalizeUri(uri) {
  return String(uri).replaceAll("\\", "/");
}
