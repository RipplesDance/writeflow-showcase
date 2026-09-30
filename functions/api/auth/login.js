/* 模块说明：验证演示账号并创建七天会话；错误响应不泄露账号是否存在。 */
import { createSession, validHandle, validPassword, verifyPassword } from "../../lib/auth.js";
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
    return json({ error: "INVALID_CREDENTIALS" }, 401);
  }
  try {
    if (!(await consumeAuthLimit(env.DB, request, "login", 8))) {
      return json({ error: "RATE_LIMITED" }, 429);
    }
    const user = await env.DB.prepare(
      "SELECT id, handle, password_salt, password_hash FROM users WHERE handle = ?",
    ).bind(handle).first();
    if (!(await verifyPassword(password, user))) {
      return json({ error: "INVALID_CREDENTIALS" }, 401);
    }
    const token = await createSession(env.DB, user.id);
    return json({ token, user: { id: user.id, handle: user.handle } });
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }
}
