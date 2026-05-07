# npm Publishing

Env Mapper MCP is published on npm. Publishing creates an irreversible
package/version record on the registry, so every future release still needs a
reviewed tag, a dry run, and maintainer confirmation before `dry_run=false`.

## Package Name

Package:

```bash
env-mapper-mcp
```

As of 2026-05-07, `env-mapper-mcp@0.1.0` is public on npm:

- package: <https://www.npmjs.com/package/env-mapper-mcp>
- release: <https://github.com/obmakesomething/env-mapper-mcp/releases/tag/v0.1.0>

## Local Release Checks

Run these from the repository root:

```bash
npm test
npm run build
npm run pack:check
npm pack --dry-run --json
```

Expected package contents include:

- `package.json`
- `README.md`
- `LICENSE`
- `action.yml`
- `src/**`
- `docs/**`

The package must not include local env files, logs, worktrees, generated tarballs,
or secret values.

## Trusted Publishing

Use npm trusted publishing instead of a long-lived automation token. npm's
`npm trust` command requires the package to already exist on the registry, so
`env-mapper-mcp@0.1.0` was published through maintainer-authenticated local
publish first. Trusted publishing is now configured for future releases with:

- provider: GitHub Actions
- owner: `obmakesomething`
- repository: `env-mapper-mcp`
- workflow filename: `publish.yml`
- environment: none, unless a future release adds one intentionally

The workflow is manual and dry-run by default. It requests `id-token: write` so
npm can use OIDC when `dry_run` is set to `false`.

Current npm trusted publishing requirements checked on 2026-05-07:

- npm CLI `11.5.1` or newer
- npm CLI `11.10.0` or newer for the `npm trust` command
- Node.js `22.14.0` or newer
- package already exists on the npm registry for `npm trust`
- npm account has package write access and account-level 2FA enabled
- GitHub-hosted runners for GitHub Actions trusted publishing
- public repository and public package for automatic provenance

References checked on 2026-05-07:

- <https://docs.npmjs.com/trusted-publishers>
- <https://docs.npmjs.com/cli/v11/commands/npm-trust/>
- <https://docs.npmjs.com/cli/v11/configuring-npm/package-json>

## Historical First Publish Flow

The first publish has completed. Keep this record so maintainers can understand
the bootstrap sequence that created `env-mapper-mcp@0.1.0`.

1. Confirm the package name is still available:

   ```bash
   npm view env-mapper-mcp version
   ```

2. Create and push a signed or reviewed release tag:

   ```bash
   VERSION=$(node -p "require('./package.json').version")
   git tag "v${VERSION}"
   git push origin "v${VERSION}"
   ```

3. Open the `Publish npm package` workflow manually.

4. Run the workflow with:

   - `dry_run=true`
   - `release_ref=refs/tags/v<package-version>`

   This validates the release tag, tests, build check, and package payload
   without publishing.

5. Run a local dry run:

   ```bash
   npm publish --dry-run --access public
   ```

6. If the package still does not exist and npm authentication is ready, publish
   the first version locally:

   ```bash
   npm publish --access public
   ```

7. Create a GitHub Release for the tag.

8. Configure trusted publishing for future releases through npm package settings
   or npm CLI:

   ```bash
   npm install -g "npm@^11.10.0"
   npm trust github env-mapper-mcp --repo obmakesomething/env-mapper-mcp --file publish.yml
   ```

9. Verify the package:

   ```bash
   npm view env-mapper-mcp version
   ```

## Trusted-Publishing Release Flow

Future releases should use the GitHub workflow instead of a local publish:

1. Create and push a reviewed release tag.
2. Run the `Publish npm package` workflow with `dry_run=true` on the tag ref.
3. Re-run with `dry_run=false` on the same `refs/tags/v<package-version>` ref.
4. Verify package provenance:

   ```bash
   npm audit signatures
   ```

## Rollback Note

Do not rely on unpublish as a rollback strategy. npm package names and published
versions become part of the public ecosystem quickly. If a bad version is
published, prefer a fast patch release and document the affected version in the
GitHub Release notes.
