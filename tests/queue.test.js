/* 模块说明：验证可选 Queue 消费者的 ACK、失败重试、幂等和用户归属。 */
import assert from "node:assert/strict";
import test from "node:test";
import { onRequestPost as register } from "../functions/api/auth/register.js";
import { onRequestPost as createChapter } from "../functions/api/chapters/index.js";
import { onRequestPost as generate } from "../functions/api/generate.js";
import background from "../workers/background.js";
import { processHistoryAudit } from "../functions/lib/history-audit.js";
import { createTestDatabase, request } from "./helpers/d1.js";

function addFixture(db) {
  const userId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const historyId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.sqlite.prepare(
    "INSERT INTO users (id, handle, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(userId, "queue_fixture", "0".repeat(32), "0".repeat(64), now);
  db.sqlite.prepare(
    "INSERT INTO chapters (id, user_id, title, premise, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(chapterId, userId, "Queue", "A synthetic fixture.", now, now);
  db.sqlite.prepare(
    `INSERT INTO generation_history
      (id, user_id, chapter_id, input, output, provider_route, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(historyId, userId, chapterId, "Synthetic", "Four", "demo-primary", now);
  return { userId, historyId };
}

function message(body) {
  return {
    body,
    acknowledged: 0,
    retried: 0,
    ack() { this.acknowledged += 1; },
    retry() { this.retried += 1; },
  };
}

test("duplicate delivery inserts only one derived row and acknowledges each message", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const fixture = addFixture(db);
  const first = message({ type: "generation_completed", ...fixture });
  const second = message({ type: "generation_completed", ...fixture });
  await background.queue({ messages: [first, second] }, db);
  assert.equal(first.acknowledged, 1);
  assert.equal(second.acknowledged, 1);
  assert.equal(first.retried + second.retried, 0);
  const row = db.sqlite.prepare("SELECT character_count FROM generation_stats").get();
  assert.equal(row.character_count, 4);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_stats").get().count, 1);
});

test("wrong owner is ignored and an unknown message is acknowledged", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const fixture = addFixture(db);
  assert.equal(await processHistoryAudit(db.DB, {
    type: "generation_completed", userId: crypto.randomUUID(), historyId: fixture.historyId,
  }), false);
  const unknown = message({ type: "other" });
  await background.queue({ messages: [unknown] }, db);
  assert.equal(unknown.acknowledged, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_stats").get().count, 0);
});

test("D1 failure requests a retry rather than acknowledging the message", async () => {
  const failed = message({ type: "generation_completed", userId: "u", historyId: "h" });
  await background.queue({ messages: [failed] }, {
    DB: { prepare() { throw new Error("transient D1 failure"); } },
  });
  assert.equal(failed.acknowledged, 0);
  assert.equal(failed.retried, 1);
});

test("completed generation enqueues identifiers only and the consumer derives one statistic", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const jobs = [];
  const waiting = [];
  const env = {
    DB: db.DB,
    BACKGROUND_QUEUE: { async send(job) { jobs.push(job); } },
  };
  const created = await register({
    request: request("/api/auth/register", "POST", "", { handle: "queued_writer", password: "a-long-password" }),
    env,
  });
  const { token } = await created.json();
  const chapterResponse = await createChapter({
    request: request("/api/chapters", "POST", token, { title: "Queued chapter", premise: "Synthetic." }),
    env,
  });
  const { chapter } = await chapterResponse.json();
  const response = await generate({
    request: request("/api/generate", "POST", token, {
      chapterId: chapter.id, seed: "A synthetic beat.", language: "en", simulateFallback: false,
    }),
    env,
    waitUntil(promise) { waiting.push(promise); },
  });
  assert.match(await response.text(), /event: complete/);
  await Promise.all(waiting);
  assert.equal(jobs.length, 1);
  assert.deepEqual(Object.keys(jobs[0]).sort(), ["historyId", "type", "userId"]);
  const delivered = message(jobs[0]);
  await background.queue({ messages: [delivered] }, env);
  assert.equal(delivered.acknowledged, 1);
  assert.ok(db.sqlite.prepare("SELECT character_count FROM generation_stats").get().character_count > 0);
});

test("queue send failure does not discard a completed stream or saved history", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const waiting = [];
  const env = {
    DB: db.DB,
    BACKGROUND_QUEUE: { async send() { throw new Error("queue temporarily unavailable"); } },
  };
  const created = await register({
    request: request("/api/auth/register", "POST", "", { handle: "queue_failure", password: "a-long-password" }),
    env,
  });
  const { token } = await created.json();
  const chapterResponse = await createChapter({
    request: request("/api/chapters", "POST", token, { title: "Queued chapter", premise: "Synthetic." }),
    env,
  });
  const { chapter } = await chapterResponse.json();
  const response = await generate({
    request: request("/api/generate", "POST", token, {
      chapterId: chapter.id, seed: "A synthetic beat.", language: "en", simulateFallback: false,
    }),
    env,
    waitUntil(promise) { waiting.push(promise); },
  });
  assert.match(await response.text(), /event: complete/);
  await Promise.all(waiting);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_history").get().count, 1);
});
