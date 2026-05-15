# Env Mapper: AI-safe Environment Config Audit

[![Test](https://github.com/obmakesomething/env-mapper-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/obmakesomething/env-mapper-mcp/actions/workflows/test.yml)

Env Mapper is an AI-safe Environment Config Audit tool. It maps environment
configuration names, declarations, source locations, classifications, and review
questions so humans and coding agents can reason about config drift without
reading secret values.

Env Mapper is not a secret scanner. It does not detect leaked secret values,
entropy patterns, private keys, tokens, or credential material. Use Gitleaks,
TruffleHog, GitHub secret scanning, or provider-specific controls for leaked
secret detection.

Delivery channels are:

- CLI for local and CI scans
- GitHub Action for pull request audit summaries
- MCP server for agent-readable, redacted audit packets

It scans a repository for environment variable usage, then produces:

- a redacted JSON inventory
- a DMNO `.dmno/config.mts` draft
- a dry-run secret-store sync plan
- a redacted LLM review packet
- a pull request env audit summary

It is built for the messy middle between code and secret managers: code uses
`process.env.FOO`, CI references `${FOO}`, `.env.example` lists `FOO=`, and
teams still have to keep DMNO, Infisical, 1Password, Doppler, Vault-like
stores, and platform secrets aligned. Env Mapper creates the reviewable map
first.

## Why It Exists

Environment variables drift because no single tool sees all of the places they
show up:

- code uses variables that are missing from `.env.example`
- old declarations remain after code stops using them
- public-prefixed variables can contain secret-like names
- dynamic env access hides concrete ownership from reviewers
- secret-store migrations need a plan before provider writes are safe

Env Mapper keeps the first pass read-only. It reports names, source locations,
classifications, and review questions. It does not print secret values, detect
leaked secret values, or mutate providers.

## Quick Start

Requirements:

- Node.js 20+
- no runtime package install required

Run the published package directly:

```bash
npx -p env-mapper-mcp env-mapper scan --root /path/to/repo --emit all --format json
```

Or install the CLI:

```bash
npm install -g env-mapper-mcp
env-mapper scan --root /path/to/repo --emit all --format json
```

Clone and scan a repository:

```bash
git clone https://github.com/obmakesomething/env-mapper-mcp.git
cd env-mapper-mcp
node src/cli.js scan --root /path/to/repo --emit all --format json
```

Try the fixture:

```bash
node src/cli.js scan --root test/fixtures/basic --emit report --format text
```

Example text output:

```text
Env Mapper report for /path/to/repo
Files scanned: 3
Variables: 5
Missing declarations: 1
Unused declarations: 2

- DATABASE_URL: server/secret, required=true, sources=2
- MISSING_API_TOKEN: server/secret, required=true, sources=1
```

## CLI

```bash
env-mapper scan --root . --emit report --format json
env-mapper scan --root . --emit dmno --format text
env-mapper scan --root . --emit plan --provider infisical --format json
env-mapper scan --root . --emit llm --format json
env-mapper scan --root . --emit all --format json
env-mapper mcp
```

Options:

- `--root <path>`: repository or service root to scan
- `--emit report|dmno|plan|llm|all`: output target
- `--format json|text`: output format
- `--provider <name>`: provider name for dry-run plan metadata

The scanner reads files to find variable names, but it does not print secret
values. Env-file values are reduced to presence metadata.

Variable names, file paths, line numbers, and provider names can still be
sensitive metadata. Treat audit output as internal engineering evidence, not as
a public artifact.

## MCP Delivery Channel

Start the stdio server:

```bash
env-mapper mcp
```

Available tools:

- `env_mapper_scan`: returns the redacted inventory
- `env_mapper_dmno_draft`: returns a DMNO schema draft
- `env_mapper_secret_plan`: returns a dry-run provider sync plan
- `env_mapper_llm_packet`: returns redacted facts and review questions for
  LLM-assisted mapping

Example client command:

```json
{
  "command": "env-mapper",
  "args": ["mcp"]
}
```

When developing from a source checkout, use:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/env-mapper-mcp/src/cli.js", "mcp"]
}
```

The MCP server is one delivery channel for the same redacted audit surfaces that
the CLI and GitHub Action use. It is intended for agent workflows that need
structured environment config context without secret values.

The server implements the MCP stdio JSON-RPC lifecycle directly so the project
remains usable without package-manager setup. Future releases can swap in the
official SDK while keeping the same internal scanner contract.

## GitHub Action

Use the bundled action to add a redacted env audit to pull request workflow
summaries:

```yaml
name: Env audit

on:
  pull_request:

jobs:
  env-audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: obmakesomething/env-mapper-mcp@main
        with:
          root: .
```

The action writes to `GITHUB_STEP_SUMMARY` when available and sets a `markdown`
output. To post that markdown as a PR comment, add a separate
`actions/github-script` or `gh pr comment` step. See
[docs/github-action.md](docs/github-action.md) for copy-paste workflows.

## What It Detects Today

Code usage:

- `process.env.KEY`
- `process.env["KEY"]`
- `process.env[KEY]` where dynamic keys become `dynamic-usage` review items
- `import.meta.env.KEY`
- `import.meta.env[KEY]` where dynamic forms are review candidates
- `Deno.env.get("KEY")`
- `Deno.env.get(VAR)` where dynamic forms are review candidates
- `Bun.env.KEY`
- `Bun.env[KEY]` where dynamic forms are review candidates

Config and docs references:

- `${KEY}`
- `$KEY`
- GitHub Actions `${{ secrets.KEY }}` and `${{ vars.KEY }}`
- Docker Compose list items such as `- KEY=value`

Env-file declarations:

- `.env.example`
- `.env.sample`
- `.env.template`
- `.env.defaults`
- `.env.*.example`

Local secret env files such as `.env` and `.env.local` are ignored by default
through `.gitignore`; if scanned explicitly, values are still redacted.

## Default Ignores

Env Mapper skips common generated, dependency, and local-work directories by
default, including:

- VCS dirs such as `.git`
- dependency dirs such as `node_modules`, `vendor`, `venv`, and `.venv`
- build/cache dirs such as `dist`, `build`, `coverage`, `.next`, `.turbo`,
  `.cache`, and Python cache dirs
- local work dirs such as `worktrees` and `.codex-artifacts`

This reduces generated-code noise. If a project intentionally stores source
env references in these paths, scan a narrower root or open an issue describing
the override behavior you need.

## LLM Review Packet

Use this when an LLM should review env drift without seeing secret values:

```bash
env-mapper scan --root . --emit llm --format json
```

The packet contains:

- safety rules
- redacted variable metadata
- missing and unused declaration review items
- dynamic env access review items
- source locations without snippets or values

See [docs/llm-integration.md](docs/llm-integration.md) for the safe prompt
pattern.

## What It Complements

Env Mapper is a config-audit map, not the whole secret-management stack.

| Tool category | Owns | Env Mapper role |
| --- | --- | --- |
| Gitleaks, TruffleHog | leaked secret value detection | complements with env name, declaration, and usage audit |
| GitHub secret scanning | platform-side leaked secret alerts | complements with PR env drift summaries |
| Doppler, Infisical | secret storage and access workflows | produces dry-run sync plans, not live writes |
| DMNO | typed env schema and runtime validation | drafts schema candidates from repo evidence |
| dotenv-linter | `.env` file syntax and consistency checks | maps cross-file usage, declarations, and review questions |

See [docs/comparison.md](docs/comparison.md) for concise positioning details.

## Security Model

Env Mapper is read-only by default.

- It reports variable names, source locations, and presence metadata.
- It never prints raw env-file values.
- It generates provider sync plans, not live mutations.
- It does not claim complete secret-scanning coverage.
- It does not detect leaked secret values.
- It treats variable names and file paths as sensitive metadata.
- Any future `apply` mode must require explicit human approval and provider
  authentication outside the model context.

See [docs/security.md](docs/security.md) and
[docs/provider-contract.md](docs/provider-contract.md). See
[docs/limitations.md](docs/limitations.md) for scope boundaries.

## Development

```bash
npm test
npm run build
npm run pack:check
node src/cli.js scan --root test/fixtures/basic --emit all --format json
```

Current CI runs:

- Node test suite
- CLI build smoke scan
- GitHub Action smoke scan with redaction checks

## OSS Launch And Support Packet

For public positioning, launch checklist, and human-reviewed AI support program
drafts, see [docs/oss-launch.md](docs/oss-launch.md) and
[docs/support-programs.md](docs/support-programs.md).

For first npm release steps and trusted-publishing setup, see
[docs/npm-publishing.md](docs/npm-publishing.md).

## Roadmap

- TypeScript package build once package manager setup is available.
- Deeper language-aware scanners for JS/TS, Python, Go, and Rust.
- DMNO monorepo service graph generation.
- Provider metadata dry-run adapters for Infisical and other stores.
- VS Code/Codex/Claude Desktop setup snippets.
- Human-approved provider apply mode after the safety contract is mature.

## Contributing

Useful issues include:

- false positives or false negatives with a minimal fixture
- language patterns for Python, Go, Rust, or framework-specific env access
- provider metadata fields that would make dry-run plans more actionable
- docs improvements for MCP clients and GitHub PR workflows

Please do not include real secret values in issues, fixtures, logs, or PRs.
