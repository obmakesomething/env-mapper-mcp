# npm Publishing

Env Mapper MCP is prepared for npm distribution, but the first publish is a
human gate. Publishing creates an irreversible package/version record on the
registry, so do not run the publish step until the maintainer has confirmed the
package name, npm account, trusted publisher settings, and release tag.

## Package Name

Candidate package:

```bash
env-mapper-mcp
```

As of 2026-05-07, `npm view env-mapper-mcp version` returns `E404`, so there is
no public package by this name visible from this machine. Re-check immediately
before the first publish.

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

Use npm trusted publishing instead of a long-lived automation token when
possible. Configure the npm package trusted publisher to match:

- provider: GitHub Actions
- owner: `obmakesomething`
- repository: `env-mapper-mcp`
- workflow filename: `publish.yml`
- environment: none, unless a future release adds one intentionally

The workflow is manual and dry-run by default. It requests `id-token: write` so
npm can use OIDC when `dry_run` is set to `false`.

Current npm trusted publishing requirements checked on 2026-05-07:

- npm CLI `11.5.1` or newer
- Node.js `22.14.0` or newer
- GitHub-hosted runners for GitHub Actions trusted publishing
- public repository and public package for automatic provenance

References checked on 2026-05-07:

- <https://docs.npmjs.com/trusted-publishers>
- <https://docs.npmjs.com/cli/v11/configuring-npm/package-json>

## Manual Publish Flow

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

3. Create a GitHub Release for the tag.

4. Open the `Publish npm package` workflow manually.

5. Run once with `dry_run=true`. The default `release_ref=refs/heads/main`
   is enough for a workflow smoke test; use the release tag ref for a final
   pre-publish dry run.

6. After the dry run passes and npm trusted publisher settings are confirmed,
   run again with:

   - `dry_run=false`
   - `release_ref=refs/tags/v<package-version>`

7. Verify the package and provenance:

   ```bash
   npm view env-mapper-mcp version
   npm audit signatures
   ```

## Rollback Note

Do not rely on unpublish as a rollback strategy. npm package names and published
versions become part of the public ecosystem quickly. If a bad version is
published, prefer a fast patch release and document the affected version in the
GitHub Release notes.
