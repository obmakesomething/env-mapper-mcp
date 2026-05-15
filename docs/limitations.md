# Limitations

Env Mapper is intentionally narrow: it audits environment configuration metadata
without reading, printing, storing, or validating secret values.

## Not A Secret Scanner

Env Mapper does not detect leaked secret values. It does not search for entropy
patterns, private key blocks, token formats, password strings, or
provider-verified credentials. Pair it with tools such as Gitleaks, TruffleHog,
GitHub secret scanning, and provider alerts when leaked-secret detection is
required.

## Metadata Can Be Sensitive

Redacted output still contains metadata:

- variable names
- file paths
- line and column numbers
- declaration presence
- inferred sensitivity or visibility
- provider names in dry-run plans

This metadata can reveal vendors, architecture, environments, feature flags, and
operational intent. Treat reports, LLM packets, GitHub Action summaries, and MCP
tool results as internal engineering artifacts.

## Heuristic Coverage

The scanner maps common environment variable access and declaration patterns. It
can miss framework-specific, generated, encoded, indirect, or highly dynamic
usage. Dynamic access is reported as a review candidate when the concrete key
cannot be proven.

## Read-only Scope

Current provider output is a dry-run plan. Env Mapper does not write to Doppler,
Infisical, DMNO, GitHub, CI settings, cloud secret stores, or hosting providers.
Any future apply mode must require explicit human approval and provider
authentication outside model context.
