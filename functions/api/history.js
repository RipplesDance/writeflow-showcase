/* 模块说明：读取当前用户、可选指定章节的最终生成历史。 */
import { getSession } from "../lib/auth.js";
import { validId } from "../lib/chapters.js";
import { dbUnavailable, json } from "../lib/http.js";

export async function onRequestGet({ request, env }) {
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  const chapterId = new URL(request.url).searchParams.get("chapterId");
  if (chapterId && !validId(chapterId)) return json({ error: "INVALID_FIELDS" }, 400);
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);
    const statement = chapterId
      ? env.DB.prepare(
          `SELECT id, chapter_id, input, output, provider_route, created_at
             FROM generation_history
            WHERE user_id = ? AND chapter_id = ? ORDER BY created_at DESC LIMIT 25`,
        ).bind(session.id, chapterId)
      : env.DB.prepare(
          `SELECT id, chapter_id, input, output, provider_route, created_at
             FROM generation_history
            WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`,
        ).bind(session.id);
    const rows = await statement.all();
    return json({ history: rows.results || [] });
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }
}
