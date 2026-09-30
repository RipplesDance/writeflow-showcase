/* 模块说明：注销当前演示会话，其他设备的会话不受影响。 */
import { getSession, revokeSession } from "../../lib/auth.js";
import { dbUnavailable, json } from "../../lib/http.js";

export async function onRequestPost({ request, env }) {
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);
    await revokeSession(env.DB, session.token_hash);
    return json({ ok: true });
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }
}
