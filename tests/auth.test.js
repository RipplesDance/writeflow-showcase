/* 模块说明：认证正常路径、错误边界、会话失效和限流的接口测试。 */
import assert from "node:assert/strict";
import test from "node:test";
import { onRequestPost as register } from "../functions/api/auth/register.js";
import { onRequestPost as login } from "../functions/api/auth/login.js";
import { onRequestGet as me } from "../functions/api/auth/me.js";
import { onRequestPost as logout } from "../functions/api/auth/logout.js";
import { createTestDatabase, request } from "./helpers/d1.js";

test("register → session lookup → logout removes access", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const created = await register({
    request: request("/api/auth/register", "POST", "", { handle: "Alice_1", password: "correct-horse-42" }),
    env: db,
  });
  assert.equal(created.status, 201);
  const { token, user } = await created.json();
  assert.equal(user.handle, "alice_1");
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?").get(token).count, 0);

  const profile = await me({ request: request("/api/auth/me", "GET", token), env: db });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.id, user.id);

  const removed = await logout({ request: request("/api/auth/logout", "POST", token), env: db });
  assert.equal(removed.status, 200);
  assert.equal((await me({ request: request("/api/auth/me", "GET", token), env: db })).status, 401);
});

test("login uses one error for unknown and wrong passwords; duplicate handles are rejected", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const body = { handle: "writer_2", password: "a-long-password" };
  assert.equal((await register({ request: request("/api/auth/register", "POST", "", body), env: db })).status, 201);
  const duplicate = await register({ request: request("/api/auth/register", "POST", "", body), env: db });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, "HANDLE_TAKEN");

  for (const candidate of [
    { handle: "writer_2", password: "not-the-password" },
    { handle: "missing_2", password: "not-the-password" },
  ]) {
    const response = await login({ request: request("/api/auth/login", "POST", "", candidate), env: db });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "INVALID_CREDENTIALS");
  }
  assert.equal((await login({ request: request("/api/auth/login", "POST", "", body), env: db })).status, 200);
});

test("expired session and invalid request body cannot authenticate", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const response = await register({
    request: request("/api/auth/register", "POST", "", { handle: "writer_3", password: "a-long-password" }),
    env: db,
  });
  const { token } = await response.json();
  db.sqlite.prepare("UPDATE sessions SET expires_at = ?").run("2000-01-01T00:00:00.000Z");
  assert.equal((await me({ request: request("/api/auth/me", "GET", token), env: db })).status, 401);

  const invalid = await register({
    request: request("/api/auth/register", "POST", "", { handle: "x", password: "short" }),
    env: db,
  });
  assert.equal(invalid.status, 400);
  const oversized = await register({
    request: request("/api/auth/register", "POST", "", { handle: "validname", password: "x".repeat(3000) }),
    env: db,
  });
  assert.equal((await oversized.json()).error, "BODY_TOO_LARGE");
});

test("repeated login requests reach the fixed-window limit", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await login({
      request: request("/api/auth/login", "POST", "", { handle: "nobody", password: "a-long-password" }),
      env: db,
    });
    assert.equal(response.status, 401);
  }
  const limited = await login({
    request: request("/api/auth/login", "POST", "", { handle: "nobody", password: "a-long-password" }),
    env: db,
  });
  assert.equal(limited.status, 429);
});
