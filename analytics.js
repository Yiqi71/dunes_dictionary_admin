const STORAGE_KEY = "dd_events";
const MAX_EVENTS = 500;
let currentWordView = null;

function getDocLang() {
  try {
    const lang = (document?.documentElement?.lang || "").toLowerCase();
    if (lang.startsWith("en")) return "en";
    if (lang.startsWith("zh") || lang.includes("cn")) return "zh";
  } catch (_) {
    // ignore
  }
  return "zh";
}

function getSessionId() {
  const key = "dd_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function logEvent(name, data = {}) {
  try {
    const events = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const payload = { ...(data || {}) };
    if (!payload.lang) payload.lang = getDocLang();

    const event = {
      id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      ts: Date.now(),
      sessionId: getSessionId(),
      data: payload
    };

    // 1) 仍然写本地（防断网丢）
    events.push(event);
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));

    // 2) 同时上报到后端
    // - keepalive: 页面关闭/跳转时也尽量发出去
    // - 不阻塞 UI：不 await
    fetch("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true
    }).catch(() => {
      // 这里先静默，避免控制台刷屏；需要调试再 console.log
    });

  } catch (err) {
    console.error("logEvent failed", err);
  }
}

export function readEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (err) {
    console.error("readEvents failed", err);
    return [];
  }
}

export function startWordView(wordId) {
  const lang = getDocLang();
  currentWordView = { wordId, startTs: Date.now(), lang };
  logEvent("word_view_start", { wordId, lang });
}

export function endWordView(reason = "unknown") {
  if (!currentWordView) return;
  const durationMs = Date.now() - currentWordView.startTs;
  logEvent("word_view_end", {
    wordId: currentWordView.wordId,
    durationMs,
    reason,
    lang: currentWordView.lang || getDocLang()
  });
  currentWordView = null;
}
