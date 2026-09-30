/* 模块说明：验证鉴权到 SSE 再到 D1 历史的完整生成路径及取消、越权边界。 */
import assert from "node:assert/strict";
import test from "node:test";
import { onRequestPost as register } from "../functions/api/auth/register.js";
import { onRequestPost as createChapter } from "../functions/api/chapters/index.js";
import { onRequestPost as generate } from "../functions/api/generate.js";
import { onRequestGet as history } from "../functions/api/history.js";
import { createTestDatabase, request } from "./helpers/d1.js";

async function account(env, handle) {
  const response = await register({
    request: request("/api/auth/register", "POST", "", { handle, password: "a-long-password" }),
    env,
  });
  return response.json();
}

async function chapter(env, token) {
  const response = await createChapter({
    request: request("/api/chapters", "POST", token, { title: "A new chapter", premise: "An unopened door." }),
    env,
  });
  return (await response.json()).chapter;
}

function events(text) {
  return text.trim().split("\n\n").map((frame) => {
    const type = /^event: (.+)$/m.exec(frame)?.[1];
    const body = /^data: (.+)$/m.exec(frame)?.[1];
    return { type, data: JSON.parse(body) };
  });
}

test("authenticated generation streams filtered text and archives the completed result", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const { token } = await account(db, "streamer_1");
  const item = await chapter(db, token);
  const response = await generate({
    request: request("/api/generate", "POST", token, {
      chapterId: item.id, seed: "A visitor arrives.", language: "en", simulateFallback: false,
    }),
    env: db,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/event-stream/);
  const frames = events(await response.text());
  assert.equal(frames[0].type, "start");
  assert.equal(frames.find((item) => item.type === "route").data.name, "demo-primary");
  assert.equal(frames.at(-1).type, "complete");
  const output = frames.filter((item) => item.type === "delta").map((item) => item.data.text).join("");
  assert.match(output, /visitor arrives/);
  assert.doesNotMatch(output, /<think>|private planning|<thi/);

  const saved = await history({
    request: request(`/api/history?chapterId=${item.id}`, "GET", token), env: db,
  });
  assert.equal(saved.status, 200);
  const rows = (await saved.json()).history;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].output, output);
  assert.equal(rows[0].provider_route, "demo-primary");
});

test("simulated upstream failure falls back before streaming and records the chosen route", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const { token } = await account(db, "streamer_2");
  const item = await chapter(db, token);
  const response = await generate({
    request: request("/api/generate", "POST", token, {
      chapterId: item.id, seed: "门外有人。", language: "zh", simulateFallback: true,
    }), env: db,
  });
  const frames = events(await response.text());
  assert.equal(frames.find((entry) => entry.type === "route").data.name, "demo-backup");
  assert.equal(frames.at(-1).data.route, "demo-backup");
  assert.equal(db.sqlite.prepare("SELECT provider_route FROM generation_history").get().provider_route, "demo-backup");
});

test("other users cannot generate from or read another user's chapter", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const owner = await account(db, "streamer_3");
  const outsider = await account(db, "streamer_4");
  const item = await chapter(db, owner.token);
  const denied = await generate({
    request: request("/api/generate", "POST", outsider.token, {
      chapterId: item.id, seed: "A story beat.", language: "en", simulateFallback: false,
    }), env: db,
  });
  assert.equal(denied.status, 404);
  assert.equal((await (await history({
    request: request(`/api/history?chapterId=${item.id}`, "GET", outsider.token), env: db,
  })).json()).history.length, 0);
  const unauthenticated = await generate({
    request: request("/api/generate", "POST", "", {
      chapterId: item.id, seed: "A story beat.", language: "en", simulateFallback: false,
    }), env: db,
  });
  assert.equal(unauthenticated.status, 401);
});

test("cancelling the stream before completion leaves no history record", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const { token } = await account(db, "streamer_5");
  const item = await chapter(db, token);
  const response = await generate({
    request: request("/api/generate", "POST", token, {
      chapterId: item.id, seed: "An interruption.", language: "en", simulateFallback: false,
    }), env: db,
  });
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_history").get().count, 0);
});

test("bad generation fields fail before the provider starts", async (t) => {
  const db = createTestDatabase();
  t.after(db.close);
  const { token } = await account(db, "streamer_6");
  const item = await chapter(db, token);
  const response = await generate({
    request: request("/api/generate", "POST", token, {
      chapterId: item.id, seed: "", language: "en", simulateFallback: false,
    }), env: db,
  });
  assert.equal(response.status, 400);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM generation_history").get().count, 0);
});
