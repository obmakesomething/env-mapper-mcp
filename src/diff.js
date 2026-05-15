import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPORT_SCHEMA_VERSION, VERSION } from "./constants.js";
import { scanRepository } from "./scanner.js";

export function buildDiff({ root = ".", base, head, options = {} }) {
  if (!base) throw new Error("diff requires --base <git-ref-or-report-json>");
  const resolvedRoot = path.resolve(root);
  const baseReport = loadReportOrScanRef(base, resolvedRoot, options);
  const headReport = head ? loadReportOrScanRef(head, resolvedRoot, options) : scanRepository(resolvedRoot, options);
  return compareReports(baseReport, headReport, { root: resolvedRoot, base, head: head || "working-tree" });
}

export function compareReports(baseReport, headReport, meta = {}) {
  const baseFindings = new Map((baseReport.findings || []).map((finding) => [finding.id, finding]));
  const headFindings = new Map((headReport.findings || []).map((finding) => [finding.id, finding]));
  const newFindings = [...headFindings.values()].filter((finding) => !baseFindings.has(finding.id)).sort(compareFinding);
  const resolvedFindings = [...baseFindings.values()].filter((finding) => !headFindings.has(finding.id)).sort(compareFinding);
  const unchangedFindings = [...headFindings.values()].filter((finding) => baseFindings.has(finding.id)).sort(compareFinding);

  const baseVariables = new Map((baseReport.variables || []).map((variable) => [variable.name, variable]));
  const headVariables = new Map((headReport.variables || []).map((variable) => [variable.name, variable]));
  const newVariables = [...headVariables.keys()].filter((name) => !baseVariables.has(name)).sort();
  const removedVariables = [...baseVariables.keys()].filter((name) => !headVariables.has(name)).sort();
  const changedClassifications = [...headVariables.values()]
    .filter((variable) => {
      const before = baseVariables.get(variable.name);
      return before && classificationKey(before) !== classificationKey(variable);
    })
    .map((variable) => ({
      variable: variable.name,
      before: pickClassification(baseVariables.get(variable.name)),
      after: pickClassification(variable)
    }))
    .sort((a, b) => a.variable.localeCompare(b.variable));

  return {
    mode: "env-mapper-diff",
    schemaVersion: REPORT_SCHEMA_VERSION,
    toolVersion: VERSION,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    root: meta.root || headReport.root,
    base: {
      ref: meta.base,
      root: baseReport.root,
      generatedAt: baseReport.generatedAt
    },
    head: {
      ref: meta.head,
      root: headReport.root,
      generatedAt: headReport.generatedAt
    },
    summary: {
      newFindings: newFindings.length,
      resolvedFindings: resolvedFindings.length,
      unchangedFindings: unchangedFindings.length,
      changedClassifications: changedClassifications.length,
      newVariables: newVariables.length,
      removedVariables: removedVariables.length,
      newlyMissingDeclarations: newFindings.filter((finding) => finding.kind === "missing-declaration").length,
      newlyPublicSecretConflicts: newFindings.filter((finding) => finding.kind === "public-secret-conflict").length,
      newHighFindings: newFindings.filter((finding) => finding.severity === "high").length
    },
    newFindings,
    resolvedFindings,
    unchangedFindings,
    changedClassifications,
    newVariables,
    removedVariables
  };
}

function loadReportOrScanRef(input, root, options) {
  const maybePath = path.resolve(input);
  if (fs.existsSync(maybePath) && fs.statSync(maybePath).isFile()) {
    return JSON.parse(fs.readFileSync(maybePath, "utf8"));
  }
  return scanGitRef(input, root, options);
}

function scanGitRef(ref, root, options) {
  const repoRoot = git(root, ["rev-parse", "--show-toplevel"]).trim();
  const relRoot = path.relative(repoRoot, root);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "env-mapper-diff-"));
  try {
    const archive = spawnSync("git", ["-C", repoRoot, "archive", ref], { encoding: null, maxBuffer: 1024 * 1024 * 64 });
    if (archive.status !== 0) {
      throw new Error(`Could not archive git ref ${ref}: ${archive.stderr?.toString("utf8").trim() || "unknown error"}`);
    }
    const tar = spawnSync("tar", ["-x", "-C", tmp], { input: archive.stdout, encoding: null, maxBuffer: 1024 * 1024 * 64 });
    if (tar.status !== 0) throw new Error(`Could not extract git ref ${ref}: ${tar.stderr?.toString("utf8").trim() || "unknown error"}`);
    return scanRepository(path.join(tmp, relRoot), options);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout;
}

function classificationKey(variable) {
  return JSON.stringify(pickClassification(variable));
}

function pickClassification(variable) {
  return {
    visibility: variable.visibility,
    sensitivity: variable.sensitivity,
    required: variable.required
  };
}

function compareFinding(a, b) {
  return String(a.variable || "").localeCompare(String(b.variable || "")) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
}
