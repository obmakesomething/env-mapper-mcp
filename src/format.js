import { generateDmnoDraft } from "./generate-dmno.js";
import { generateLlmReviewPacket } from "./generate-llm-packet.js";
import { generateSecretPlan } from "./generate-plan.js";

export function buildEmission(report, options = {}) {
  const emit = options.emit || "report";
  const provider = options.provider || "infisical";
  if (emit === "report") return report;
  if (emit === "dmno") return { file: ".dmno/config.mts", content: generateDmnoDraft(report) };
  if (emit === "plan") return generateSecretPlan(report, provider);
  if (emit === "llm") return generateLlmReviewPacket(report);
  if (emit === "all") {
    return {
      report,
      dmno: {
        file: ".dmno/config.mts",
        content: generateDmnoDraft(report)
      },
      plan: generateSecretPlan(report, provider),
      llm: generateLlmReviewPacket(report)
    };
  }
  throw new Error(`Unknown emit target: ${emit}`);
}

export function formatEmission(emission, format = "json") {
  if (format === "json") return `${JSON.stringify(emission, null, 2)}\n`;
  if (format !== "text") throw new Error(`Unknown format: ${format}`);

  if (typeof emission.content === "string") return emission.content;
  if (emission.actions) return formatPlanText(emission);
  if (emission.mode === "redacted-llm-review-packet") return formatLlmPacketText(emission);
  if (emission.report && emission.dmno && emission.plan) return formatAllText(emission);
  return formatReportText(emission);
}

function formatAllText(emission) {
  return [
    formatReportText(emission.report),
    "\n--- DMNO draft ---\n",
    emission.dmno.content,
    "\n--- Secret-store plan ---\n",
    formatPlanText(emission.plan),
    "\n--- LLM review packet ---\n",
    formatLlmPacketText(emission.llm)
  ].join("");
}

function formatReportText(report) {
  const lines = [
    `Env Mapper report for ${report.root}`,
    `Files scanned: ${report.filesScanned}`,
    `Variables: ${report.totals.variables}`,
    `Missing declarations: ${report.totals.missingDeclarations}`,
    `Unused declarations: ${report.totals.unusedDeclarations}`,
    ""
  ];
  for (const variable of report.variables) {
    lines.push(
      `- ${variable.name}: ${variable.visibility}/${variable.sensitivity}, required=${variable.required}, sources=${variable.sources.length}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatPlanText(plan) {
  const lines = [
    `Secret-store plan (${plan.mode}) for ${plan.provider}`,
    `Actions: ${plan.summary.actions}`,
    ""
  ];
  for (const action of plan.actions) {
    lines.push(`- ${action.action} ${action.key}: ${action.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

function formatLlmPacketText(packet) {
  const lines = [
    "LLM review packet (redacted)",
    `Review items: ${packet.summary.reviewItems}`,
    `Missing declarations: ${packet.summary.missingDeclarations}`,
    `Unused declarations: ${packet.summary.unusedDeclarations}`,
    ""
  ];
  for (const item of packet.reviewItems) {
    lines.push(`- [${item.severity}] ${item.variable} ${item.kind}: ${item.reason}`);
  }
  if (packet.reviewItems.length === 0) lines.push("- No review items.");
  return `${lines.join("\n")}\n`;
}
