# WriteFlow — Engineering Showcase

WriteFlow is a fiction-writing app. This repo contains a small demo with login, chapter editing, streamed generation and saved history.

The frontend uses plain HTML, CSS and JavaScript. Cloudflare Pages Functions handle the API requests, and D1 stores accounts, chapters and generation history.

Generation uses template-based sample text, so you can run the demo without an AI API key. Select “Simulate primary provider failure” to try the backup route. The UI defaults to English; you can switch to Chinese, and the browser remembers your choice. The sample output follows the selected language.

## Run locally

Use Node.js 24 and npm. There is no frontend build step.

```bash
npm ci
npx wrangler d1 execute writeflow-showcase-local --local --file=db/schema.sql
npm run dev
```

Open <http://127.0.0.1:8791>. Create a demo account with a made-up handle and password, add a chapter, enter a story beat and generate. You can stop the stream or revisit completed results in the history panel.

The database ID in `wrangler.jsonc` is a local development placeholder. To deploy this demo, create a separate D1 database and update the binding.

## Request flow

```text
frontend/app.js
  → /api/auth/register or /api/auth/login → D1 users + hashed sessions
  → /api/chapters → D1 chapters, always scoped by user ID
  → /api/generate → demo provider routing → SSE chunks → browser output
  → D1 generation_history only after completion
  → /api/history → current user's saved output

With an optional Queue binding:
  completed history → BACKGROUND_QUEUE → workers/background.js
                    → idempotent generation_stats row
```

The local app runs without a Queue. The consumer example is in `workers/background.js`, with tests in `tests/queue.test.js`.

## Implementation notes

- Passwords use PBKDF2, and D1 stores session token hashes rather than the tokens sent to the browser. `tests/auth.test.js` covers login, session expiry and logout.
- A provider can fail before or during streaming. `functions/lib/provider-fallback.js` allows a backup only before the first chunk; a later failure ends the stream. `tests/provider-fallback.test.js` covers both cases and cancellation.
- A `<think>` tag can be split across chunks. `functions/lib/output-sanitizer.js` keeps partial tag prefixes between reads so reasoning text does not reach the output. The filter tests are in `tests/provider-fallback.test.js`.
- Chapter and history queries include the signed-in user's ID. `tests/chapters.test.js` and `tests/generate.test.js` check that another account cannot access those records.
- The generation route saves history after the provider finishes. Cancelling during streaming leaves no history row, while text already received stays visible. `tests/generate.test.js` checks this behaviour.
- Queue messages can arrive more than once. The consumer uses a unique history key to avoid duplicate statistics, acknowledges successful work and retries database failures. `tests/queue.test.js` covers duplicate delivery and failure handling.

## Tests

```bash
npm run test:all
npm run smoke
```

The tests use Node's test runner and an in-memory SQLite database. CI runs these tests and builds the Pages Functions.

Run the smoke script while the local Pages server is running. It creates a test account and chapter, checks auth, streaming, fallback and history over HTTP, then deletes the chapter.

## About this version

The reasoning filter and Queue ACK/retry helper come from the main WriteFlow app. The UI, auth, chapter and generation routes are smaller implementations written for this demo.

Production prompts, real provider configuration, user data, billing, email workflows and RAG code are not included. This repo is shared for review and interviews; no licence file is included.
