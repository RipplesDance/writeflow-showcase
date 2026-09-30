/* 模块说明：统一处理小型 JSON 请求和稳定的 API 响应，避免各路由重复解析逻辑。 */

// 把可公开的业务结果包装成不缓存的 JSON 响应。
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* 限制请求体的实际字节数；Content-Length 不可信，因此在读取流时再次检查。 */
export async function readJson(request, maxBytes = 4096) {
  const reader = request.body?.getReader();
  if (!reader) return { error: "INVALID_JSON" };
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { error: "BODY_TOO_LARGE" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { error: "INVALID_JSON" };
    }
    return { value };
  } catch {
    return { error: "INVALID_JSON" };
  } finally {
    reader.releaseLock();
  }
}

// 没有 D1 绑定时返回稳定错误码，避免进入业务查询后抛错。
export function dbUnavailable(env) {
  return env?.DB ? null : json({ error: "DB_NOT_BOUND" }, 500);
}
