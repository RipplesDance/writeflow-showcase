/* 模块说明：章节输入验证与用户归属查询，供 CRUD 和生成接口共用。 */

// 收窄可存储的章节字段，拒绝非字符串和超长内容。
export function normalizeChapter(value) {
  if (typeof value?.title !== "string" || typeof value?.premise !== "string") return null;
  const title = value.title.trim();
  const premise = value.premise.trim();
  if (!title || title.length > 80 || !premise || premise.length > 500) return null;
  return { title, premise };
}

// 动态路由参数必须是 UUID 形状，避免任意长度输入进入查询。
export function validId(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

/* 查询同时限定 user_id；拥有其他账号的章节 ID 也不会泄露内容。 */
export async function findOwnedChapter(db, userId, chapterId) {
  if (!validId(chapterId)) return null;
  return db.prepare(
    "SELECT id, title, premise, created_at, updated_at FROM chapters WHERE id = ? AND user_id = ?",
  ).bind(chapterId, userId).first();
}
