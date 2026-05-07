# Provider Contract

Provider integrations are split into two modes.

## Plan Mode

Plan mode is the MVP behavior. It is safe for agents.

- Input: scan report and provider name.
- Output: intended provider actions.
- Side effects: none.
- Secret values: never required.

Example action:

```json
{
  "action": "ensure_secret_key",
  "provider": "infisical",
  "key": "DATABASE_URL",
  "reason": "used in code and classified as secret",
  "requiresValue": true,
  "applySupported": false
}
```

## Apply Mode

Apply mode is future work and must be separately approved.

Requirements before implementation:

- explicit CLI flag such as `--apply`
- provider-specific authentication outside model-visible context
- dry-run diff shown before mutation
- audit log with key names only
- no raw secret values in stdout, logs, MCP result content, or test fixtures
- provider adapter tests against mocked APIs

## Provider Shape

Provider adapters should implement this logical interface:

```ts
type ProviderPlanAction = {
  action: "ensure_secret_key" | "ensure_public_config_key" | "mark_unused_candidate";
  provider: string;
  key: string;
  reason: string;
  requiresValue: boolean;
  applySupported: boolean;
};
```

Infisical, 1Password, Doppler, and OpenBao should share this plan contract even
if their apply implementations differ.

