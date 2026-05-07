# Security Model

Env Mapper MCP treats secret values as out of scope for agent-readable output.
The tool maps names, locations, and intent. It does not need values to produce
useful schema drafts or sync plans.

## Allowed

- Read repository text files inside the requested root.
- Detect environment variable names and references.
- Report file, line, column, pattern, and declaration presence.
- Infer likely visibility and sensitivity from key names and source patterns.
- Generate DMNO schema drafts with `sensitive: true` where appropriate.
- Generate dry-run provider plans with action metadata only.

## Not Allowed In MVP

- Print raw values from `.env`, `.env.local`, CI exports, shell files, or docs.
- Store discovered values.
- Mutate Infisical, 1Password, Doppler, OpenBao, Vault, cloud secret managers,
  CI secrets, or hosting provider settings.
- Read browser sessions or private credential stores.
- Claim complete security coverage from regex-only scanning.

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

