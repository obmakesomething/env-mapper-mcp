# Security Model

Env Mapper treats secret values as out of scope for agent-readable output. The
tool maps names, locations, and intent. It does not need values to produce
useful schema drafts, dry-run provider plans, or pull request audit summaries.

Env Mapper is an AI-safe Environment Config Audit tool, not a secret scanner. It
does not detect leaked secret values, entropy patterns, private keys, tokens, or
credential material. Use dedicated secret-scanning tools for leaked secret
detection.

## Allowed

- Read repository text files inside the requested root.
- Detect environment variable names and references.
- Report file, line, column, pattern, and declaration presence.
- Infer likely visibility and sensitivity from key names and source patterns.
- Generate DMNO schema drafts with `sensitive: true` where appropriate.
- Generate dry-run provider plans with action metadata only.
- Expose the same redacted audit surfaces through CLI, GitHub Action, and MCP.

## Not Allowed In MVP

- Print raw values from `.env`, `.env.local`, CI exports, shell files, or docs.
- Store discovered values.
- Mutate Infisical, 1Password, Doppler, OpenBao, Vault, cloud secret managers,
  CI secrets, or hosting provider settings.
- Read browser sessions or private credential stores.
- Claim complete security coverage from regex-only scanning.
- Claim leaked secret value detection.
- Treat variable names, file paths, or provider names as safe for public output.

## Human Gates

The following require explicit human approval before implementation or use:

- live provider mutation
- provider credentials or machine identities
- cloud deployment
- public launch claims about security guarantees
- grant/support application submissions

## Redaction Policy

Env-file declarations are represented as:

```json
{
  "name": "DATABASE_URL",
  "hasValue": true,
  "value": "[redacted]"
}
```

The actual value is not returned, logged, stored, or passed to MCP tool output.

## Sensitive Metadata

Redaction does not make audit output public-safe. Variable names such as
`STRIPE_LIVE_SECRET_KEY`, file paths such as `apps/billing/production.env`, and
provider names can reveal architecture, vendors, environments, or operational
intent.

Treat generated reports, LLM packets, GitHub Action summaries, and MCP tool
results as internal engineering artifacts. Do not paste them into public issues,
external support tickets, or model contexts that are not approved for repository
metadata.

## Delivery Boundaries

The CLI, GitHub Action, and MCP server are delivery channels for the same
redacted environment config audit. MCP does not expand the scanner's authority:
it does not grant provider access, read credential stores, infer missing secret
values, or apply secret-manager changes.
