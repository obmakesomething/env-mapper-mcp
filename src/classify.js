const PUBLIC_PREFIXES = [
  "NEXT_PUBLIC_",
  "NUXT_PUBLIC_",
  "PUBLIC_",
  "VITE_",
  "EXPO_PUBLIC_",
  "GATSBY_",
  "ASTRO_PUBLIC_",
  "REACT_APP_"
];

const SECRET_HINTS = [
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "PASS",
  "PRIVATE",
  "CREDENTIAL",
  "API_KEY",
  "ACCESS_KEY",
  "CLIENT_SECRET",
  "WEBHOOK_SECRET",
  "SIGNING_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
  "DSN",
  "AUTH"
];

export function classifyVariable(name, sources, scanConfig = {}) {
  const publicPrefixes = scanConfig.publicPrefixes?.length ? scanConfig.publicPrefixes : PUBLIC_PREFIXES;
  const secretHints = scanConfig.secretHints?.length ? scanConfig.secretHints : SECRET_HINTS;
  const knownPublic = new Set(scanConfig.knownPublic || []);
  const knownSecret = new Set(scanConfig.knownSecret || []);
  const visibility = knownPublic.has(name) || publicPrefixes.some((prefix) => name.startsWith(prefix))
    ? "public"
    : "server";
  const hasSecretHint = knownSecret.has(name) || (!knownPublic.has(name) && secretHints.some((hint) => name.includes(hint)));
  const sensitivity = knownSecret.has(name) ? "secret" : knownPublic.has(name) ? "public-config" : hasSecretHint ? "secret" : visibility === "public" ? "public-config" : "unknown";
  const hasUsage = sources.some((source) => source.kind === "usage");
  const hasDeclaration = sources.some((source) => source.kind === "declaration");
  const hasProviderReference = sources.some((source) => source.kind === "provider-reference");
  const missingDeclaration = hasUsage && !hasDeclaration && !hasProviderReference;
  const unusedDeclaration = hasDeclaration && !hasUsage;
  const needsReview = visibility === "public" && sensitivity === "secret";
  const required = hasUsage && !unusedDeclaration;

  return {
    visibility,
    sensitivity,
    required,
    missingDeclaration,
    unusedDeclaration,
    needsReview,
    confidence: confidenceFor({ hasUsage, hasDeclaration, hasProviderReference, hasSecretHint })
  };
}

export function dmnoTypeFor(name) {
  if (name === "PORT" || name.endsWith("_PORT") || name.endsWith("_TIMEOUT_MS")) return "number";
  if (
    name.startsWith("ENABLE_") ||
    name.startsWith("DISABLE_") ||
    name.endsWith("_ENABLED") ||
    name.endsWith("_FLAG") ||
    name.endsWith("_DEBUG")
  ) {
    return "boolean";
  }
  if (name.endsWith("_URL") || name.endsWith("_URI") || name === "DATABASE_URL" || name === "REDIS_URL") return "url";
  if (name.endsWith("_EMAIL") || name === "EMAIL") return "email";
  return "string";
}

function confidenceFor({ hasUsage, hasDeclaration, hasProviderReference, hasSecretHint }) {
  let score = 0.4;
  if (hasUsage) score += 0.25;
  if (hasDeclaration) score += 0.2;
  if (hasProviderReference) score += 0.1;
  if (hasSecretHint) score += 0.05;
  return Math.min(Number(score.toFixed(2)), 0.95);
}
