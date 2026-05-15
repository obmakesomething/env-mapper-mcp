# OSS Launch Packet

Drafted: 2026-05-07

This packet positions Env Mapper MCP for a public open-source launch. It is
written as public material: no credentials, customer data, private lead lists,
or unpublished partner claims belong here.

## Project

Env Mapper MCP is a read-only CLI, GitHub Action, and MCP server that maps
environment variable usage across a repository and turns the result into:

- a redacted env inventory
- a DMNO schema draft
- a dry-run secret-store sync plan
- a redacted LLM review packet
- a pull request env audit summary

## Problem

Teams often keep environment variable knowledge split across code, `.env`
examples, CI settings, secret managers, deployment providers, and docs. That
split creates drift:

- variables are used in code but missing from `.env.example`
- old declarations stay around after code stops using them
- public-prefixed keys can contain secret-like names
- dynamic env access hides concrete key ownership from reviewers
- secret-store migration plans require manual reconciliation

Env Mapper MCP creates the reviewable map first. It is intentionally read-only
so teams can inspect the drift before connecting any provider automation.

## Audience

Primary users:

- maintainers of Node.js, TypeScript, and full-stack repos with env drift
- teams adopting DMNO and wanting an initial schema draft
- teams using Infisical, Doppler, 1Password, Vault-like stores, or platform
  secrets who need a safe dry-run plan
- agent builders who need redacted env context for Codex, Claude, or other LLM
  reviewers

Secondary users:

- open-source maintainers who want a lightweight pull request env audit
- platform teams checking monorepo env ownership before provider cleanup

## Current Proof

Repository:

- https://github.com/obmakesomething/env-mapper-mcp

Implemented baseline:

- Node.js CLI with AST-backed JS/TS scanning
- stdio MCP server with focused tool names
- redacted scanner report
- DMNO draft generation
- dry-run secret plan generation
- redacted LLM review packet
- GitHub Action with workflow summary output
- CI covering node tests and action smoke checks

Recent credibility improvements:

- PR #1 added the GitHub Action env audit path:
  https://github.com/obmakesomething/env-mapper-mcp/pull/1
- PR #2 improved JS/TS scanner precision:
  https://github.com/obmakesomething/env-mapper-mcp/pull/2
- PR #2 CI run passed `node-tests` and `action-smoke`:
  https://github.com/obmakesomething/env-mapper-mcp/actions/runs/25476606536

Local private smoke evidence from 2026-05-07:

- five representative repos were scanned locally before launch
- generated JSON contained no likely secret-value patterns in the checked output
- dynamic runtime env candidates were surfaced where expected
- generated or virtualenv directory noise was reduced after default ignores

## Differentiation

Env Mapper MCP does not try to replace DMNO or Infisical.

It sits between code and provider tools:

- DMNO can own typed env schema and runtime validation.
- Infisical MCP or provider APIs can own secret CRUD.
- Env Mapper MCP reads the code and prepares the map that links usage,
  declarations, review questions, and dry-run provider actions.

That makes it useful before a team is ready to give an agent provider write
permissions.

## Safety Posture

Env Mapper MCP is read-only by default:

- reports variable names, locations, and declaration presence
- redacts env-file values as `[redacted]`
- emits dry-run provider plans only
- sends LLMs metadata, not secret values
- requires a future human gate before any provider apply mode

Public launch claims should stay precise:

- It is not a complete secret scanner.
- It is not a provider mutation tool in the MVP.
- It does not guarantee that every dynamic key can be resolved.
- JS/TS scanning is language-aware and heuristic, not a full parser.

## Launch Narrative

One-liner:

> Env Mapper MCP is a read-only MCP server and CLI that maps env var usage into
> DMNO drafts, dry-run secret plans, and redacted LLM review packets.

Short pitch:

> Environment variables drift because code, `.env.example`, CI, deploy
> settings, and secret managers all become separate sources of truth. Env
> Mapper MCP gives maintainers a safe first pass: scan the repo, see missing or
> unused variables, generate a DMNO draft, prepare a dry-run secret-store plan,
> and hand a redacted review packet to an LLM without exposing secret values.

Maintainer ask:

> Try it on one repo, open an issue with false positives or missing language
> patterns, and tell us what provider metadata would make the dry-run plan more
> useful.

## Launch Checklist

- [x] Public GitHub repository exists.
- [x] MIT license exists.
- [x] README explains install, CLI, MCP tools, detection scope, and security.
- [x] GitHub Action has copy-paste docs.
- [x] CI passes on public PRs.
- [x] JS/TS precision improved before support applications.
- [x] npm package published as `env-mapper-mcp@0.1.0`.
- [x] npm trusted publishing configured for future releases.
- [ ] Add screenshots or copied PR-summary example to README.
- [ ] Add repo-specific ignore override docs.
- [ ] Add issue templates for false positive and provider adapter requests.

## Next Roadmap

Near-term credibility:

- monorepo service graph and env ownership map
- provider metadata dry-run adapters
- expanded JS edge-case regression matrix
- docs for custom ignores and scan scope controls

LLM integration:

- keep LLM packets redacted and deterministic
- use LLMs to classify review items and draft PR comments
- avoid asking LLMs to infer or create secret values
- keep provider mutation behind explicit human approval
