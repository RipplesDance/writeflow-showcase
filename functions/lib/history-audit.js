/* 模块说明：队列消费者为完整历史计算可重试的派生数据，不读取其他用户记录。 */

export async function processHistoryAudit(db, job) {
  if (!db || job?.type !== "generation_completed" ||
      typeof job.userId !== "string" || typeof job.historyId !== "string") {
    return false;
  }
  const row = await db.prepare(
    "SELECT id, user_id, output FROM generation_history WHERE id = ? AND user_id = ?",
  ).bind(job.historyId, job.userId).first();
  if (!row) return false;
  /* INSERT OR IGNORE 让重复投递无副作用，原始历史行删除后由外键清理统计。 */
  await db.prepare(
    `INSERT OR IGNORE INTO generation_stats
      (history_id, user_id, character_count, processed_at) VALUES (?, ?, ?, ?)`,
  ).bind(row.id, row.user_id, [...row.output].length, new Date().toISOString()).run();
  return true;
}
