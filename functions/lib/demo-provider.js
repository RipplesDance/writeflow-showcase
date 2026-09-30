/* 模块说明：确定性的本地模拟模型；不调用外部 API，也不包含生产提示词。 */
import { ProviderFailure } from "./provider-fallback.js";

// 合成可重复的短文本，供浏览器展示和端到端测试使用。
function demoText(chapter, seed, language) {
  if (language === "zh") {
    return `《${chapter.title}》的下一幕从一个未解的选择开始。${seed} 主角在熟悉的场景里发现一处细微变化，决定先确认线索，再采取行动。这个决定将下一章的冲突推向更清晰的方向。`;
  }
  return `The next scene of “${chapter.title}” begins with an unresolved choice. ${seed} The protagonist notices a small change in a familiar place, checks the evidence, and then acts. That decision gives the next chapter a clearer conflict.`;
}

// 在相邻 chunk 间留出短暂间隔，让本地演示能看到流式更新与取消。
async function pause(signal) {
  await new Promise((resolve) => setTimeout(resolve, 45));
  if (signal?.aborted) throw new ProviderFailure("ABORTED", false);
}

/* 把推理标签故意拆到不同 chunk，用于验证服务端过滤与浏览器流式读取。 */
async function* openDemoStream(chapter, seed, language, signal) {
  const prose = demoText(chapter, seed, language);
  const chunks = ["<thi", "nk>demo-only private planning</th", "ink>"];
  for (let index = 0; index < prose.length; index += 32) {
    chunks.push(prose.slice(index, index + 32));
  }
  for (const chunk of chunks) {
    await pause(signal);
    yield chunk;
  }
}

export function createDemoRoutes(chapter, seed, language, simulateFallback) {
  return [
    {
      name: "demo-primary",
      open(signal) {
        if (simulateFallback) throw new ProviderFailure("DEMO_UPSTREAM_UNAVAILABLE", true);
        return openDemoStream(chapter, seed, language, signal);
      },
    },
    {
      name: "demo-backup",
      open(signal) {
        return openDemoStream(chapter, seed, language, signal);
      },
    },
  ];
}
