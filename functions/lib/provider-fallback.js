/* 模块说明：展示生产模型派发的一条关键约束：只有首个正文 chunk 之前才允许换路。 */

export class ProviderFailure extends Error {
  constructor(code, retryable = true) {
    super(code);
    this.name = "ProviderFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

// 将取消统一成不可重试错误，防止转入备路。
function abortFailure() {
  return new ProviderFailure("ABORTED", false);
}

/* 每个 route 提供异步 chunk 流；一旦有正文交给调用者，后续错误必须原样结束，不能拼接备路正文。 */
export async function streamWithFallback(routes, { signal, onRoute, onChunk }) {
  if (!Array.isArray(routes) || routes.length === 0 || routes.length > 3) {
    throw new ProviderFailure("NO_ROUTE", false);
  }
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    let committed = false;
    try {
      if (signal?.aborted) throw abortFailure();
      const stream = await route.open(signal);
      for await (const chunk of stream) {
        if (signal?.aborted) throw abortFailure();
        if (!committed) {
          committed = true;
          await onRoute?.(route.name);
        }
        await onChunk(String(chunk), route.name);
      }
      if (!committed) throw new ProviderFailure("EMPTY_PROVIDER_STREAM", true);
      return route.name;
    } catch (error) {
      if (signal?.aborted) throw abortFailure();
      if (committed || error?.retryable !== true || index === routes.length - 1) {
        throw error;
      }
    }
  }
  throw new ProviderFailure("NO_ROUTE", false);
}
