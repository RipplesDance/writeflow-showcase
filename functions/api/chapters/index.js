/* 模块说明：列出和创建当前演示账号的章节，限制每个账号的存储规模。 */
import { getSession } from "../../lib/auth.js";
import { normalizeChapter } from "../../lib/chapters.js";
import { dbUnavailable, json, readJson } from "../../lib/http.js";

export async function onRequestGet({ request, env }) {
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);
    const rows = await env.DB.prepare(
      "SELECT id, title, premise, created_at, updated_at FROM chapters WHERE user_id = ? ORDER BY created_at DESC LIMIT 12",
    ).bind(session.id).all();
    return json({ chapters: rows.results || [] });
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  const parsed = await readJson(request, 2048);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const chapter = normalizeChapter(parsed.value);
  if (!chapter) return json({ error: "INVALID_FIELDS" }, 400);
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    /* 同一条 INSERT 检查章节上限，避免先计数后写入的常见竞态。 */
    const result = await env.DB.prepare(
      `INSERT INTO chapters (id, user_id, title, premise, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM chapters WHERE user_id = ?) < 12`,
    ).bind(id, session.id, chapter.title, chapter.premise, now, now, session.id).run();
    if (Number(result.meta?.changes || 0) === 0) {
      return json({ error: "CHAPTER_LIMIT" }, 409);
    }
    return json({ chapter: { id, ...chapter, created_at: now, updated_at: now } }, 201);
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }
}
