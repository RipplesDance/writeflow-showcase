/* 模块说明：验证路由回退只发生在首个 chunk 之前，并尊重取消信号。 */
import assert from "node:assert/strict";
import test from "node:test";
import { ProviderFailure, streamWithFallback } from "../functions/lib/provider-fallback.js";
import { createReasoningTextFilter, stripReasoningArtifacts } from "../functions/lib/output-sanitizer.js";

test("retryable failure before output selects the backup route", async () => {
  const chunks = [];
  const names = [];
  const route = await streamWithFallback([
    { name: "primary", open: () => { throw new ProviderFailure("DOWN", true); } },
    { name: "backup", open: async function* () { yield "hello"; yield " world"; } },
  ], { onRoute: (name) => names.push(name), onChunk: (chunk) => chunks.push(chunk) });
  assert.equal(route, "backup");
  assert.deepEqual(names, ["backup"]);
  assert.equal(chunks.join(""), "hello world");
});

test("failure after the first chunk never blends a backup provider into the same stream", async () => {
  let backupCalled = false;
  const chunks = [];
  await assert.rejects(
    streamWithFallback([
      { name: "primary", open: async function* () { yield "first"; throw new ProviderFailure("LOST", true); } },
      { name: "backup", open: () => { backupCalled = true; return []; } },
    ], { onChunk: (chunk) => chunks.push(chunk) }),
    { code: "LOST" },
  );
  assert.deepEqual(chunks, ["first"]);
  assert.equal(backupCalled, false);
});

test("cancelled requests do not start another route", async () => {
  const controller = new AbortController();
  let backupCalled = false;
  await assert.rejects(
    streamWithFallback([
      { name: "primary", open: () => { controller.abort(); throw new ProviderFailure("DOWN", true); } },
      { name: "backup", open: () => { backupCalled = true; return []; } },
    ], { signal: controller.signal, onChunk: () => {} }),
    { code: "ABORTED" },
  );
  assert.equal(backupCalled, false);
});

test("split reasoning tags and unfinished tags never become visible prose", () => {
  const filter = createReasoningTextFilter();
  const result = ["A<thi", "nk>secret</th", "ink>B<thi"].map((part) => filter.push(part)).join("") + filter.flush();
  assert.equal(result, "AB");
  assert.equal(stripReasoningArtifacts("before<think>hidden</think>after"), "beforeafter");
});
