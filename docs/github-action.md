# GitHub Action

Env Mapper MCP can run in pull requests and publish a redacted Markdown env audit.
The action scans source files and safe env declaration templates, then reports
variable names, file/line evidence, and review categories without printing secret
values.

The action can run as a non-blocking summary or as a PR gate. Baseline gates are
designed for adoption in repositories with existing config debt: old findings
can stay visible while newly introduced high-risk drift fails the PR.

## Step Summary

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
          output-format: markdown
```

When `GITHUB_STEP_SUMMARY` is available, the action appends the audit Markdown to
the workflow step summary and also exposes it as the `markdown` output.

## PR Comment

This example posts or updates a PR comment using `actions/github-script`. It does
not require Env Mapper MCP to call the GitHub API directly.

```yaml
name: Env audit

on:
  pull_request:

jobs:
  env-audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - id: env_audit
        uses: your-org/env-mapper-mcp@v0
        with:
          root: .
          output: env-mapper-audit.md
      - uses: actions/github-script@v7
        with:
          script: |
            const marker = '<!-- env-mapper-mcp-audit -->';
            const body = [marker, process.env.ENV_MAPPER_MARKDOWN].join('\n');
            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;
            const comments = await github.rest.issues.listComments({ owner, repo, issue_number });
            const existing = comments.data.find((comment) => comment.body?.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
            } else {
              await github.rest.issues.createComment({ owner, repo, issue_number, body });
            }
        env:
          ENV_MAPPER_MARKDOWN: ${{ steps.env_audit.outputs.markdown }}
```

## PR Gate

Fail only when the PR introduces new high-risk findings:

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
        with:
          fetch-depth: 0
      - uses: your-org/env-mapper-mcp@v0
        with:
          root: .
          baseline: origin/${{ github.base_ref }}
          fail-on: new-high
          output: env-mapper-audit.md
          json-output: env-mapper-audit.json
          output-format: all
          annotations: true
          max-findings: 25
```

## SARIF Code Scanning

The action can also write a redacted SARIF artifact for GitHub code scanning.
SARIF contains rule ids, finding messages, file paths, line numbers, detector
patterns, and safe metadata only. Secret values are not read or included.

```yaml
name: Env audit

on:
  pull_request:

jobs:
  env-audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/env-mapper-mcp@v0
        with:
          root: .
          sarif-output: env-mapper.sarif
          output-format: sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: env-mapper.sarif
```

Use `output-format: all` when you want Markdown, JSON, and SARIF artifacts from
the same action run.

Supported `fail-on` values:

- `none`
- `missing-declaration`
- `public-secret-conflict`
- `high`
- `new-high`
- `new-missing-declaration`

## Outputs

- `markdown`: redacted Markdown audit summary
- `markdown_path`: absolute path to the written summary when `output` is set
- `json`: redacted JSON audit payload when `output-format` includes JSON
- `json_path`: absolute path to the written JSON artifact when `json-output` is set
- `sarif`: redacted SARIF payload when `output-format` includes SARIF
- `sarif_path`: absolute path to the written SARIF artifact when `sarif-output` is set
- `missing_declarations`: count of variables used without a declaration or provider reference
- `unused_declarations`: count of declarations without direct code usage
- `review_candidates`: count of public variables that look secret-like
- `findings`: count of findings in the current report
- `new_findings`: count of new findings compared with the baseline
- `new_high_findings`: count of new high-severity findings compared with the baseline
- `new_missing_declarations`: count of new missing declarations compared with the baseline
- `new_public_secret_conflicts`: count of new public/secret conflicts compared with the baseline
