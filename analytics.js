const STORAGE_KEY = "dd_events";
const MAX_EVENTS = 500;
const DEVICE_ID_KEY = "dd_device_id_v1";
const LEGACY_DEVICE_ID_KEYS = ["dunes_device_id_v1", "dd_vote_device_id_v1"];
const DEVICE_ID_PATTERN = /^[a-z0-9-]{16,128}$/;
const LEGACY_DEVICE_ID_PATTERN = /^d_[a-z0-9]+_[a-z0-9]+$/;

let currentWordView = null;

const API_BASE = (() => {
  const injected = (typeof window !== "undefined" && window.DD_API_BASE) ? String(window.DD_API_BASE).trim() : "";
  if (injected) return injected.replace(/\/+$/, "");
  const host = (typeof location !== "undefined" && location.hostname) ? location.hostname : "";
  if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3000";
  return "https://api.dunes-dictionary.com";
})();

function buildApiUrl(path) {
  return `${API_BASE}${path}`;
}

function normalizeDeviceId(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidDeviceId(value) {
  const normalized = normalizeDeviceId(value);
  return DEVICE_ID_PATTERN.test(normalized) || LEGACY_DEVICE_ID_PATTERN.test(normalized);
}

function generateDeviceId() {
  const ts = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `dunes-${ts}-${randomPart}`;
}

function persistDeviceId(id) {
  localStorage.setItem(DEVICE_ID_KEY, id);
}

function getOrCreateDeviceId() {
  try {
    const candidates = [DEVICE_ID_KEY, ...LEGACY_DEVICE_ID_KEYS];
    for (const key of candidates) {
      const raw = localStorage.getItem(key);
      const normalized = normalizeDeviceId(raw);
      if (!isValidDeviceId(normalized)) continue;
      persistDeviceId(normalized);
      return normalized;
    }

    const next = normalizeDeviceId(generateDeviceId());
    if (!isValidDeviceId(next)) return "";
    persistDeviceId(next);
    return next;
  } catch (_) {
    return "";
  }
}

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
    if (!payload.deviceId) payload.deviceId = getOrCreateDeviceId();

    const event = {
      id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      ts: Date.now(),
      sessionId: getSessionId(),
      data: payload
    };

    events.push(event);
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));

    fetch(buildApiUrl("/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true
    }).catch(() => {
      // noop
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
