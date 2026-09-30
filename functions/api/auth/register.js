/* 模块说明：创建不收集邮箱的演示账号，并在注册成功后签发独立会话。 */
import { createSession, preparePassword, validHandle, validPassword } from "../../lib/auth.js";
import { dbUnavailable, json, readJson } from "../../lib/http.js";
import { consumeAuthLimit } from "../../lib/rate-limit.js";

export async function onRequestPost({ request, env }) {
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  const parsed = await readJson(request, 2048);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const handle = String(parsed.value.handle || "").trim().toLowerCase();
  const password = parsed.value.password;
  if (!validHandle(handle) || !validPassword(password)) {
    return json({ error: "INVALID_FIELDS" }, 400);
  }
  try {
    if (!(await consumeAuthLimit(env.DB, request, "register", 10))) {
      return json({ error: "RATE_LIMITED" }, 429);
    }
    const { salt, hash } = await preparePassword(password);
    const userId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, handle, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(userId, handle, salt, hash, new Date().toISOString()).run();
    const token = await createSession(env.DB, userId);
    return json({ token, user: { id: userId, handle } }, 201);
  } catch (error) {
    if (/UNIQUE constraint/i.test(String(error?.message || ""))) {
      return json({ error: "HANDLE_TAKEN" }, 409);
    }
    return json({ error: "DB_ERROR" }, 500);
  }
}
