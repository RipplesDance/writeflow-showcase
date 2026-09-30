/* 模块说明：沿用生产系统的 Queue ACK/重试边界；只有任务成功后才确认消息。 */
export async function runQueueTask(message, task) {
  try {
    await task();
    message.ack();
    return true;
  } catch {
    message.retry();
    return false;
  }
}
