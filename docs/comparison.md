# Comparison

Env Mapper is an AI-safe Environment Config Audit tool. It produces redacted
evidence about environment variable names, declarations, source locations,
classifications, and review questions. It is not a leaked-secret detector or a
secret manager.

| Tool | Primary role | Env Mapper relationship |
| --- | --- | --- |
| Gitleaks | Detect leaked secret values in Git and files | Complements it by auditing env config usage and declarations without value detection |
| TruffleHog | Detect and verify leaked credentials | Complements it by mapping names and locations for review, not by verifying credentials |
| GitHub secret scanning | Platform alerting for leaked secrets | Complements it with pull request env drift summaries and redacted audit packets |
| Doppler | Secret storage, sync, and runtime injection | Produces dry-run provider plans; Doppler owns live secret operations |
| Infisical | Secret management and access control | Produces dry-run provider plans; Infisical owns live secret operations |
| DMNO | Typed environment schema and validation | Drafts schema candidates from repository evidence |
| dotenv-linter | `.env` formatting and consistency checks | Looks across code, CI, docs, and env templates for config audit evidence |

## Boundary

Use Env Mapper when the question is:

- Which env names are used, declared, missing, or likely stale?
- Which files and lines provide evidence?
- What should a human review before creating a schema or secret-store sync?
- What redacted context can an AI assistant safely inspect?

Use a secret scanner when the question is:

- Did a token, password, private key, or credential value leak?
- Can this value be verified with a provider?
- Should this leaked credential be revoked?

Use a secret manager when the question is:

- Where should the real value be stored?
- Who can access it?
- How does it get injected into runtime?
