/* 模块说明：鉴权、章节归属、模拟模型回退、流式输出及最终历史保存的完整 API 路径。 */
import { getSession } from "../lib/auth.js";
import { findOwnedChapter, validId } from "../lib/chapters.js";
import { createDemoRoutes } from "../lib/demo-provider.js";
import { dbUnavailable, json, readJson } from "../lib/http.js";
import { createReasoningTextFilter } from "../lib/output-sanitizer.js";
import { streamWithFallback } from "../lib/provider-fallback.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const unavailable = dbUnavailable(env);
  if (unavailable) return unavailable;
  const parsed = await readJson(request, 2048);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const { chapterId, seed, language, simulateFallback } = parsed.value;
  if (!validId(chapterId) || typeof seed !== "string" || !seed.trim() || seed.length > 600 ||
      !["en", "zh"].includes(language) || typeof simulateFallback !== "boolean") {
    return json({ error: "INVALID_FIELDS" }, 400);
  }

  let session;
  let chapter;
  try {
    session = await getSession(request, env.DB);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);
    chapter = await findOwnedChapter(env.DB, session.id, chapterId);
    if (!chapter) return json({ error: "NOT_FOUND" }, 404);
  } catch {
    return json({ error: "DB_ERROR" }, 500);
  }

  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  request.signal.addEventListener("abort", onRequestAbort, { once: true });
  const encoder = new TextEncoder();
  let closed = false;

  /* 先把数据写入 SSE，再在完整成功后归档；取消或中途失败不留下残缺历史。 */
  const stream = new ReadableStream({
    async start(controller) {
      function send(event, data) {
        if (closed || abort.signal.aborted) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      const filter = createReasoningTextFilter();
      let output = "";
      try {
        send("start", { chapterId });
        const route = await streamWithFallback(
          createDemoRoutes(chapter, seed.trim(), language, simulateFallback),
          {
            signal: abort.signal,
            onRoute: (name) => send("route", { name }),
            onChunk: (chunk) => {
              const visible = filter.push(chunk);
              if (!visible) return;
              output += visible;
              send("delta", { text: visible });
            },
          },
        );
        const tail = filter.flush();
        if (tail) {
          output += tail;
          send("delta", { text: tail });
        }
        if (abort.signal.aborted) return;
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO generation_history
            (id, user_id, chapter_id, input, output, provider_route, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(id, session.id, chapterId, seed.trim(), output, route, new Date().toISOString()).run();
        await env.DB.prepare(
          `DELETE FROM generation_history
            WHERE user_id = ? AND id NOT IN
              (SELECT id FROM generation_history WHERE user_id = ?
                ORDER BY created_at DESC, rowid DESC LIMIT 25)`,
        ).bind(session.id, session.id).run();
        if (env.BACKGROUND_QUEUE && typeof context.waitUntil === "function") {
          /* 后台派生统计不阻塞最终输出，也不影响已保存的正文。 */
          context.waitUntil(env.BACKGROUND_QUEUE.send({
            type: "generation_completed", userId: session.id, historyId: id,
          }).catch(() => console.warn("showcase_background_queue_send_failed")));
        }
        send("complete", { historyId: id, route });
      } catch {
        if (!abort.signal.aborted) send("error", { error: "GENERATION_FAILED" });
      } finally {
        request.signal.removeEventListener("abort", onRequestAbort);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
      request.signal.removeEventListener("abort", onRequestAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
