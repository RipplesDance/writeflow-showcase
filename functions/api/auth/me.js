/* 模块说明：用 Bearer 会话恢复浏览器中的演示身份。 */
import { getSession } from "../../lib/auth.js";
import { dbUnavailable, json } from "../../lib/http.js";

export async function onRequestGet({ request, env }) {
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);
    return json({ user: { id: session.id, handle: session.handle } });
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }
}
