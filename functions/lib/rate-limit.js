/* 模块说明：按 Cloudflare 提供的客户端 IP 和固定时间窗限制演示版认证请求。 */

const WINDOW_MS = 10 * 60 * 1000;

/* 单条 UPSERT 原子递增，避免并发登录请求分别读到相同旧计数。 */
export async function consumeAuthLimit(db, request, kind, limit) {
  const ip = (request.headers.get("CF-Connecting-IP") || "local").slice(0, 80);
  const scope = `${kind}:${ip}`;
  const windowStart = Math.floor(Date.now() / WINDOW_MS);
  await db.prepare(
    `INSERT INTO auth_rate_limits (scope, window_start, attempts) VALUES (?, ?, 1)
     ON CONFLICT(scope, window_start) DO UPDATE SET attempts = attempts + 1`,
  ).bind(scope, windowStart).run();
  const row = await db.prepare(
    "SELECT attempts FROM auth_rate_limits WHERE scope = ? AND window_start = ?",
  ).bind(scope, windowStart).first();
  return Number(row?.attempts || 0) <= limit;
}
