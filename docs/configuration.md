# Configuration

Env Mapper can run without a config file. Add one when a repository needs
custom include paths, classification hints, ignored keys, or safety limits.

Config discovery order:

1. `--config <path>`
2. `env-mapper.config.mjs`
3. `.env-mapper.json`

Example:

```json
{
  "include": ["src/**", ".github/workflows/**", "README.md"],
  "exclude": ["dist/**", "build/**", "coverage/**", "node_modules/**"],
  "serviceRoots": ["apps/web", "apps/api"],
  "knownPublic": ["NEXT_PUBLIC_SUPABASE_URL", "SENTRY_DSN"],
  "knownSecret": ["DATABASE_URL", "STRIPE_SECRET_KEY", "OPENAI_API_KEY"],
  "ignoreKeys": ["PATH", "HOME", "PWD", "SHELL", "USER"],
  "envHelpers": ["env", "getEnv", "requiredEnv", "readEnv"],
  "publicPrefixes": ["NEXT_PUBLIC_", "VITE_", "PUBLIC_", "EXPO_PUBLIC_"],
  "secretHints": ["SECRET", "TOKEN", "PASSWORD", "PRIVATE", "API_KEY"],
  "allowedRoots": ["."],
  "maxFiles": 5000,
  "maxFileBytes": 1048576,
  "maxVariables": 500,
  "maxSourcesPerVariable": 25,
  "maxOutputBytes": 1048576
}
```

`env-mapper.config.mjs` must export a JSON-serializable object:

```js
export default {
  include: ["src/**"],
  allowedRoots: ["."]
};
```

## Safety Behavior

- Local secret files such as `.env` and `.env.local` remain excluded by
  default.
- `allowedRoots` blocks scans outside approved roots. Relative entries are
  resolved from the config file directory.
- Scanning `/` or the home directory produces a warning because variable names
  and file paths are sensitive metadata.
- `maxFiles`, `maxVariables`, and `maxSourcesPerVariable` truncate metadata and
  add explicit warnings to the report.
- Config values are recorded in the report as `scanConfig`; secret values are
  still never read or returned.

## CLI

```bash
env-mapper scan --root . --config .env-mapper.json --emit report --format json
env-mapper mcp --config .env-mapper.json
```

MCP tools can also receive a `config` argument per call.
