const SAVED_WORD_IDS_STORAGE_KEY = "dd_saved_word_ids_v1";
const SAVED_WORD_SYNC_QUEUE_KEY = "dd_saved_word_sync_queue_v1";
const SAVED_WORD_SYNC_INTERVAL_MS = 15000;
const SAVED_WORD_EVENT_NAME = "word_save_toggle";
const SAVED_WORD_SNAPSHOT_SESSION_KEY = "dd_saved_word_snapshot_sent_v1";

let savedWordSyncInFlight = false;
let savedWordSnapshotQueued = false;
let savedWordSyncInitialized = false;

function safeParseStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
        return fallback;
    }
}

function safeWriteStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
        // ignore storage failures
    }
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

function getSavedWordSyncQueue() {
    const parsed = safeParseStorage(SAVED_WORD_SYNC_QUEUE_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
}

function setSavedWordSyncQueue(queue) {
    safeWriteStorage(SAVED_WORD_SYNC_QUEUE_KEY, Array.isArray(queue) ? queue : []);
}

function buildSavedWordSyncEvent(wordId, saved) {
    return {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: SAVED_WORD_EVENT_NAME,
        ts: Date.now(),
        sessionId: getSessionId(),
        data: {
            wordId: String(wordId),
            saved: Boolean(saved)
        }
    };
}

function enqueueSavedWordSync(wordId, saved) {
    const queue = getSavedWordSyncQueue();
    queue.push(buildSavedWordSyncEvent(wordId, saved));
    setSavedWordSyncQueue(queue);
}

function queueSavedWordSnapshotFromLocal({ force = false } = {}) {
    if (!force && savedWordSnapshotQueued) return;
    if (!force && sessionStorage.getItem(SAVED_WORD_SNAPSHOT_SESSION_KEY) === "1") return;
    savedWordSnapshotQueued = true;

    const savedWordIds = readSavedWordIdSet();
    if (savedWordIds.size === 0) {
        if (!force) sessionStorage.setItem(SAVED_WORD_SNAPSHOT_SESSION_KEY, "1");
        return;
    }

    savedWordIds.forEach((wordId) => {
        enqueueSavedWordSync(String(wordId), true);
    });

    if (!force) sessionStorage.setItem(SAVED_WORD_SNAPSHOT_SESSION_KEY, "1");
}

async function probeSavedWordSyncConnection() {
    if (!navigator.onLine) return false;
    try {
        const response = await fetch("/events", { method: "HEAD", cache: "no-store" });
        return response.ok;
    } catch (_) {
        return false;
    }
}

async function syncSavedWordQueue() {
    if (savedWordSyncInFlight) return;
    if (!navigator.onLine) return;

    let queue = getSavedWordSyncQueue();
    if (queue.length === 0) {
        await probeSavedWordSyncConnection();
        return;
    }

    savedWordSyncInFlight = true;
    try {
        while (queue.length > 0) {
            const payload = queue[0];
            try {
                const response = await fetch("/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    keepalive: true
                });
                if (!response.ok) break;
                queue.shift();
                setSavedWordSyncQueue(queue);
            } catch (_) {
                break;
            }
        }
    } finally {
        savedWordSyncInFlight = false;
    }
}

export function readSavedWordIdSet() {
    try {
        const raw = localStorage.getItem(SAVED_WORD_IDS_STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return new Set(parsed.map((id) => String(id)));
        }
        if (parsed && typeof parsed === "object") {
            const ids = Object.keys(parsed).filter((id) => Boolean(parsed[id]));
            return new Set(ids.map((id) => String(id)));
        }
    } catch (_) {
        // ignore malformed localStorage payload
    }
    return new Set();
}

export function writeSavedWordIdSet(savedWordIds) {
    try {
        localStorage.setItem(SAVED_WORD_IDS_STORAGE_KEY, JSON.stringify(Array.from(savedWordIds)));
    } catch (_) {
        // ignore storage failures
    }
}

export function applySavedStateToNode(node, savedWordIds) {
    if (!node) return;
    const wordId = String(node.id || "");
    node.classList.toggle("is-saved", savedWordIds.has(wordId));
}

export function refreshSavedWordIcons() {
    const savedWordIds = readSavedWordIdSet();
    document.querySelectorAll(".word-node").forEach((node) => {
        applySavedStateToNode(node, savedWordIds);
    });
}

function isScaleFiveActive() {
    return String(document.body?.dataset?.scale || "") === "5";
}

function toggleSavedStateForNode(node) {
    if (!node || !node.id) return false;
    const wordId = String(node.id);
    const savedWordIds = readSavedWordIdSet();
    if (savedWordIds.has(wordId)) {
        savedWordIds.delete(wordId);
    } else {
        savedWordIds.add(wordId);
    }
    writeSavedWordIdSet(savedWordIds);
    applySavedStateToNode(node, savedWordIds);
    const isSaved = savedWordIds.has(wordId);
    enqueueSavedWordSync(wordId, isSaved);
    syncSavedWordQueue();
    return isSaved;
}

export function bindSaveIndicatorInteraction(node) {
    const indicator = node?.querySelector(".save-indicator");
    if (!indicator) return;

    let lastToggleTs = 0;
    const TOGGLE_DEDUPE_MS = 350;
    const tryToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isScaleFiveActive()) return;
        const now = Date.now();
        if (now - lastToggleTs < TOGGLE_DEDUPE_MS) return;
        lastToggleTs = now;
        toggleSavedStateForNode(node);
    };

    indicator.addEventListener("mousedown", (e) => {
        e.stopPropagation();
    });

    indicator.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
    });

    indicator.addEventListener("pointerup", tryToggle);
    indicator.addEventListener("touchend", tryToggle, { passive: false });

    indicator.addEventListener("click", (e) => {
        const now = Date.now();
        if (now - lastToggleTs < TOGGLE_DEDUPE_MS) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        tryToggle(e);
    });
}

export function initSavedWordStorageSync() {
    if (!savedWordSyncInitialized) {
        savedWordSyncInitialized = true;
        queueSavedWordSnapshotFromLocal();
        setTimeout(() => {
            syncSavedWordQueue();
        }, 800);
        setInterval(syncSavedWordQueue, SAVED_WORD_SYNC_INTERVAL_MS);
        window.addEventListener("online", () => {
            queueSavedWordSnapshotFromLocal({ force: true });
            syncSavedWordQueue();
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                syncSavedWordQueue();
            }
        });
    }

    window.addEventListener("storage", (e) => {
        if (e.key === SAVED_WORD_IDS_STORAGE_KEY) {
            refreshSavedWordIcons();
        }
    });
    window.refreshSavedWordIcons = refreshSavedWordIcons;
}
