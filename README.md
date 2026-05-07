# Env Mapper MCP

Env Mapper MCP is a zero-dependency Node.js CLI and MCP server that scans a
repository for environment variable usage, then produces:

- a redacted JSON inventory
- a DMNO `.dmno/config.mts` draft
- a dry-run secret-store sync plan
- a redacted LLM review packet

It is built for the messy middle between code and secret managers: code uses
`process.env.FOO`, CI references `${FOO}`, `.env.example` lists `FOO=`, and
the team still has to manually keep DMNO, Infisical, 1Password, Doppler, or
Vault-like stores aligned. Env Mapper MCP creates the reviewable map first.

## Install

This MVP has no runtime dependencies. Clone the repo and run it with Node 20+:

```bash
node src/cli.js scan --root /path/to/repo --emit all --format json
```

If installed as a package later:

```bash
env-mapper scan --root /path/to/repo --emit all --format json
```

## CLI

```bash
node src/cli.js scan --root . --emit report --format json
node src/cli.js scan --root . --emit dmno --format text
node src/cli.js scan --root . --emit plan --provider infisical --format json
node src/cli.js scan --root . --emit llm --format json
node src/cli.js mcp
```

Options:

- `--root <path>`: repository or service root to scan
- `--emit report|dmno|plan|llm|all`: output target
- `--format json|text`: output format
- `--provider <name>`: provider name for dry-run plan metadata

The scanner reads files to find variable names, but it does not print secret
values. Env-file values are reduced to presence metadata.

## MCP Server

Start the stdio server:

```bash
node src/cli.js mcp
```

Available tools:

- `env_mapper_scan`: returns the redacted inventory
- `env_mapper_dmno_draft`: returns a DMNO schema draft
- `env_mapper_secret_plan`: returns a dry-run provider sync plan
- `env_mapper_llm_packet`: returns redacted facts and review questions for LLM-assisted mapping

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
      - uses: your-org/env-mapper-mcp@v0
        with:
          root: .
```

The action writes to `GITHUB_STEP_SUMMARY` when available and sets a `markdown`
output for PR comments through `actions/github-script` or `gh pr comment`. See
[docs/github-action.md](docs/github-action.md) for copy-paste PR comment
workflows.

## What It Detects Today

Code usage:

- `process.env.KEY`
- `process.env["KEY"]`
- `process.env[KEY]` (when KEY is dynamic, this is reported as `dynamic-usage` for review)
- `import.meta.env.KEY`
- `import.meta.env[KEY]` (dynamic forms are review candidates)
- `Deno.env.get("KEY")`
- `Deno.env.get(VAR)` (dynamic forms are review candidates)
- `Bun.env.KEY`
- `Bun.env[KEY]` (dynamic forms are review candidates)

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

## Security Model

Env Mapper MCP is read-only by default.

- It reports variable names, source locations, and presence metadata.
- It never prints raw env-file values.
- It generates provider sync plans, not live mutations.
- Any future `apply` mode must require explicit human approval and provider
  authentication outside the model context.

See [docs/security.md](docs/security.md) and
[docs/provider-contract.md](docs/provider-contract.md). See
[docs/llm-integration.md](docs/llm-integration.md) for the safe LLM review
pattern.

## Roadmap

- TypeScript package build once package manager setup is available.
- Deeper language-aware scanners for JS/TS, Python, Go, and Rust.
- DMNO monorepo service graph generation.
- Infisical MCP integration for key metadata CRUD in dry-run and approved apply
  modes.
- GitHub Action for PR comments showing missing and unused env vars.
- VS Code/Codex/Claude Desktop setup snippets.
