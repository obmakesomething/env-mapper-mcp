# GitHub Action

Env Mapper MCP can run in pull requests and publish a redacted Markdown env audit.
The action scans source files and safe env declaration templates, then reports
variable names, file/line evidence, and review categories without printing secret
values.

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

## Outputs

- `markdown`: redacted Markdown audit summary
- `markdown_path`: absolute path to the written summary when `output` is set
- `missing_declarations`: count of variables used without a declaration or provider reference
- `unused_declarations`: count of declarations without direct code usage
- `review_candidates`: count of public variables that look secret-like
