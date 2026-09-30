/* 模块说明：演示版账号密码与会话处理；所有会话查询都基于令牌摘要和有效期。 */

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 120000;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const UNKNOWN_SALT = "00000000000000000000000000000000";

// 使用十六进制存储盐和摘要，避免依赖 Node 专属的 Buffer。
function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// 将数据库里的十六进制盐还原为 Web Crypto 需要的字节数组。
function fromHex(value) {
  return Uint8Array.from(value.match(/.{2}/g) || [], (part) => Number.parseInt(part, 16));
}

// 所有令牌和盐都来自平台密码学随机源。
function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

// 演示账号只接受简短 ASCII 用户名，避免把邮箱或私人姓名当作测试数据。
export function validHandle(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_]{3,24}$/.test(value);
}

// 在进入 PBKDF2 之前先限制密码长度，防止异常大的请求消耗 CPU。
export function validPassword(value) {
  return typeof value === "string" && value.length >= 10 && value.length <= 128;
}

/* PBKDF2 派生值只用于演示账号；生产站点仍使用私有仓库中的独立认证实现。 */
export async function derivePassword(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: PASSWORD_ITERATIONS },
    material,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function preparePassword(password) {
  const salt = toHex(randomBytes(16));
  return { salt, hash: await derivePassword(password, salt) };
}

export async function verifyPassword(password, user) {
  const actual = await derivePassword(password, user?.password_salt || UNKNOWN_SALT);
  const expected = user?.password_hash || "0".repeat(64);
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return Boolean(user) && difference === 0;
}

// D1 只持久化会话令牌摘要，原始令牌由浏览器持有。
async function tokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toHex(new Uint8Array(digest));
}

/* 原始令牌仅交给浏览器；D1 中只保存摘要，过期会话不会得到用户身份。 */
export async function createSession(db, userId) {
  const token = toHex(randomBytes(32));
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await tokenHash(token), userId, expiresAt)
    .run();
  return token;
}

export async function getSession(request, db) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("Authorization") || "");
  if (!match) return null;
  const hash = await tokenHash(match[1]);
  const user = await db.prepare(
    `SELECT u.id, u.handle, s.token_hash
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(hash, new Date().toISOString()).first();
  return user || null;
}

export async function revokeSession(db, tokenHashValue) {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(tokenHashValue)
    .run();
}
