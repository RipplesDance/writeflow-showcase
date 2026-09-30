/* 模块说明：更新或删除单个归属当前用户的章节，删除时由外键清理历史。 */
import { getSession } from "../../lib/auth.js";
import { normalizeChapter, validId } from "../../lib/chapters.js";
import { dbUnavailable, json, readJson } from "../../lib/http.js";

export async function onRequestPut({ request, env, params }) {
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  if (!validId(params.id)) return json({ error: "NOT_FOUND" }, 404);
  const parsed = await readJson(request, 2048);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const chapter = normalizeChapter(parsed.value);
  if (!chapter) return json({ error: "INVALID_FIELDS" }, 400);
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);
    const updatedAt = new Date().toISOString();
    const result = await env.DB.prepare(
      "UPDATE chapters SET title = ?, premise = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).bind(chapter.title, chapter.premise, updatedAt, params.id, session.id).run();
    if (Number(result.meta?.changes || 0) === 0) return json({ error: "NOT_FOUND" }, 404);
    return json({ chapter: { id: params.id, ...chapter, updated_at: updatedAt } });
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  if (!validId(params.id)) return json({ error: "NOT_FOUND" }, 404);
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);
    const result = await env.DB.prepare(
      "DELETE FROM chapters WHERE id = ? AND user_id = ?",
    ).bind(params.id, session.id).run();
    if (Number(result.meta?.changes || 0) === 0) return json({ error: "NOT_FOUND" }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }
}
