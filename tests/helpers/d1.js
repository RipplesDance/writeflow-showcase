/* 模块说明：用 Node 内置 SQLite 执行公开版原始 SQL，提供与 D1 链式查询相同的测试接口。 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const schema = readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8");

export function createTestDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            async first() {
              return statement.get(...values) || null;
            },
            async all() {
              return { results: statement.all(...values) };
            },
            async run() {
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes) } };
            },
          };
        },
      };
    },
  };
  return { DB, sqlite, close: () => sqlite.close() };
}

export function request(path, method = "GET", token = "", body = undefined) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
