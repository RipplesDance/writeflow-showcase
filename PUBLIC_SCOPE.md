# Public scope and provenance

This directory is an independent portfolio edition, not a clone or filtered history of the private WriteFlow repository. Its Git repository was initialized with an empty, separate history. The public API names and small schema belong to this demo only.

| Public file | Relationship to private project |
| --- | --- |
| `functions/lib/output-sanitizer.js` | Production stream filter logic copied, with a file-level explanatory comment. |
| `workers/queue-task.js` | Production ACK/retry wrapper copied, with a file-level explanatory comment. |
| `functions/lib/provider-fallback.js` | Small adaptation of the production router's “fallback before committed output” rule; excludes real provider catalog and credentials. |
| `functions/lib/auth.js`, `functions/api/auth/*` | Purpose-built demo account/session implementation; excludes production email, verification and account lifecycle. |
| `functions/api/chapters/*`, `functions/api/history.js`, `functions/api/generate.js` | Purpose-built, reduced full-stack journey; SQL ownership and stream completion constraints follow the product's design. |
| `functions/lib/demo-provider.js` | Synthetic output only; no LLM request or proprietary prompt. |
| `workers/background.js`, `functions/lib/history-audit.js` | Reduced, independently tested example of the product's queued background processing pattern. |

Excluded from this repository: production prompt configuration, tag library, model routing catalog, secrets and aliases, real user records, D1 backups and migration history, payment code, email templates, admin internals, RAG embeddings and Vectorize configuration, private Git history, and production deployment settings.

The optional Queue consumer is not required to run the browser demo. A deployed showcase would need a newly provisioned D1 database, a separate queue, explicit abuse controls and independent security review; it must never reuse production bindings.
