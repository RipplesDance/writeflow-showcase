/* 模块说明：独立的 Cloudflare Queue 消费者示例；重复消息由数据库唯一键保证幂等。 */
import { processHistoryAudit } from "../functions/lib/history-audit.js";
import { runQueueTask } from "./queue-task.js";

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      if (message.body?.type !== "generation_completed") {
        message.ack();
        continue;
      }
      await runQueueTask(message, () => processHistoryAudit(env.DB, message.body));
    }
  },
};
