# Support Program Packet

Drafted: 2026-05-07

This is a human-review packet for OpenAI and Anthropic/Claude support
opportunities. It is not a submission record. Do not submit any application
without a maintainer review of identity, contact details, eligibility, and final
claims.

## Official Sources Checked

Checked on 2026-05-07:

- OpenAI Codex for Open Source:
  https://developers.openai.com/community/codex-for-oss
- OpenAI Codex open source fund form:
  https://openai.com/form/codex-open-source-fund/
- Anthropic for Startups:
  https://claude.com/programs/startups
- Anthropic Startup Program official terms:
  https://www.anthropic.com/startup-program-official-terms
- Anthropic External Researcher Access Program:
  https://support.claude.com/en/articles/9125743-what-is-the-external-researcher-access-program

## Program Fit

| Program | Fit | Official-criteria check | Why | Human action |
| --- | --- | --- | --- | --- |
| OpenAI Codex for Open Source | Strong primary fit | Matched: public OSS maintainer project and core maintainer workflows. The page says maintainers can apply for API credits, six months of ChatGPT Pro with Codex, and conditional Codex Security access. | The project can use Codex for PR review, scanner regression work, docs, release workflows, and maintainer automation. | Apply after maintainer identity and repo proof are reviewed. |
| OpenAI Codex Open Source Fund | Strong primary fit | Matched: form asks for OSS project, GitHub repo, description, collaborators, and API-credit use. The form describes grants up to $25,000 in API credits. | The API-credit plan is tied to redacted LLM review packets and maintainer workflows. | Apply after final maintainer review. |
| Anthropic for Startups | Conditional fit | Not verified: requires eligible startup backing through Anthropic VC partners. | The program is aimed at early-stage startups backed by Anthropic VC partners. | Use only if the maintainer has eligible VC backing or an investor partner link. |
| Anthropic External Researcher Access | Weak or conditional fit | Not matched for general tooling: requires AI safety/alignment research and is evaluated monthly. | Env Mapper MCP is primarily developer tooling, not alignment research. | Do not use unless the project is reframed as a concrete safety/alignment evaluation project. |

## Submission Guardrails

Allowed:

- public repository URL
- public PRs, commits, CI runs, and docs
- maintainer contact details approved by the maintainer
- honest roadmap and limitations
- credit usage plans that keep LLM inputs redacted

Not allowed:

- private secret values
- customer names or private repo names without approval
- claims that support, funding, credits, or partnership already exist
- claims that benefits or credits are guaranteed; they are discretionary and
  subject to each program's review and approval
- claims that the scanner provides complete security coverage
- claims that provider mutation exists in the MVP

## Application Snapshot

Project name:

- Env Mapper MCP

Repository:

- https://github.com/obmakesomething/env-mapper-mcp

License:

- MIT

Stage:

- Early public MVP with CLI, MCP server, GitHub Action, npm package, tests,
  docs, passing CI, and trusted publishing configured for future releases.

Package:

- https://www.npmjs.com/package/env-mapper-mcp

Release:

- https://github.com/obmakesomething/env-mapper-mcp/releases/tag/v0.1.0

Maintainer fields for the form:

- legal name: Daeyoung Lee
- LinkedIn: https://www.linkedin.com/in/oblee2
- GitHub: https://github.com/obmakesomething
- email: human confirmation required before submission
- collaborators: none listed unless the maintainer adds names

Short description:

> Env Mapper MCP is a read-only CLI, GitHub Action, and MCP server that maps
> environment variable usage into redacted inventories, DMNO drafts, dry-run
> secret-store plans, and LLM review packets without exposing secret values.

Problem:

> Env var ownership drifts across code, `.env.example`, CI, deployment
> settings, and secret managers. Teams need a safe map before they let agents
> draft schema changes or touch provider metadata.

Audience:

> Open-source maintainers, full-stack teams, platform teams, and agent builders
> who need repo-aware env mapping without giving an LLM secret values or
> provider write access.

Why now:

> DMNO, Infisical MCP, Codex, Claude Code, and GitHub Actions make the workflow
> possible, but there is still a gap: a small OSS tool that reads the code,
> redacts sensitive values, and prepares the mapping layer between schema,
> provider metadata, and LLM review.

Technical proof:

- CLI scan, DMNO draft, dry-run provider plan, and LLM packet are implemented.
- MCP stdio tools expose the same safe surfaces.
- GitHub Action can audit pull requests with redacted markdown.
- JS/TS scanner precision now handles comments, strings, template literals,
  regex literals, static bracket access, and dynamic access metadata.
- The package is published as `env-mapper-mcp@0.1.0`.
- npm trusted publishing is configured for the GitHub publish workflow.
- Tests and CI pass publicly.

Safety:

- Env-file values are reduced to presence metadata.
- LLM packet output contains redacted variables and review questions only.
- Provider sync plans are dry-run and do not include live mutation support.
- Future apply mode requires explicit human approval and provider auth outside
  the model context.

## OpenAI Draft Answers

These draft answers are for human review before submission. Any credits,
benefits, or access are discretionary and subject to the relevant program's
review and approval.

### Which open source project are you representing?

Env Mapper MCP

### Brief description of the project

Env Mapper MCP is a read-only open-source CLI, GitHub Action, and MCP server
that maps environment variable usage across a repository. It produces a
redacted inventory, a DMNO schema draft, a dry-run secret-store sync plan, and a
redacted LLM review packet so maintainers can resolve env drift without
exposing secret values to an agent. The project is published on npm as
`env-mapper-mcp` and includes a GitHub Action for pull request env audits.

### GitHub repository

https://github.com/obmakesomething/env-mapper-mcp

### How would you use API credits for your project?

We would use API credits to build and evaluate redacted maintainer workflows:

- classify scanner findings from redacted LLM packets
- draft pull request comments for missing, unused, dynamic, or risky env vars
- generate DMNO review suggestions without secret values
- test Codex-driven false-positive reduction across fixture repos
- build maintainer automation for issue triage, docs updates, and release notes
- run regression analysis on open-source sample repos while preserving the
  project's read-only, redacted safety model

The credits would not be used to ingest raw secret values or mutate secret
providers. Provider apply flows remain future work behind explicit human
approval.

### Other collaborators

Human review required:

- no collaborators are currently listed
- add names only if the maintainer wants to include additional project
  contributors and their roles

### Anything else to know?

Env Mapper MCP is designed to complement, not replace, tools like DMNO and
Infisical. DMNO can own typed runtime env validation; Infisical or provider
MCPs can own secret CRUD; Env Mapper MCP owns the safe mapping layer that reads
the code and prepares redacted review artifacts. The project is intentionally
small, public, npm-installable, and workflow-focused so it can be useful to
maintainers before any provider write permissions are introduced.

## Anthropic/Claude Draft Positioning

Use this only if eligibility is real. As of 2026-05-07, the best Claude path is
conditional:

- Anthropic for Startups: apply through an eligible partner VC route.
- External Researcher Access: apply only for a concrete AI safety/alignment
  research plan, not general developer tooling.

If eligible for Anthropic for Startups, the Claude-specific positioning is:

> Env Mapper MCP would use Claude API credits for redacted env-review workflows:
> classifying dynamic env access, drafting safe maintainer review questions,
> summarizing PR env drift, and testing agent-readable security guardrails for
> secret-management automation. Claude would receive only variable names,
> source metadata, classifications, and dry-run plan metadata, never raw secret
> values.

If pursuing External Researcher Access, the research plan must be narrowed to
something like:

> Evaluate how coding agents handle redacted secret-management workflows, and
> measure whether explicit MCP tool contracts reduce unsafe requests for secret
> values or provider mutations.

Human review required before using that framing:

- confirm this is genuine AI safety/alignment research
- define evaluation methodology
- define non-sensitive datasets and fixtures
- confirm compliance with Anthropic usage policies

## Evidence To Attach Or Reference

- GitHub repo: https://github.com/obmakesomething/env-mapper-mcp
- MVP commit: `4940706`
- GitHub Action PR: https://github.com/obmakesomething/env-mapper-mcp/pull/1
- JS/TS precision PR: https://github.com/obmakesomething/env-mapper-mcp/pull/2
- OSS launch packet PR:
  https://github.com/obmakesomething/env-mapper-mcp/pull/3
- npm readiness PR:
  https://github.com/obmakesomething/env-mapper-mcp/pull/4
- first-publish docs correction PR:
  https://github.com/obmakesomething/env-mapper-mcp/pull/5
- npm bin metadata fix PR:
  https://github.com/obmakesomething/env-mapper-mcp/pull/6
- post-publish docs cleanup PR:
  https://github.com/obmakesomething/env-mapper-mcp/pull/7
- npm package: https://www.npmjs.com/package/env-mapper-mcp
- GitHub release: https://github.com/obmakesomething/env-mapper-mcp/releases/tag/v0.1.0
- Latest passing CI used for support packet:
  https://github.com/obmakesomething/env-mapper-mcp/actions/runs/25503809825
- Security model: `docs/security.md`
- LLM integration model: `docs/llm-integration.md`
- Provider mutation contract: `docs/provider-contract.md`

## Human Review Checklist

- [x] Confirm maintainer legal name, GitHub, and LinkedIn fields.
- [ ] Confirm maintainer email field.
- [x] Confirm whether collaborators should be named.
- [x] Confirm OpenAI application route: Codex for OSS / Open Source Fund form.
- [ ] Confirm whether any Anthropic route is actually eligible.
- [ ] Review final prose for claims and tone.
- [ ] Submit manually or with maintainer-supervised browser assistance; do not
      submit without the maintainer reviewing the final form state.
