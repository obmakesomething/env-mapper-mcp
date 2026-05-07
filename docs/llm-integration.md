# LLM Integration

Env Mapper MCP should use LLMs as reviewers, not as secret readers.

The scanner is deterministic and redacted. It gathers variable names, source
locations, classifications, and dry-run plan metadata. The LLM layer receives
that review packet and can help answer:

- Is this variable likely public config, server-only config, or secret?
- Should a missing variable be added to `.env.example` and DMNO?
- Should an unused declaration remain optional or become a cleanup candidate?
- Does a public-prefixed variable look unsafe?
- What PR comment or issue summary should explain the findings?

## CLI

```bash
node src/cli.js scan --root . --emit llm --format json
node src/cli.js scan --root . --emit llm --format text
```

## MCP Tool

Start the server:

```bash
node src/cli.js mcp
```

Call:

- `env_mapper_llm_packet`

The tool returns `mode: "redacted-llm-review-packet"` with:

- safety rules
- model instructions
- review items
- redacted variable metadata
- source locations without snippets or values

## Safe Prompt Pattern

```text
You are reviewing a redacted env var mapping packet.

Rules:
- Do not ask for secret values.
- Do not infer or generate credentials.
- Do not recommend live provider mutations.
- Use only the redacted variable names, classifications, and source metadata.
- Mark uncertain items as needs-human-review.

Output:
1. Highest-risk variables
2. DMNO schema changes to review
3. Dry-run provider plan changes to review
4. Human decisions required
```

## Non-Goals

The LLM layer must not:

- read `.env` or `.env.local`
- print secret values
- create secret values
- mutate Infisical, 1Password, Doppler, OpenBao, Vault, CI, or hosting
  provider settings
- replace deterministic scanner output

