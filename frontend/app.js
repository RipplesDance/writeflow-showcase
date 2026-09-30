/* 模块说明：演示版浏览器交互，连接账号、章节、SSE 生成和历史接口；不依赖前端框架。 */
const $ = (id) => document.getElementById(id);
const storageKey = "writeflow_showcase_token";
const languageKey = "writeflow_showcase_lang";
const state = {
  token: localStorage.getItem(storageKey) || "",
  language: localStorage.getItem(languageKey) === "zh" ? "zh" : "en",
  user: null,
  chapters: [],
  selectedId: null,
  generationController: null,
};

const copy = {
  en: {
    language: "Language", logout: "Log out", eyebrow: "RUNNABLE PORTFOLIO EDITION",
    title: "A story idea, through the full stack.",
    intro: "Create a chapter, stream a short demo continuation, and revisit its saved history. The provider is deterministic: no API key or production prompt is used.",
    proofFrontend: "Browser streaming & cancellation", proofBackend: "Authenticated Pages Functions",
    proofData: "User-scoped D1 persistence", proofFailure: "Provider fallback before output",
    accountTitle: "Demo account", accountHint: "Use a made-up handle and password. No email is collected.",
    handle: "Handle", password: "Password", login: "Log in", register: "Create account",
    chapterTitle: "Chapter workspace", chapterName: "Chapter title", premise: "Chapter premise",
    createChapter: "Create chapter", saveChapter: "Save chapter", newChapter: "New", deleteChapter: "Delete",
    generateTitle: "Stream a continuation", generateHint: "Select a chapter, then enter one story beat.",
    storyBeat: "Story beat", beatPlaceholder: "A visitor arrives with a letter that should not exist.",
    fallbackLabel: "Simulate primary provider failure", generate: "Generate demo text", stop: "Stop",
    output: "Output", emptyOutput: "Generated text will appear here.",
    historyTitle: "Saved history", historyHint: "Only completed generations are stored for this account.",
    footer: "Portfolio adaptation. Production prompts, customer data and payment systems are excluded.",
    noChapters: "No chapters yet. Create one below.", noHistory: "No completed generations for this chapter.",
    selectChapter: "Select a chapter first.", signedIn: "Signed in as", ready: "Ready to write.",
    saved: "Chapter saved.", deleted: "Chapter deleted.", streaming: "Streaming demo text…",
    completed: "Generation complete and saved.", stopped: "Generation stopped; no history was saved.",
    GENERATION_FAILED: "Generation failed. Any text already received remains visible.",
    INVALID_CREDENTIALS: "Handle or password is incorrect.", HANDLE_TAKEN: "That handle is already in use.",
    RATE_LIMITED: "Too many attempts. Please try again later.", CHAPTER_LIMIT: "This demo account has reached its chapter limit.",
    UNAUTHORIZED: "Session expired. Please log in again.", INVALID_FIELDS: "Please check the form fields.",
    BODY_TOO_LARGE: "The request is too long.", DB_NOT_BOUND: "Local D1 is not configured.",
    NOT_FOUND: "This chapter was not found.", STREAM_INTERRUPTED: "The stream ended before completion.",
    NETWORK_ERROR: "Request failed. Check that the local Pages server is running.",
  },
  zh: {
    language: "语言", logout: "退出登录", eyebrow: "可运行的作品展示版",
    title: "让一个故事想法走完整个技术栈。",
    intro: "创建章节、实时接收一段演示续写，并回看已保存的历史。模型输出由确定性的模拟服务提供，不使用 API 密钥或生产提示词。",
    proofFrontend: "浏览器流式读取与取消", proofBackend: "鉴权的 Pages Functions",
    proofData: "按用户隔离的 D1 数据", proofFailure: "输出开始前的服务回退",
    accountTitle: "演示账号", accountHint: "使用虚构用户名和密码；不收集邮箱。",
    handle: "用户名", password: "密码", login: "登录", register: "创建账号",
    chapterTitle: "章节工作区", chapterName: "章节标题", premise: "章节设定",
    createChapter: "创建章节", saveChapter: "保存章节", newChapter: "新建", deleteChapter: "删除",
    generateTitle: "流式续写", generateHint: "先选择章节，再输入一个情节点。",
    storyBeat: "情节点", beatPlaceholder: "一位访客带来了本不该存在的信。",
    fallbackLabel: "模拟主服务失败", generate: "生成演示文本", stop: "停止",
    output: "输出", emptyOutput: "生成的文字会显示在这里。",
    historyTitle: "已保存的历史", historyHint: "只保存当前账号完整结束的生成。",
    footer: "作品展示版。生产提示词、用户数据及支付系统未包含在内。",
    noChapters: "还没有章节，请在下方创建。", noHistory: "这个章节还没有完整生成记录。",
    selectChapter: "请先选择章节。", signedIn: "当前账号", ready: "可以开始写作。",
    saved: "章节已保存。", deleted: "章节已删除。", streaming: "正在流式生成演示文本……",
    completed: "生成完成，已保存历史。", stopped: "生成已停止，未保存历史。",
    GENERATION_FAILED: "生成失败，已收到的文字仍会保留。",
    INVALID_CREDENTIALS: "用户名或密码不正确。", HANDLE_TAKEN: "这个用户名已被使用。",
    RATE_LIMITED: "尝试次数过多，请稍后重试。", CHAPTER_LIMIT: "演示账号已达到章节上限。",
    UNAUTHORIZED: "会话已过期，请重新登录。", INVALID_FIELDS: "请检查表单内容。",
    BODY_TOO_LARGE: "请求内容过长。", DB_NOT_BOUND: "本地 D1 尚未配置。",
    NOT_FOUND: "找不到这个章节。", STREAM_INTERRUPTED: "数据流在完成前中断。",
    NETWORK_ERROR: "请求失败，请确认本地 Pages 服务已启动。",
  },
};

// 当前语言的文案只从本地常量表读取。
function t(key) {
  return copy[state.language][key] || key;
}

// 通过 aria-live 状态区报告结果，同时保留已生成的正文。
function setStatus(key, error = false) {
  $("status").textContent = t(key);
  $("status").classList.toggle("error", error);
}

// 切换静态和动态标签；用户输入本身不参与翻译。
function setLanguage(language) {
  state.language = language === "zh" ? "zh" : "en";
  localStorage.setItem(languageKey, state.language);
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  $("language").value = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  $("signed-in-as").textContent = state.user ? `${t("signedIn")}: ${state.user.handle}` : "";
  $("save-chapter").textContent = t(state.selectedId ? "saveChapter" : "createChapter");
  renderChapters();
  if (!$("history-list").children.length) showEmptyHistory();
}

// 为 JSON API 统一加入当前会话并把稳定错误码交给页面文案表。
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
    });
  } catch {
    throw new Error("NETWORK_ERROR");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "NETWORK_ERROR");
  return data;
}

// 清除浏览器演示会话及账号相关页面状态。
function showSignedOut() {
  state.token = "";
  state.user = null;
  state.selectedId = null;
  state.chapters = [];
  localStorage.removeItem(storageKey);
  $("auth-panel").hidden = false;
  $("workspace").hidden = true;
  $("logout").hidden = true;
  $("password").value = "";
}

// 登录后重新读取 D1 章节，避免信任浏览器中的旧数据。
async function showSignedIn(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem(storageKey, token);
  $("auth-panel").hidden = true;
  $("workspace").hidden = false;
  $("logout").hidden = false;
  $("password").value = "";
  $("signed-in-as").textContent = `${t("signedIn")}: ${user.handle}`;
  await loadChapters();
  setStatus("ready");
}

// 用 textContent 构造章节列表，防止用户标题作为 HTML 执行。
function renderChapters() {
  const container = $("chapter-list");
  container.replaceChildren();
  if (!state.chapters.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = t("noChapters");
    container.append(empty);
    return;
  }
  for (const chapter of state.chapters) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = chapter.id === state.selectedId ? "active" : "";
    button.textContent = chapter.title;
    const detail = document.createElement("small");
    detail.textContent = chapter.premise;
    button.append(detail);
    button.addEventListener("click", () => selectChapter(chapter.id));
    container.append(button);
  }
}

// 章节尚无完整生成记录时提供明确的空状态。
function showEmptyHistory() {
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = t("noHistory");
  $("history-list").replaceChildren(empty);
}

// 重新读取当前账号的章节并保持仍有效的选中项。
async function loadChapters() {
  const data = await api("/api/chapters");
  state.chapters = data.chapters;
  if (!state.chapters.some((chapter) => chapter.id === state.selectedId)) state.selectedId = null;
  renderChapters();
  if (state.selectedId) await loadHistory();
  else showEmptyHistory();
}

// 选择章节后加载它的表单值和归档历史。
async function selectChapter(id) {
  state.selectedId = id;
  const chapter = state.chapters.find((item) => item.id === id);
  if (!chapter) return;
  $("chapter-name").value = chapter.title;
  $("premise").value = chapter.premise;
  $("save-chapter").textContent = t("saveChapter");
  $("delete-chapter").hidden = false;
  renderChapters();
  await loadHistory();
}

// 回到新建模式，不删除 D1 中已有的章节。
function resetChapterForm() {
  state.selectedId = null;
  $("chapter-form").reset();
  $("save-chapter").textContent = t("createChapter");
  $("delete-chapter").hidden = true;
  renderChapters();
  showEmptyHistory();
}

// 历史仅显示当前章节；迟到的旧请求不得覆盖新选择。
async function loadHistory() {
  if (!state.selectedId) return showEmptyHistory();
  const chapterId = state.selectedId;
  const data = await api(`/api/history?chapterId=${encodeURIComponent(chapterId)}`);
  if (chapterId !== state.selectedId) return;
  const container = $("history-list");
  container.replaceChildren();
  if (!data.history.length) return showEmptyHistory();
  for (const entry of data.history) {
    const article = document.createElement("article");
    article.className = "history-item";
    const header = document.createElement("header");
    const date = document.createElement("time");
    date.dateTime = entry.created_at;
    date.textContent = new Date(entry.created_at).toLocaleString(state.language === "zh" ? "zh-CN" : "en-IE");
    const route = document.createElement("span");
    route.textContent = entry.provider_route;
    header.append(date, route);
    const seed = document.createElement("p");
    seed.className = "history-seed";
    seed.textContent = entry.input;
    const output = document.createElement("p");
    output.textContent = entry.output;
    article.append(header, seed, output);
    container.append(article);
  }
}

/* SSE 帧可跨任意网络 chunk；只在完整的空行分隔后解析 JSON。 */
// 从完整 SSE 帧提取事件名和 JSON 数据。
function readFrame(frame) {
  const event = /^event: (.+)$/m.exec(frame)?.[1];
  const payload = /^data: (.+)$/m.exec(frame)?.[1];
  if (!event || !payload) return null;
  return { event, data: JSON.parse(payload) };
}

/* 发起一次生成并增量显示文本；完成、取消和错误都保留已收到的内容。 */
async function runGeneration() {
  if (!state.selectedId) return setStatus("selectChapter", true);
  const chapterId = state.selectedId;
  const seed = $("story-beat").value.trim();
  if (!seed) return;
  const controller = new AbortController();
  state.generationController = controller;
  $("generate").disabled = true;
  $("stop").hidden = false;
  $("output-text").textContent = "";
  $("route-badge").hidden = true;
  setStatus("streaming");
  let completed = false;
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({
        chapterId,
        seed,
        language: state.language,
        simulateFallback: $("simulate-fallback").checked,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "NETWORK_ERROR");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        const frame = readFrame(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
        if (!frame) continue;
        if (frame.event === "route") {
          $("route-badge").textContent = frame.data.name;
          $("route-badge").hidden = false;
        } else if (frame.event === "delta") {
          $("output-text").textContent += frame.data.text;
        } else if (frame.event === "error") {
          throw new Error(frame.data.error || "GENERATION_FAILED");
        } else if (frame.event === "complete") {
          completed = true;
        }
      }
    }
    if (!completed) throw new Error("STREAM_INTERRUPTED");
    setStatus("completed");
    if (chapterId === state.selectedId) await loadHistory();
  } catch (error) {
    if (controller.signal.aborted) setStatus("stopped");
    else setStatus(copy[state.language][error?.message] ? error.message : "NETWORK_ERROR", true);
  } finally {
    state.generationController = null;
    $("generate").disabled = false;
    $("stop").hidden = true;
  }
}

$("language").addEventListener("change", (event) => setLanguage(event.target.value));
$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter?.dataset.action === "register" ? "register" : "login";
  const buttons = $("auth-form").querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const data = await api(`/api/auth/${action}`, {
      method: "POST",
      body: JSON.stringify({ handle: $("handle").value, password: $("password").value }),
    });
    await showSignedIn(data.token, data.user);
  } catch (error) {
    setStatus(copy[state.language][error?.message] ? error.message : "NETWORK_ERROR", true);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
});
$("logout").addEventListener("click", async () => {
  state.generationController?.abort();
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  showSignedOut();
  setStatus("ready");
});
$("chapter-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const selectedId = state.selectedId;
    const data = await api(selectedId ? `/api/chapters/${selectedId}` : "/api/chapters", {
      method: selectedId ? "PUT" : "POST",
      body: JSON.stringify({ title: $("chapter-name").value, premise: $("premise").value }),
    });
    await loadChapters();
    await selectChapter(data.chapter.id);
    setStatus("saved");
  } catch (error) {
    setStatus(copy[state.language][error?.message] ? error.message : "NETWORK_ERROR", true);
  }
});
$("new-chapter").addEventListener("click", resetChapterForm);
$("delete-chapter").addEventListener("click", async () => {
  if (!state.selectedId) return;
  try {
    await api(`/api/chapters/${state.selectedId}`, { method: "DELETE" });
    resetChapterForm();
    await loadChapters();
    setStatus("deleted");
  } catch (error) {
    setStatus(copy[state.language][error?.message] ? error.message : "NETWORK_ERROR", true);
  }
});
$("generate-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void runGeneration();
});
$("stop").addEventListener("click", () => state.generationController?.abort());

setLanguage(state.language);
if (state.token) {
  api("/api/auth/me")
    .then((data) => showSignedIn(state.token, data.user))
    .catch(() => { showSignedOut(); setStatus("UNAUTHORIZED", true); });
} else {
  showSignedOut();
}
