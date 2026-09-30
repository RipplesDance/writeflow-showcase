/* 模块说明：对已启动的本地 Pages 服务发出真实 HTTP 请求，验证前后端 API 与 D1 绑定。 */
import assert from "node:assert/strict";

const base = process.env.SHOWCASE_BASE_URL || "http://127.0.0.1:8791";
const handle = `smoke_${crypto.randomUUID().slice(0, 8)}`;
const password = "synthetic-test-password";

async function api(path, method = "GET", token = "", body = undefined) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

const page = await fetch(base);
assert.equal(page.status, 200);
assert.match(await page.text(), /WriteFlow/);

const registered = await api("/api/auth/register", "POST", "", { handle, password });
const token = registered.token;
assert.equal((await api("/api/auth/me", "GET", token)).user.handle, handle);

const created = await api("/api/chapters", "POST", token, {
  title: "Synthetic chapter", premise: "A local smoke test with invented data.",
});
const chapterId = created.chapter.id;
const response = await fetch(new URL("/api/generate", base), {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ chapterId, seed: "A test visitor enters.", language: "en", simulateFallback: true }),
});
assert.equal(response.status, 200);
const stream = await response.text();
assert.match(stream, /event: delta/);
assert.match(stream, /"route":"demo-backup"/);
assert.doesNotMatch(stream, /private planning|<think>/);

const records = await api(`/api/history?chapterId=${chapterId}`, "GET", token);
assert.equal(records.history.length, 1);
assert.equal(records.history[0].provider_route, "demo-backup");
await api(`/api/chapters/${chapterId}`, "DELETE", token);
assert.equal((await api("/api/history", "GET", token)).history.length, 0);

process.stdout.write("Local Pages + D1 smoke passed: auth, chapter CRUD, SSE fallback, history, cascade delete.\n");
