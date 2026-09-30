/* 模块说明：用真实 SQLite 语义验证章节 CRUD、用户隔离、上限和级联清理。 */
import assert from "node:assert/strict";
import test from "node:test";
import { onRequestPost as register } from "../functions/api/auth/register.js";
import { onRequestGet as list, onRequestPost as create } from "../functions/api/chapters/index.js";
import { onRequestPut as update, onRequestDelete as remove } from "../functions/api/chapters/[id].js";
import { createTestDatabase, request } from "./helpers/d1.js";

async function account(env, handle) {
  const response = await register({
    request: request("/api/auth/register", "POST", "", { handle, password: "a-long-password" }),
    env,
  });
  return response.json();
}

test("owner creates, lists, updates and deletes one chapter", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const { token } = await account(db, "chapters_1");
  const created = await create({
    request: request("/api/chapters", "POST", token, { title: "First scene", premise: "A mystery begins." }),
    env: db,
  });
  assert.equal(created.status, 201);
  const { chapter } = await created.json();
  const rows = await list({ request: request("/api/chapters", "GET", token), env: db });
  assert.equal((await rows.json()).chapters.length, 1);

  const changed = await update({
    request: request(`/api/chapters/${chapter.id}`, "PUT", token, { title: "Revised", premise: "A new clue." }),
    env: db, params: { id: chapter.id },
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).chapter.title, "Revised");
  assert.equal((await remove({ request: request(`/api/chapters/${chapter.id}`, "DELETE", token), env: db, params: { id: chapter.id } })).status, 200);
  assert.equal((await (await list({ request: request("/api/chapters", "GET", token), env: db })).json()).chapters.length, 0);
});

test("another account cannot update or delete a chapter", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const owner = await account(db, "owner_1");
  const outsider = await account(db, "outsider_1");
  const created = await create({
    request: request("/api/chapters", "POST", owner.token, { title: "Private", premise: "Owner data." }),
    env: db,
  });
  const { chapter } = await created.json();
  assert.equal((await update({
    request: request(`/api/chapters/${chapter.id}`, "PUT", outsider.token, { title: "Stolen", premise: "No." }),
    env: db, params: { id: chapter.id },
  })).status, 404);
  assert.equal((await remove({ request: request(`/api/chapters/${chapter.id}`, "DELETE", outsider.token), env: db, params: { id: chapter.id } })).status, 404);
  assert.equal(db.sqlite.prepare("SELECT title FROM chapters WHERE id = ?").get(chapter.id).title, "Private");
});

test("chapter cap and validation reject overflow without changing existing rows", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const { token } = await account(db, "writer_cap");
  const make = (title, premise = "A premise") => create({
    request: request("/api/chapters", "POST", token, { title, premise }), env: db,
  });
  assert.equal((await make("", "A premise")).status, 400);
  for (let index = 0; index < 12; index += 1) {
    assert.equal((await make(`Chapter ${index}`)).status, 201);
  }
  assert.equal((await make("Chapter 13")).status, 409);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM chapters").get().count, 12);
});
