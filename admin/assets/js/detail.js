import {
    state
} from "./state.js";

import {
    zoomToWord,
    updateWordDetails,
    updateWordFocus,
    applyPositionVariations
} from "./wordFocus.js";

import {
    updateRelations
} from "./relationManager.js"

import { applyStintFallbackIn } from "./fontFallback.js";
import { getDisplayOriText } from "./oriDisplay.js";
import { getOrCreateDeviceId } from "./device-id.js";
import { logEvent, startWordView, endWordView } from "/analytics.js";
// Floating panel UI state
let isPanelVisible = false;
let isExpanded = false;

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

function getFloatingPanel() {
    return document.getElementById('floating-panel');
}

function queryFloating(selector) {
    const panel = getFloatingPanel();
    return panel ? panel.querySelector(selector) : null;
}

function queryAllFloating(selector) {
    const panel = getFloatingPanel();
    return panel ? panel.querySelectorAll(selector) : [];
}

function setupLazyImages(root) {
    if (!root) return;
    const imgs = root.querySelectorAll("img");
    imgs.forEach((img) => {
        img.loading = "lazy";
        img.decoding = "async";
        img.classList.add("lazy-img");
        img.style.visibility = "hidden";

        if (img.complete && img.naturalWidth > 0) {
            img.classList.remove("lazy-img");
            img.style.visibility = "visible";
            return;
        }
        img.addEventListener("load", () => {
            img.classList.remove("lazy-img");
            img.style.visibility = "visible";
        }, { once: true });
        img.addEventListener("error", () => {
            img.classList.add("lazy-img-error");
            img.style.visibility = "hidden";
        }, { once: true });
    });
}

function applyHashItalics(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/#([^#]+)#/g, "<i>$1</i>");
}

function ensureTerminalPunctuation(text, lang) {
    if (text === null || text === undefined) return "";
    const raw = String(text);
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    const lastChar = trimmed[trimmed.length - 1];
    const zhPunct = /[。！？；…]/;
    const enPunct = /[.!?;:]/;
    const needs = lang === "zh" ? !zhPunct.test(lastChar) : !enPunct.test(lastChar);
    if (!needs) return raw;
    const suffix = lang === "zh" ? "。" : ".";
    return raw + suffix;
}

const ENTRY_VOTE_COUNTS_KEY = "dd_entry_understanding_vote_counts_v1";
const ENTRY_USER_VOTES_KEY = "dd_entry_understanding_user_votes_v1";
const ENTRY_VOTE_SYNC_QUEUE_KEY = "dd_entry_understanding_vote_sync_queue_v1";
const ENTRY_VOTE_SYNC_INTERVAL_MS = 15000;
const ENTRY_VOTE_STATS_CACHE_TTL_MS = 30000;
const COMMENT_LIKE_SYNC_QUEUE_KEY = "dd_comment_like_sync_queue_v1";
const COMMENT_LIKE_SNAPSHOT_SESSION_KEY = "dd_comment_like_snapshot_sent_v1";
const ENTRY_VOTE_LOCAL_KEYS = [
    ENTRY_VOTE_COUNTS_KEY,
    ENTRY_USER_VOTES_KEY,
    ENTRY_VOTE_SYNC_QUEUE_KEY
];
let voteSyncState = navigator.onLine ? "checking" : "disconnected";
let voteSyncInFlight = false;
let voteSyncInitialized = false;
const entryVoteStatsCache = new Map();
let commentLikeSyncInFlight = false;
let commentLikeSnapshotQueued = false;
let voteResetHotkeyInitialized = false;
const voteHotkeysPressed = new Set();
let voteResetComboTriggered = false;

function safeParseStorage(key, fallback = {}) {
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

const COMMENT_LIKES_KEY = "dd_comment_likes_v1";
const COMMENT_LIKE_EVENT_NAME = "comment_like_toggle";
const COMMENT_LIKE_COUNTS_CACHE_TTL_MS = 30000;
const commentLikeCountsCache = new Map();
const voteStatsSessionRefreshedWordIds = new Set();
const commentLikeSessionRefreshedWordIds = new Set();

function getCommentLikeStorage() {
    const parsed = safeParseStorage(COMMENT_LIKES_KEY, {});
    return parsed && typeof parsed === "object" ? parsed : {};
}

function setCommentLikeStorage(value) {
    safeWriteStorage(COMMENT_LIKES_KEY, value && typeof value === "object" ? value : {});
}

function getCommentLikeKey(wordId, commentIndex) {
    return `${String(wordId)}:${Number(commentIndex)}`;
}

function isCommentLiked(wordId, commentIndex) {
    const likes = getCommentLikeStorage();
    return Boolean(likes[getCommentLikeKey(wordId, commentIndex)]);
}

function toggleCommentLiked(wordId, commentIndex) {
    const likes = getCommentLikeStorage();
    const key = getCommentLikeKey(wordId, commentIndex);
    const next = !Boolean(likes[key]);
    if (next) {
        likes[key] = true;
    } else {
        delete likes[key];
    }
    setCommentLikeStorage(likes);
    return next;
}

function getPendingCommentLikeState(wordId, commentIndex) {
    const targetWordId = String(wordId);
    const targetCommentIndex = Number(commentIndex);
    if (!Number.isFinite(targetCommentIndex)) return null;
    const queue = getCommentLikeSyncQueue();
    for (let i = queue.length - 1; i >= 0; i--) {
        const eventPayload = queue[i];
        if (!eventPayload || eventPayload.name !== COMMENT_LIKE_EVENT_NAME) continue;
        const data = eventPayload.data || {};
        if (String(data.wordId) !== targetWordId) continue;
        if (Number(data.commentIndex) !== targetCommentIndex) continue;
        return Boolean(data.liked);
    }
    return null;
}

async function fetchCommentLikeCounts(wordId, { force = false } = {}) {
    const cacheKey = String(wordId);
    const now = Date.now();
    const cached = commentLikeCountsCache.get(cacheKey);
    if (!force && cached && now - cached.ts < COMMENT_LIKE_COUNTS_CACHE_TTL_MS) {
        return cached.counts;
    }

    const response = await fetch(buildApiUrl(`/api/votes/comment-likes?wordId=${encodeURIComponent(cacheKey)}`), {
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error(`failed_to_fetch_comment_like_counts_${response.status}`);
    }

    const payload = await response.json();
    const rawCounts = payload?.countsByCommentIndex;
    const counts = rawCounts && typeof rawCounts === "object" ? rawCounts : {};
    commentLikeCountsCache.set(cacheKey, { ts: now, counts });
    return counts;
}

function setCommentLikeBadge(buttonEl, count, shouldShow) {
    const countEl = buttonEl?.querySelector(".note-like-count");
    if (!countEl) return;
    if (!shouldShow) {
        countEl.textContent = "";
        countEl.style.display = "none";
        return;
    }
    countEl.textContent = String(Math.max(0, Number(count) || 0));
    countEl.style.display = "block";
}

async function refreshCommentLikeBadges(contentScroll, wordId, { force = false } = {}) {
    if (!contentScroll) return;
    const buttons = Array.from(contentScroll.querySelectorAll(".note-like-toggle"));
    if (!buttons.length) return;

    const anyLiked = buttons.some((btn) => btn.classList.contains("is-liked"));

    if (!anyLiked) {
        buttons.forEach((btn) => setCommentLikeBadge(btn, 0, false));
        return;
    }

    const wordKey = String(wordId);
    const shouldForceSessionRefresh = !commentLikeSessionRefreshedWordIds.has(wordKey);

    try {
        const counts = await fetchCommentLikeCounts(wordId, { force: force || shouldForceSessionRefresh });
        commentLikeSessionRefreshedWordIds.add(wordKey);
        buttons.forEach((btn) => {
            const idx = String(Number(btn.dataset.commentIndex));
            const commentIndex = Number(btn.dataset.commentIndex);
            const liked = btn.classList.contains("is-liked");
            const rawCount = Math.max(0, Number(counts[idx]) || 0);
            const pendingState = getPendingCommentLikeState(wordId, commentIndex);
            let displayCount = rawCount;
            if (pendingState === true) {
                displayCount = rawCount + 1;
            } else if (pendingState === false) {
                displayCount = Math.max(0, rawCount - 1);
            }
            setCommentLikeBadge(btn, displayCount, liked);
        });
    } catch (_) {
        buttons.forEach((btn) => setCommentLikeBadge(btn, 0, false));
    }
}

function getVoteSessionId() {
    const key = "dd_session_id";
    let id = sessionStorage.getItem(key);
    if (!id) {
        id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem(key, id);
    }
    return id;
}

function getVoteDeviceId() {
    return getOrCreateDeviceId();
}

function isVoteSyncConnected() {
    return voteSyncState === "connected";
}

function refreshVisibleVoteNote() {
    const noteEl = queryFloating(".panel-entry #section-understanding-vote .entry-vote-note");
    if (!noteEl) return;
    noteEl.style.display = isVoteSyncConnected() ? "none" : "block";
}

function setVoteSyncState(next) {
    if (voteSyncState === next) return;
    const prev = voteSyncState;
    voteSyncState = next;
    refreshVisibleVoteNote();
    if (next === "connected" && prev !== "connected") {
        queueCommentLikeSnapshotFromLocal({ force: true });
        syncCommentLikeQueue();
    }
    const commentPanel = queryFloating(".panel-comment");
    const contentScroll = commentPanel?.querySelector(".panel-bottom");
    if (contentScroll && state.focusedNodeId !== null && state.focusedNodeId !== undefined) {
        refreshCommentLikeBadges(contentScroll, state.focusedNodeId, { force: next === "connected" });
    }
}

function getVoteSyncQueue() {
    const parsed = safeParseStorage(ENTRY_VOTE_SYNC_QUEUE_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
}

function normalizeVoteChoice(choice) {
    const v = String(choice || "").toLowerCase();
    return v === "clear" || v === "unclear" ? v : null;
}

function toVoteStats(clear, unclear) {
    const safeClear = Math.max(0, Number(clear) || 0);
    const safeUnclear = Math.max(0, Number(unclear) || 0);
    const total = safeClear + safeUnclear;
    const clearPct = total > 0 ? Math.round((safeClear / total) * 100) : 0;
    const unclearPct = total > 0 ? 100 - clearPct : 0;
    return { clear: safeClear, unclear: safeUnclear, total, clearPct, unclearPct };
}

function normalizeVoteStats(stats) {
    if (!stats || typeof stats !== "object") return toVoteStats(0, 0);
    return toVoteStats(stats.clear, stats.unclear);
}

function applyVoteChoiceToStats(stats, choice) {
    const next = normalizeVoteStats(stats);
    const normalizedChoice = normalizeVoteChoice(choice);
    if (!normalizedChoice) return next;
    return toVoteStats(
        next.clear + (normalizedChoice === "clear" ? 1 : 0),
        next.unclear + (normalizedChoice === "unclear" ? 1 : 0)
    );
}

function getPendingVoteChoice(wordId) {
    const targetWordId = String(wordId);
    const queue = getVoteSyncQueue();
    for (let i = queue.length - 1; i >= 0; i--) {
        const eventPayload = queue[i];
        if (!eventPayload || eventPayload.name !== "entry_understanding_vote") continue;
        const data = eventPayload.data || {};
        if (String(data.wordId) !== targetWordId) continue;
        const choice = normalizeVoteChoice(data.choice);
        if (choice) return choice;
    }
    return null;
}

function setVoteSyncQueue(queue) {
    safeWriteStorage(ENTRY_VOTE_SYNC_QUEUE_KEY, Array.isArray(queue) ? queue : []);
}

function getCommentLikeSyncQueue() {
    const parsed = safeParseStorage(COMMENT_LIKE_SYNC_QUEUE_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
}

function setCommentLikeSyncQueue(queue) {
    safeWriteStorage(COMMENT_LIKE_SYNC_QUEUE_KEY, Array.isArray(queue) ? queue : []);
}

function clearLocalVoteData() {
    ENTRY_VOTE_LOCAL_KEYS.forEach((key) => {
        try {
            localStorage.removeItem(key);
        } catch (_) {
            // ignore
        }
    });
}

function initVoteResetHotkey() {
    if (voteResetHotkeyInitialized) return;
    voteResetHotkeyInitialized = true;

    document.addEventListener("keydown", (e) => {
        const key = (e.key || "").toLowerCase();
        if (key !== "a" && key !== "t") return;
        voteHotkeysPressed.add(key);
        if (e.repeat) return;

        if (voteHotkeysPressed.has("a") && voteHotkeysPressed.has("t") && !voteResetComboTriggered) {
            voteResetComboTriggered = true;
            const panel = getFloatingPanel();
            const voteSection = queryFloating(".panel-entry #section-understanding-vote");
            if (!panel || panel.classList.contains("hidden") || !voteSection) return;

            const lang = normalizeLang(document.documentElement.lang || state.currentLang || "zh");
            const message = lang === "en"
                ? "Clear local vote data on this browser?"
                : "清空当前浏览器的本地投票数据？";
            if (!window.confirm(message)) return;

            clearLocalVoteData();
            renderPanelSections();
            syncVoteQueue();
        }
    });

    document.addEventListener("keyup", (e) => {
        const key = (e.key || "").toLowerCase();
        if (key !== "a" && key !== "t") return;
        voteHotkeysPressed.delete(key);
        if (!voteHotkeysPressed.has("a") || !voteHotkeysPressed.has("t")) {
            voteResetComboTriggered = false;
        }
    });
}

function buildVoteSyncEvent(wordId, choice) {
    return {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: "entry_understanding_vote",
        ts: Date.now(),
        sessionId: getVoteSessionId(),
        data: {
            wordId,
            choice,
            deviceId: getVoteDeviceId(),
            lang: normalizeLang(document.documentElement.lang || state.currentLang || "zh")
        }
    };
}

function buildCommentLikeSyncEvent(wordId, commentIndex, liked, langOverride) {
    return {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: COMMENT_LIKE_EVENT_NAME,
        ts: Date.now(),
        sessionId: getVoteSessionId(),
        data: {
            wordId,
            commentIndex,
            liked: Boolean(liked),
            deviceId: getVoteDeviceId(),
            lang: normalizeLang(langOverride || document.documentElement.lang || state.currentLang || "zh")
        }
    };
}

function enqueueVoteSync(wordId, choice) {
    const queue = getVoteSyncQueue();
    queue.push(buildVoteSyncEvent(wordId, choice));
    setVoteSyncQueue(queue);
}

function enqueueCommentLikeSync(wordId, commentIndex, liked, langOverride) {
    const queue = getCommentLikeSyncQueue();
    queue.push(buildCommentLikeSyncEvent(wordId, commentIndex, liked, langOverride));
    setCommentLikeSyncQueue(queue);
}

function queueCommentLikeSnapshotFromLocal({ force = false } = {}) {
    if (!force && commentLikeSnapshotQueued) return;
    if (!force && sessionStorage.getItem(COMMENT_LIKE_SNAPSHOT_SESSION_KEY) === "1") return;
    commentLikeSnapshotQueued = true;

    const likes = getCommentLikeStorage();
    const entries = Object.entries(likes);
    if (!entries.length) {
        sessionStorage.setItem(COMMENT_LIKE_SNAPSHOT_SESSION_KEY, "1");
        return;
    }

    const lang = normalizeLang(document.documentElement.lang || state.currentLang || "zh");
    entries.forEach(([key, liked]) => {
        if (!liked) return;
        const parts = String(key).split(":");
        if (parts.length !== 2) return;
        const wordId = parts[0];
        const commentIndex = Number(parts[1]);
        if (!wordId || !Number.isFinite(commentIndex)) return;
        enqueueCommentLikeSync(wordId, commentIndex, true, lang);
    });
    if (!force) {
        sessionStorage.setItem(COMMENT_LIKE_SNAPSHOT_SESSION_KEY, "1");
    }
}

async function probeVoteSyncConnection() {
    if (!navigator.onLine) {
        setVoteSyncState("disconnected");
        return false;
    }
    try {
        const response = await fetch(buildApiUrl("/events"), { method: "HEAD", cache: "no-store" });
        if (response.ok) {
            setVoteSyncState("connected");
            return true;
        }
        setVoteSyncState("disconnected");
        return false;
    } catch (_) {
        setVoteSyncState("disconnected");
        return false;
    }
}

async function syncVoteQueue() {
    if (voteSyncInFlight) return;
    if (!navigator.onLine) {
        setVoteSyncState("disconnected");
        return;
    }

    let queue = getVoteSyncQueue();
    if (queue.length === 0) {
        await probeVoteSyncConnection();
        await syncCommentLikeQueue();
        return;
    }

    voteSyncInFlight = true;
    try {
        while (queue.length > 0) {
            const eventPayload = queue[0];
            try {
                const response = await fetch(buildApiUrl("/events"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(eventPayload),
                    keepalive: true
                });

                if (response.ok) {
                    setVoteSyncState("connected");
                    queue.shift();
                    setVoteSyncQueue(queue);
                    continue;
                }
                setVoteSyncState("disconnected");
                break;
            } catch (_) {
                setVoteSyncState("disconnected");
                break;
            }
        }
    } finally {
        voteSyncInFlight = false;
    }

    await syncCommentLikeQueue();
}

async function syncCommentLikeQueue() {
    if (commentLikeSyncInFlight) return;
    if (!navigator.onLine) return;

    let queue = getCommentLikeSyncQueue();
    if (queue.length === 0) return;

    commentLikeSyncInFlight = true;
    try {
        while (queue.length > 0) {
            const eventPayload = queue[0];
            try {
                const response = await fetch(buildApiUrl("/events"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(eventPayload),
                    keepalive: true
                });
                if (!response.ok) break;
                queue.shift();
                setCommentLikeSyncQueue(queue);
            } catch (_) {
                break;
            }
        }
    } finally {
        commentLikeSyncInFlight = false;
    }
}

function initVoteSync() {
    if (voteSyncInitialized) return;
    voteSyncInitialized = true;
    queueCommentLikeSnapshotFromLocal();

    window.addEventListener("online", () => {
        setVoteSyncState("checking");
        syncVoteQueue();
    });
    window.addEventListener("offline", () => {
        setVoteSyncState("disconnected");
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            syncVoteQueue();
        }
    });

    setTimeout(() => {
        syncVoteQueue();
    }, 800);
    setInterval(syncVoteQueue, ENTRY_VOTE_SYNC_INTERVAL_MS);
}

function getWordVoteStats(wordId) {
    const counts = safeParseStorage(ENTRY_VOTE_COUNTS_KEY, {});
    const id = String(wordId);
    const current = counts[id] || {};
    return toVoteStats(current.clear, current.unclear);
}

async function fetchServerWordVoteStats(wordId, { force = false } = {}) {
    const cacheKey = String(wordId);
    const now = Date.now();
    const cached = entryVoteStatsCache.get(cacheKey);
    if (!force && cached && now - cached.ts < ENTRY_VOTE_STATS_CACHE_TTL_MS) {
        return cached.stats;
    }

    const response = await fetch(buildApiUrl(`/api/votes/understanding?wordId=${encodeURIComponent(cacheKey)}`), {
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error(`failed_to_fetch_vote_stats_${response.status}`);
    }

    const payload = await response.json();
    const stats = normalizeVoteStats(payload?.stats);
    entryVoteStatsCache.set(cacheKey, { ts: now, stats });
    return stats;
}

function getUserVote(wordId) {
    const votes = safeParseStorage(ENTRY_USER_VOTES_KEY, {});
    const choice = votes[String(wordId)];
    return choice === "clear" || choice === "unclear" ? choice : null;
}

function submitWordVote(wordId, choice) {
    if (choice !== "clear" && choice !== "unclear") return null;

    const id = String(wordId);
    const counts = safeParseStorage(ENTRY_VOTE_COUNTS_KEY, {});
    const current = counts[id] || { clear: 0, unclear: 0 };

    current.clear = Math.max(0, Number(current.clear) || 0);
    current.unclear = Math.max(0, Number(current.unclear) || 0);
    current[choice] += 1;

    counts[id] = current;
    safeWriteStorage(ENTRY_VOTE_COUNTS_KEY, counts);

    const userVotes = safeParseStorage(ENTRY_USER_VOTES_KEY, {});
    userVotes[id] = choice;
    safeWriteStorage(ENTRY_USER_VOTES_KEY, userVotes);

    return getWordVoteStats(id);
}

function renderUnderstandingVoteSection(sectionEl, currentWord, lang) {
    if (!sectionEl || !currentWord) return;

    const term = currentWord.term?.[lang] || currentWord.term?.zh || currentWord.term?.en || "";
    const labels = lang === "en"
        ? {
            question: `Do you think "${term}" is easy to understand?`,
            clear: "Understood",
            unclear: "Not clear",
            submit: "Vote",
            syncNote: "Note: server connection is unavailable. Your vote will sync after recovery."
        }
        : {
            question: `你觉得“${term}”这个词条好理解吗？`,
            clear: "看明白了",
            unclear: "没看明白",
            submit: "投票",
            syncNote: "注：当前与服务器连接异常，投票会暂存并在恢复后同步。"
        };

    sectionEl.innerHTML = `
        <div class="entry-vote-wrap">
            <p class="entry-vote-question">${labels.question}</p>
            <div class="entry-vote-options">
                <button type="button" class="entry-vote-option" data-vote="clear"><span class="entry-vote-text">${labels.clear}</span></button>
                <button type="button" class="entry-vote-option" data-vote="unclear"><span class="entry-vote-text">${labels.unclear}</span></button>
            </div>
            <button type="button" class="entry-vote-submit">${labels.submit}</button>
            <p class="entry-vote-note">${labels.syncNote}</p>
        </div>
    `;

    const clearBtn = sectionEl.querySelector('[data-vote="clear"]');
    const unclearBtn = sectionEl.querySelector('[data-vote="unclear"]');
    const clearText = clearBtn?.querySelector(".entry-vote-text");
    const unclearText = unclearBtn?.querySelector(".entry-vote-text");
    const submitBtn = sectionEl.querySelector(".entry-vote-submit");
    const noteEl = sectionEl.querySelector(".entry-vote-note");
    if (!clearBtn || !unclearBtn || !clearText || !unclearText || !submitBtn || !noteEl) return;

    const setVoteButtonBaseStyle = (btn) => {
        btn.style.position = "relative";
        btn.style.overflow = "hidden";
    };

    const ensureVoteBar = (btn) => {
        let bar = btn.querySelector(".entry-vote-bar");
        if (!bar) {
            bar = document.createElement("span");
            bar.className = "entry-vote-bar";
            bar.setAttribute("aria-hidden", "true");
            btn.insertBefore(bar, btn.firstChild);
        }
        bar.style.position = "absolute";
        bar.style.left = "0";
        bar.style.top = "0";
        bar.style.height = "100%";
        bar.style.width = "0%";
        bar.style.background = "rgba(249, 214, 122, 0.30)";
        bar.style.pointerEvents = "none";
        bar.style.display = "none";
        bar.style.zIndex = "0";
        return bar;
    };

    const renderChosenIcon = () => {
        clearBtn.querySelectorAll(".entry-vote-chosen-icon").forEach((el) => el.remove());
        unclearBtn.querySelectorAll(".entry-vote-chosen-icon").forEach((el) => el.remove());

        if (!hasVoted) return;
        if (selectedChoice !== "clear" && selectedChoice !== "unclear") return;

        const targetBtn = selectedChoice === "clear" ? clearBtn : unclearBtn;
        const icon = document.createElement("img");
        icon.className = "entry-vote-chosen-icon";
        icon.src = "assets/images/chosen.svg";
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");
        icon.style.position = "absolute";
        icon.style.left = "10px";
        icon.style.top = "50%";
        icon.style.transform = "translateY(-2px)";
        icon.style.width = "7px";
        icon.style.height = "6px";
        icon.style.pointerEvents = "none";
        icon.style.display = "block";
        icon.style.zIndex = "2";
        targetBtn.appendChild(icon);
    };

    setVoteButtonBaseStyle(clearBtn);
    setVoteButtonBaseStyle(unclearBtn);
    const clearBar = ensureVoteBar(clearBtn);
    const unclearBar = ensureVoteBar(unclearBtn);
    clearText.style.position = "relative";
    clearText.style.zIndex = "1";
    unclearText.style.position = "relative";
    unclearText.style.zIndex = "1";

    noteEl.style.display = isVoteSyncConnected() ? "none" : "block";

    const existingVote = getUserVote(currentWord.id);
    let selectedChoice = existingVote || null;
    let hasVoted = Boolean(existingVote);
    let displayedStats = hasVoted ? getWordVoteStats(currentWord.id) : toVoteStats(0, 0);

    const setSelected = () => {
        clearBtn.classList.toggle("is-selected", selectedChoice === "clear");
        unclearBtn.classList.toggle("is-selected", selectedChoice === "unclear");
        clearBtn.style.borderColor = selectedChoice === "clear" ? "#F9D67A" : "";
        unclearBtn.style.borderColor = selectedChoice === "unclear" ? "#F9D67A" : "";
        renderChosenIcon();
    };

    const renderVoteState = (stats, voted) => {
        const normalizedStats = normalizeVoteStats(stats);
        displayedStats = normalizedStats;
        clearText.textContent = voted ? `${labels.clear} ${normalizedStats.clearPct}%` : labels.clear;
        unclearText.textContent = voted ? `${labels.unclear} ${normalizedStats.unclearPct}%` : labels.unclear;
        clearBar.style.display = voted ? "block" : "none";
        unclearBar.style.display = voted ? "block" : "none";
        clearBar.style.width = voted ? `${normalizedStats.clearPct}%` : "0%";
        unclearBar.style.width = voted ? `${normalizedStats.unclearPct}%` : "0%";
        clearBtn.classList.toggle("is-voted", voted);
        unclearBtn.classList.toggle("is-voted", voted);
        setSelected();
        if (voted) {
            submitBtn.style.display = "none";
        } else {
            submitBtn.style.display = "";
        }
    };

    renderVoteState(displayedStats, hasVoted);

    const loadServerStats = async () => {
        try {
            const wordKey = String(currentWord.id);
            const shouldForceSessionRefresh = !voteStatsSessionRefreshedWordIds.has(wordKey);
            let serverStats = await fetchServerWordVoteStats(currentWord.id, { force: shouldForceSessionRefresh });
            voteStatsSessionRefreshedWordIds.add(wordKey);
            const pendingChoice = getPendingVoteChoice(currentWord.id);
            if (pendingChoice) {
                serverStats = applyVoteChoiceToStats(serverStats, pendingChoice);
            }
            renderVoteState(serverStats, hasVoted);
        } catch (_) {
            renderVoteState(hasVoted ? getWordVoteStats(currentWord.id) : displayedStats, hasVoted);
        }
    };

    loadServerStats();
    if (hasVoted) return;
    

    clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedChoice = "clear";
        setSelected();
    });

    unclearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedChoice = "unclear";
        setSelected();
    });

    submitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!selectedChoice) return;
        const stats = submitWordVote(currentWord.id, selectedChoice);
        if (!stats) return;

        hasVoted = true;
        renderVoteState(applyVoteChoiceToStats(displayedStats, selectedChoice), true);
        enqueueVoteSync(currentWord.id, selectedChoice);
        syncVoteQueue();
    });
}

function filterProposer(name) {
    const focusedWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!focusedWord) return [];

    // Build container for words of same proposer.
    const relatedContainer = document.createElement("div");
    relatedContainer.classList = `related-words`;
    relatedContainer.innerHTML = '';

    // Find words with save proposer
    const relatedWords = window.allWords.filter(w => {
        if (w.id === focusedWord.id) return false;
        return Array.isArray(w.proposers) && w.proposers.some(p => p.name === name);
    });

    relatedWords.forEach(w => {
        const link = document.createElement('div');
        link.id = `related-${w.id}`;
        link.textContent = w.term;
        link.style.display = 'block';

        // Navigate to the clicked related word.
        link.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetNodeId = link.id.replace('related-', '');
            const fromWordId = state.focusedNodeId;
            endWordView("switch");
            startWordView(targetNodeId);
            logEvent("link_click", { fromWordId, toWordId: targetNodeId });
            await zoomToWord(targetNodeId, state.currentScale, { animated: true, duration: 800 });
            updateWordFocus(targetNodeId);

            renderPanelSections();
            updateTabContent("book");
        });

        relatedContainer.appendChild(link);
    });
    return relatedContainer;
}


// Floating panel visibility and layout
export function showFloatingPanel() {
    const panel = getFloatingPanel();
    if (!panel) return;
    panel.classList.remove('hidden');
    isPanelVisible = true;
    document.dispatchEvent(new CustomEvent('floating-panel:show'));

    ensureExpandButton();
    
    // Render both panels
    renderPanelSections();
    renderCommentSection();

    // Reset tab button state and active panels.
    const allTabs = queryAllFloating('.panel-tabs button');
    allTabs.forEach(btn => btn.classList.remove('active'));
    const entryTabs = queryAllFloating('.panel-tabs button[data-tab="entry"]');
    entryTabs.forEach(tab => tab.classList.add('active'));

    // Default to the entry panel.
    const entryPanel = queryFloating('.panel-entry');
    const commentPanel = queryFloating('.panel-comment');
    if (entryPanel) entryPanel.classList.add('active');
    if (commentPanel) commentPanel.classList.remove('active');
    currentTab = "entry";

    const view = document.getElementById("universe-view");
    view.style.left = "-18vw";

    const relationLines = document.getElementById("connection-lines");

    relationLines.style.left = "18vw";
    updateRelations();
    setTimeout(updateRelations, 75);
    setTimeout(updateRelations, 150);
    setTimeout(updateRelations, 225);
    setTimeout(updateRelations, 300);
    setTimeout(updateRelations, 600);
    
    // Bind scroll-related handlers after panel content is rendered.
    setTimeout(() => {
        updateScrollHandlers();
    }, 100);
}

function ensureExpandButton() {
    let expandBtn = document.getElementById('expand-btn');

    if (!expandBtn) {
        // expand/collapse button.
        expandBtn = document.createElement('button');
        expandBtn.id = 'expand-btn';

        expandBtn.style.cssText = `
            position: absolute;
            left: calc(-1vw - 68px - 40px);
            top: 20px;
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            width: 40px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        // Build button markup (edge line + arrow icon).
        expandBtn.innerHTML = `
            <div class="expand-btn-content" style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                position: relative;
            ">
                <!-- vertical line -->
                <div class="edge-line" style="
                    width: 2px;
                    height: 20px;
                    background-color: #FFFCF4;
                    border-radius: 1px;
                    margin-right: 1px;
                "></div>

                <!-- arrow -->
                <div class="arrow-container" style="
                    transition: transform 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFCF4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <!-- arrow stroke -->
                        <polyline points="11,18 5,12 11,6"></polyline>
                        <!-- horizontal arrow line -->
                        <line x1="5" y1="12" x2="20" y2="12"></line>
                    </svg>
                </div>
            </div>
        `;


        // Toggle panel width on click.
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanelWidth();
        });

        // Attach button to the floating panel.
        const panel = getFloatingPanel();
        if (!panel) return;
        panel.appendChild(expandBtn);

        // Inject animation styles once.
        if (!document.getElementById('expand-btn-styles')) {
            const style = document.createElement('style');
            style.id = 'expand-btn-styles';
            style.textContent = `
                #expand-btn .arrow-container {
                    animation: poke 5s ease-in-out infinite;
                }
                
                #expand-btn.expanded .arrow-container {
                    transform: rotate(180deg);
                    animation: none;
                }
                
                @keyframes poke {
                    0%, 20%, 100% { 
                        transform: translateX(0); 
                    }
                    10% { 
                        transform: translateX(-4px); 
                    }
                    15% {
                        transform: translateX(0);
                    }
                    30% { 
                        transform: translateX(-4px); 
                    }
                    35% {
                        transform: translateX(0);
                    }
                }
                
                #expand-btn:hover .arrow-container {
                    transform: translateX(-2px);
                }
                
                #expand-btn.expanded:hover .arrow-container {
                    transform: rotate(180deg) translateX(-2px);
                }
            `;
            document.head.appendChild(style);
        }

    }
}

function togglePanelWidth() {
    const panel = getFloatingPanel();
    const expandBtn = document.getElementById('expand-btn');

    if (!panel || !expandBtn) return;

    isExpanded = !isExpanded;

    if (isExpanded) {
        panel.classList.add('expanded');
        expandBtn.classList.add('expanded');
        const overlay = document.getElementById("overlay");
        overlay.classList.remove("hidden");
    } else {
        panel.classList.remove('expanded');
        expandBtn.classList.remove('expanded');
        const overlay = document.getElementById("overlay");
        overlay.classList.add("hidden");
    }
}


export function hideFloatingPanel() {
    const panel = getFloatingPanel();
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('expanded');
    isPanelVisible = false;
    isExpanded = false;

    // Remove expand button and reset expanded state.
    let expandBtn = document.getElementById('expand-btn');
    if (expandBtn) {
        expandBtn.remove();
    }

    // Restore all tab strips.
    const allTabs = queryAllFloating('.panel-tabs');
    allTabs.forEach(tabs => {
        if (tabs) tabs.style.display = 'flex';
    });

    // Restore scroll markers.
    const scrollTrack = queryFloating('.scroll-track');
    if (scrollTrack) {
        const scrollMarkers = scrollTrack.querySelectorAll('.scroll-marker');
        scrollMarkers.forEach(marker => marker.style.display = 'block');
    }

    const view = document.getElementById("universe-view");
    view.style.left = "0";

    const relationLines = document.getElementById("connection-lines");

    relationLines.style.left = "0";

    updateRelations();
    setTimeout(updateRelations, 75);
    setTimeout(updateRelations, 150);
    setTimeout(updateRelations, 225);
    setTimeout(updateRelations, 300);
    setTimeout(updateRelations, 600);
    setTimeout(updateWordFocus, 300);

}

// Section title labels (zh/en)
const sectionTitles = {
    brief: { zh: "简要释义", en: "Definition" },
    example: { zh: "例句", en: "e.g." },
    proposers: { zh: "提出者", en: "Proponent" },
    source: { zh: "出处", en: "Source" },
    relatedWorks: { zh: "相关著作", en: "Related Works" },
    contributors: { zh: "贡献者", en: "Contributors" },
    editors: { zh: "编辑", en: "Edit" }
};


export function normalizeLang(code) {
    const v = (code || "").toLowerCase();
    return v.startsWith("en") ? "en" : "zh";
}

function resolveImagePath(src) {
    if (!src) return "";
    if (src.startsWith("http") || src.startsWith("data:") || src.startsWith("/")) return src;
    if (src.startsWith("images/")) return `/content/draft/${src}`;
    return src;
}

function getCaptionText(caption, lang) {
    if (caption === null || caption === undefined) return "";
    if (typeof caption === "string") return caption;
    if (typeof caption === "object") {
        return caption?.[lang] || caption?.zh || caption?.en || "";
    }
    return "";
}

function buildDiagramCarousel(items, lang, options = {}) {
    if (!Array.isArray(items) || items.length === 0) return null;

    let currentIndex = 0;
    const arrowLeftSrc = options.arrowLeftSrc || "assets/images/left_arrow.svg";
    const arrowRightSrc = options.arrowRightSrc || "assets/images/right_arrow.svg";

    const carousel = document.createElement("div");
    carousel.className = "diagram-carousel";

    const stage = document.createElement("div");
    stage.className = "diagram-stage";

    const leftBtn = document.createElement("button");
    leftBtn.className = "diagram-arrow diagram-arrow-left";
    leftBtn.type = "button";
    leftBtn.setAttribute("aria-label", "Previous image");
    leftBtn.innerHTML = `<img src="${arrowLeftSrc}" alt="">`;

    const rightBtn = document.createElement("button");
    rightBtn.className = "diagram-arrow diagram-arrow-right";
    rightBtn.type = "button";
    rightBtn.setAttribute("aria-label", "Next image");
    rightBtn.innerHTML = `<img src="${arrowRightSrc}" alt="">`;

    const img = document.createElement("img");
    img.className = "diagram-image";
    img.alt = "diagram image";
    img.loading = "lazy";
    img.decoding = "async";

    const caption = document.createElement("p");
    caption.className = "diagram-caption";

    const source = document.createElement("p");
    source.className = "diagram-source";

    function renderAt(index) {
        const safeIndex = Math.max(0, Math.min(index, items.length - 1));
        currentIndex = safeIndex;
        const item = items[safeIndex] || {};
        img.src = resolveImagePath(item.src);
        caption.innerHTML = applyHashItalics(getCaptionText(item.caption, lang));
        if (options.includeSource) {
            source.innerHTML = applyHashItalics(getCaptionText(item.source, lang));
        } else {
            source.innerHTML = "";
        }

        leftBtn.classList.toggle("is-hidden", safeIndex === 0);
        rightBtn.classList.toggle("is-hidden", safeIndex === items.length - 1);
    }

    leftBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentIndex > 0) renderAt(currentIndex - 1);
    });

    rightBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentIndex < items.length - 1) renderAt(currentIndex + 1);
    });

    stage.appendChild(leftBtn);
    stage.appendChild(img);
    stage.appendChild(rightBtn);
    carousel.appendChild(stage);
    carousel.appendChild(caption);
    if (options.includeSource) {
        carousel.appendChild(source);
    }

    renderAt(0);
    return carousel;
}

export function renderPanelSections() {
    let currentWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!currentWord) return;

    const lang = normalizeLang(state.currentLang || "zh");

    scrollToTop('entry');

    const entryPanel = queryFloating('.panel-entry');
    if (!entryPanel) return;

    // Upper section
    const title = entryPanel.querySelector('.panel-top');
    const displayTermOri = getDisplayOriText(currentWord.termOri, lang, currentWord.term?.zh || "");
    title.innerHTML = `
    <p> ${String(currentWord.id).padStart(4, '0')} </p>
    <img src = "${resolveImagePath(currentWord.concept_image)}" alt = "concept image" loading="lazy" decoding="async"></img> 
    <div>
    <div class = "term-main"> ${currentWord.term?.[lang] || '未知单词'} </div>
    ${displayTermOri ? `<div class = "term-ori"> ${displayTermOri} </div>` : ""}</div>
    `

    // Lower section
    const bottomDiv = entryPanel.querySelector('.panel-bottom');
    bottomDiv.innerHTML = `
        <section id="section-brief"> </section>
        <section id="section-extended"> </section>
        <section id="section-example"> </section>
        <section id="section-proposers"> </section>
        <section id="section-source"> </section>
        <section id="section-related-works"> </section>
        <section id="section-understanding-vote"> </section>
        <section id="section-contributors"> </section>
        <section id="section-contact"> </section>
        <section id="section-editors"> </section>
    `;

    const briefSec = document.getElementById("section-brief");
    const extendedSec = document.getElementById("section-extended");
    const exampleSec = document.getElementById("section-example");
    const proposerSec = document.getElementById("section-proposers");
    const sourceSec = document.getElementById("section-source");
    const relatedSec = document.getElementById("section-related-works");
    const voteSec = entryPanel.querySelector("#section-understanding-vote");
    const contributorsSec = entryPanel.querySelector("#section-contributors");
    const contactSec = entryPanel.querySelector("#section-contact");
    const editorsSec = entryPanel.querySelector("#section-editors");

    const briefRaw = currentWord.brief_definition?.[lang] || "\u6682\u65e0\u7b80\u8981\u91ca\u4e49";
    const briefText = applyHashItalics(ensureTerminalPunctuation(briefRaw, lang));
    briefSec.innerHTML = `<p class="left-title">${sectionTitles.brief[lang]}</p>
                       <div>
                           <h3>${briefText}</h3>
                      </div>`;

    const extendedTitle = lang === "zh" ? "详细释义" : "Description";
    const extendedValue = currentWord.extended_definition?.[lang];
    const extendedParts = Array.isArray(extendedValue)
        ? extendedValue
        : (extendedValue ? [extendedValue] : ["\u6682\u65e0\u8be6\u7ec6\u91ca\u4e49"]);
    extendedSec.innerHTML = `<p class="left-title">${extendedTitle}</p>
                        <div>
                            ${extendedParts.map(p => `<p>${applyHashItalics(p)}</p>`).join("")}
                        </div>`;

    const exampleValue = currentWord.example_sentence?.[lang];
    const exampleHtml = Array.isArray(exampleValue)
        ? exampleValue.map(p => `<p>${applyHashItalics(p)}</p>`).join("")
        : `<p>${applyHashItalics(exampleValue || '暂无例句')}</p>`;
    exampleSec.innerHTML = `<p class="left-title">${sectionTitles.example[lang]}</p>
                        <div class="example-text">
                            ${exampleHtml}
                            <div class="diagram-container"></div>
                        </div>`;

    const diagramContainer = entryPanel.querySelector(".diagram-container");
    if (currentWord.diagrams && currentWord.diagrams.length > 0) {
        const diagramItems = currentWord.diagrams.map(d => ({ src: d?.src, caption: d?.caption, source: d?.source }));
        const carousel = buildDiagramCarousel(diagramItems, lang, { includeSource: false });
        if (carousel) diagramContainer.appendChild(carousel);
    }

    proposerSec.innerHTML = `<p class="left-title">${sectionTitles.proposers[lang]}</p>
                        <div id="proposers-container"> </div>`;
    const proposersContainer = document.getElementById("proposers-container");
    let proposers = currentWord.proposers;
    proposers.forEach((proposer) => {
        const proposerBlock = document.createElement("div");
        proposerBlock.classList = "proposer-block";
        proposerBlock.innerHTML = `
        <img alt="proposer's img" src=${resolveImagePath(proposer.image)} loading="lazy" decoding="async"></img>
        <div>
            <p class="proposer-name">${proposer.name?.[lang]}</p>
            <p class="proposer-year">${proposer.year?.[lang] || proposer.year?.zh || proposer.year?.en || proposer.year || ""}</p>
            <p class="proposer-year">${proposer.role?.[lang]}</p>
        </div>
    `;

        const relatedContainer = filterProposer(proposer.name);
        proposersContainer.appendChild(proposerBlock);
    })

    sourceSec.innerHTML = `<p class="left-title">${sectionTitles.source[lang]}</p>
                        <div>
                            <p>${applyHashItalics(currentWord.source?.[lang] || '暂无出处')}</p>
                        </div>`;

    const relatedWorks = Array.isArray(currentWord.related_works) ? currentWord.related_works : [];
    const relatedHtml = relatedWorks.length
        ? relatedWorks.map(work => `<p>${applyHashItalics(work?.[lang] || "")}</p>`).join("")
        : `<p>${lang === "en" ? "No related works yet." : "暂无相关著作"}</p>`;
    relatedSec.innerHTML = `<p class="left-title">${sectionTitles.relatedWorks[lang]}</p>
                        <div id="related-works-container">
                        ${relatedHtml}
                        </div>`;
    renderUnderstandingVoteSection(voteSec, currentWord, lang);

    const contributors = Array.isArray(currentWord.contributors) ? currentWord.contributors : [];
    const contributorNames = contributors.map(c => {
        const name = c?.name?.[lang] || "";
        const role = c?.role?.[lang] || "";
        return name ? `${name}${role ? ` (${role})` : ""}` : "";
    }).filter(Boolean);
    const contributorText = contributorNames.length
        ? (lang === "en"
            ? `The contributor for this entry is ${contributorNames.join(", ")}.`
            : `本期词条的贡献者是${contributorNames.join(", ")}。`)
        : (lang === "en" ? "No contributor information yet." : "暂无贡献者信息");
    contributorsSec.innerHTML = `<p>${contributorText}</p>`;

    const contactPrimaryText = lang === "en" ? "Please feel free to email us at the address below to report any errors or inaccuracies in our content; you are also welcome to submit entries for terms you are interested in. " : "欢迎邮件以下邮箱，告知我们内容上的讹误或不准确的地方，您也可以邮件投稿您感兴趣的词条。";
    const contactSecondaryText = "hello@dunesworkshop.org";
    if (contactSec) {
        contactSec.innerHTML = `
                            <div>
                                <p>${contactPrimaryText}</p>
                                <p>${contactSecondaryText}</p>
                            </div>`;
    }

    editorsSec.innerHTML = `<p class="left-title">${sectionTitles.editors[lang]}</p>
                        <div id="editors-container">
                        ${currentWord.editors.map(editor => `<p>${applyHashItalics(editor?.[lang])}</p>`).join('')}
                        </div>`

    setupLazyImages(entryPanel);
    renderScrollMarkers('entry');
}

function renderCommentSection() {
    let currentWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!currentWord) return;

    const lang = normalizeLang(state.currentLang || "zh");

    scrollToTop('comment');

    const commentPanel = queryFloating('.panel-comment');
    if (!commentPanel) return;
    const panelMain = commentPanel.querySelector('.panel-main');

    // Upper section
    const title = commentPanel.querySelector('.panel-top');
    const echoHeading = lang === "en" ? "Echoes" : "回声";
    const echoIntro = lang === "en"
        ? "From personal narratives, field notes, to multidisciplinary dialogues, these echoes translate abstract entries into concrete lived experiences."
        : "基于词条撰写的个人视角、田野观察与对话，将抽象概念引入具体的生命经验";
    title.innerHTML = `
    <div class="comment-top-id">${String(currentWord.id).padStart(4, '0')}</div>
    <div class="comment-top-center">
        <div class="term-main">${currentWord.term?.[lang] || (lang === "en" ? "Unknown term" : "未知词条")}</div>
        <div class="comment-top-echoes">${echoHeading}</div>
        <p class="comment-top-intro">${echoIntro}</p>
    </div>
    `

    const contentScroll = commentPanel.querySelector('.panel-bottom');
    const comments = Array.isArray(currentWord.comments) ? currentWord.comments : [];
    const emptyCommentsLabel = lang === "en" ? "No comments" : "暂无评论";
    const likedAriaLabel = lang === "en" ? "Unlike this comment" : "取消喜欢这条评论";
    const unlikedAriaLabel = lang === "en" ? "Like this comment" : "喜欢这条评论";
    contentScroll.innerHTML = `
        ${comments.length ? comments.map((c, idx) => {
            const roleLabel = c?.role?.[lang] || "";
            const nameLabel = c?.author?.[lang] || "";
            const fallbackLabel = lang === "en" ? `Note ${idx + 1}` : `??${idx + 1}`;
            const titleLabel = (roleLabel || nameLabel)
                ? `${roleLabel}${roleLabel && nameLabel ? "<br>" : ""}${nameLabel}`
                : fallbackLabel;
            const rawContent = c?.content?.[lang];
            const contentParts = Array.isArray(rawContent)
                ? rawContent
                : (typeof rawContent === "string" ? rawContent.split(/\r?\n|\u2028/) : []);
            const content = contentParts.length
                ? contentParts.map(p => `<p>${applyHashItalics(p)}</p>`).join("")
                : "";
            const images = Array.isArray(c?.images) ? c.images : [];
            const imagesHtml = images.length
                ? (idx === 0
                    ? `<div class="note-images note-images-carousel"></div>`
                    : `<div class="note-images">
                        ${images.map(img => {
                            const cap = applyHashItalics(getCaptionText(img?.caption, lang));
                            return `
                                <img src="${resolveImagePath(img?.src)}" alt="note image" loading="lazy" decoding="async">
                                ${cap ? `<p class="diagram-caption">${cap}</p>` : ""}
                            `;
                        }).join("")}
                      </div>`)
                : "";
            const liked = isCommentLiked(currentWord.id, idx);
            const ariaLabel = liked ? likedAriaLabel : unlikedAriaLabel;
            return `<section>
                <button
                    type="button"
                    class="note-like-toggle${liked ? " is-liked" : ""}"
                    data-comment-index="${idx}"
                    aria-pressed="${liked ? "true" : "false"}"
                    aria-label="${ariaLabel}"
                ><span class="note-like-count" aria-hidden="true"></span></button>
                <p class="left-title">${titleLabel}</p>
                <div class="note-body"><br><br><br><br>${content}${imagesHtml}</div>
            </section>`;
        }).join('') : emptyCommentsLabel}

        <section id="section-contributors"> </section>
        <section id="section-contact"> </section>
        <section id="section-editors"> </section>        
    `;

    const contributorsSec = commentPanel.querySelector("#section-contributors");
    const contactSec = commentPanel.querySelector("#section-contact");
    const editorsSec = commentPanel.querySelector("#section-editors");

    const contributorsInComment = Array.isArray(currentWord.contributors) ? currentWord.contributors : [];
    const contributorNamesInComment = contributorsInComment.map(c => {
        const name = c?.name?.[lang] || "";
        const role = c?.role?.[lang] || "";
        return name ? `${name}${role ? ` (${role})` : ""}` : "";
    }).filter(Boolean);
    const contributorTextInComment = contributorNamesInComment.length
        ? (lang === "en"
            ? `The contributor for this entry is ${contributorNamesInComment.join(", ")}.`
            : `本期词条的贡献者是${contributorNamesInComment.join(", ")}。`)
        : (lang === "en" ? "No contributor information yet." : "暂无贡献者信息");
    contributorsSec.innerHTML = `<p>${contributorTextInComment}</p>`;

    const contactPrimaryTextInComment = lang === "en" ? "If you have any historical anecdotes or extended reflections regarding this entry, or if you have experienced a direct connection between this theoretical concept and daily life, we welcome you to submit your echoes to the following email address: " : "如果您知道关于这个词条的历史趣闻，延展思考或者能感受到过这个理论概念与生活的直接联系，欢迎将你的回声投稿至以下邮箱。";
    const contactSecondaryTextInComment = "hello@dunesworkshop.org";
    if (contactSec) {
        contactSec.innerHTML = `
                            <div>
                                <p>${contactPrimaryTextInComment}</p>
                                <p>${contactSecondaryTextInComment}</p>
                            </div>`;
    }

    editorsSec.innerHTML = `<p class="left-title">${sectionTitles.editors[lang]}</p>
                        <div id="editors-container">
                        ${currentWord.editors.map(editor => `<p>${applyHashItalics(editor?.[lang])}</p>`).join('')}
                        </div>`

    const firstComment = comments[0];
    const firstImages = Array.isArray(firstComment?.images) ? firstComment.images : [];
    if (firstImages.length > 0) {
        const target = contentScroll.querySelector(".note-images-carousel");
        if (target) {
            const items = firstImages.map(img => ({ src: img?.src, caption: img?.caption, source: img?.source }));
            const carousel = buildDiagramCarousel(items, lang, {
                includeSource: true,
                arrowLeftSrc: "assets/images/left_arrow_dark.svg",
                arrowRightSrc: "assets/images/right_arrow_dark.svg"
            });
            if (carousel) target.appendChild(carousel);
        }
    }

    // Add collapse/expand behavior for each note section.
    const likeButtons = contentScroll.querySelectorAll(".note-like-toggle");
    likeButtons.forEach((btn) => {
        btn.addEventListener("mousedown", (e) => {
            e.stopPropagation();
        });
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const commentIndex = Number(btn.dataset.commentIndex);
            if (!Number.isFinite(commentIndex)) return;
            const liked = toggleCommentLiked(currentWord.id, commentIndex);
            btn.classList.toggle("is-liked", liked);
            btn.setAttribute("aria-pressed", liked ? "true" : "false");
            btn.setAttribute("aria-label", liked ? likedAriaLabel : unlikedAriaLabel);
            enqueueCommentLikeSync(currentWord.id, commentIndex, liked, lang);
            syncVoteQueue();
            refreshCommentLikeBadges(contentScroll, currentWord.id, { force: true });
        });
    });
    refreshCommentLikeBadges(contentScroll, currentWord.id);

    const noteSections = Array.from(
        contentScroll.querySelectorAll('section:not(#section-contributors):not(#section-contact):not(#section-editors)')
    );

    const clearNoteLayout = ({ scrollToTop = false } = {}) => {
        contentScroll.classList.remove('notes-mode');
        if (panelMain) panelMain.classList.remove('notes-fixed');
        noteSections.forEach(sec => {
            sec.classList.remove('note-expanded', 'note-above', 'note-below', 'note-below-first');
            sec.scrollTop = 0;
        });
        if (scrollToTop && panelMain) {
            panelMain.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const applyNoteLayout = (activeSection) => {
        clearNoteLayout();
        if (!activeSection) return;
        contentScroll.classList.add('notes-mode');
        if (panelMain) panelMain.classList.add('notes-fixed');
        const activeIndex = noteSections.indexOf(activeSection);
        noteSections.forEach((sec, idx) => {
            if (idx < activeIndex) sec.classList.add('note-above');
            if (idx > activeIndex) sec.classList.add('note-below');
        });
        activeSection.classList.add('note-expanded');
        const firstBelow = noteSections[activeIndex + 1];
        if (firstBelow) firstBelow.classList.add('note-below-first');
    };

    noteSections.forEach(section => {
        section.addEventListener('click', (e) => {
            e.stopPropagation();
            if (section.classList.contains('note-expanded')) {
                clearNoteLayout({ scrollToTop: true });
                return;
            }
            applyNoteLayout(section);
        });
    });
}


// Tab switching
function initTabs() {
    // Bind click handlers to tab buttons across both panels.
    const allTabs = queryAllFloating('.panel-tabs button');
    allTabs.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent panel-level click handlers from firing.
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

// Tab edge-switch behavior

// Gesture threshold in pixels for tab switching.
const SWITCH_THRESHOLD = 280;

// Track the currently active tab.
let currentTab = "entry";

// currentTab is synchronized via tab click handlers.

function switchTab(tabName) {
    const entryPanel = queryFloating('.panel-entry');
    const commentPanel = queryFloating('.panel-comment');
    
    // Update active state on tab buttons.
    const allTabs = queryAllFloating('.panel-tabs button');
    allTabs.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Toggle active panel.
    if (tabName === "entry") {
        resetFloatingPanelState();
        if (entryPanel) entryPanel.classList.add('active');
        if (commentPanel) commentPanel.classList.remove('active');
    } else if (tabName === "comment") {
        if (commentPanel) commentPanel.classList.add('active');
        if (entryPanel) entryPanel.classList.remove('active');
    }
    
    currentTab = tabName;
    
    // Rebind scroll handlers for the active panel.
    updateScrollHandlers();
}

// Initialize tab interactions after tab helpers are defined.
initTabs();

// Scroll handlers are initialized from showFloatingPanel.

// Return the active panel's scroll container.
function getActivePanelMain() {
    const activePanel = queryFloating('.panel-entry.active, .panel-comment.active');
    return activePanel ? activePanel.querySelector('.panel-main') : null;
}

// Bind wheel behavior to the active panel.
function setupWheelHandler() {
    const panelMain = getActivePanelMain();
    if (!panelMain) return;
    
    // Remove stale listeners before rebinding.
    panelMain.removeEventListener("wheel", handleWheel);
    panelMain.addEventListener("wheel", handleWheel);
}

function handleWheel(e) {
    const panelMain = getActivePanelMain();
    if (!panelMain) return;
    
    const atBottom = panelMain.scrollTop + panelMain.clientHeight >= panelMain.scrollHeight - 2;
    const atTop = panelMain.scrollTop <= 2;

    if (currentTab === "entry" && atBottom && e.deltaY > SWITCH_THRESHOLD) {
        switchTab("comment");
    } else if (currentTab === "comment" && atTop && e.deltaY < -SWITCH_THRESHOLD) {
        switchTab("entry");
    }
}

// Touch state for mobile swipe switching.
let touchStartY = 0;

function setupTouchHandlers() {
    const panelMain = getActivePanelMain();
    if (!panelMain) return;
    
    panelMain.removeEventListener("touchstart", handleTouchStart);
    panelMain.removeEventListener("touchend", handleTouchEnd);
    panelMain.addEventListener("touchstart", handleTouchStart);
    panelMain.addEventListener("touchend", handleTouchEnd);
}

function handleTouchStart(e) {
    touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e) {
    const panelMain = getActivePanelMain();
    if (!panelMain) return;
    
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    const atBottom = panelMain.scrollTop + panelMain.clientHeight >= panelMain.scrollHeight - 2;
    const atTop = panelMain.scrollTop <= 2;

    if (currentTab === "entry" && atBottom && deltaY < -SWITCH_THRESHOLD) {
        switchTab("comment");
    } else if (currentTab === "comment" && atTop && deltaY > SWITCH_THRESHOLD) {
        switchTab("entry");
    }
}




// Scroll to the top of the selected panel.
export function scrollToTop(panelType = 'entry') {
    const panel = panelType === 'entry' 
        ? queryFloating('.panel-entry')
        : queryFloating('.panel-comment');
    
    if (!panel) return;
    
    const panelMain = panel.querySelector('.panel-main');
    if (!panelMain) return;

    panelMain.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// Reset panels to default state (top + comments collapsed)
export function resetFloatingPanelState() {
    const entryPanel = queryFloating('.panel-entry');
    if (entryPanel) {
        const entryMain = entryPanel.querySelector('.panel-main');
        if (entryMain) {
            entryMain.scrollTo({ top: 0, behavior: "auto" });
        }
    }

    const commentPanel = queryFloating('.panel-comment');
    if (!commentPanel) return;

    const commentMain = commentPanel.querySelector('.panel-main');
    if (commentMain) {
        commentMain.scrollTo({ top: 0, behavior: "auto" });
        commentMain.classList.remove('notes-fixed');
    }

    const contentScroll = commentPanel.querySelector('.panel-bottom');
    if (!contentScroll) return;

    contentScroll.classList.remove('notes-mode');
    const noteSections = contentScroll.querySelectorAll('section:not(#section-contributors):not(#section-contact):not(#section-editors)');
    noteSections.forEach((sec) => {
        sec.classList.remove('note-expanded', 'note-above', 'note-below', 'note-below-first');
        sec.scrollTop = 0;
    });
}

// Scroll panel content to the section mapped from a detail shortcut.
function updateTabContent(tabType = "brief") {
    const panel = getFloatingPanel();
    if (!panel) return;
    const panelMain = panel.querySelector('.panel-main');

    if (!panelMain) return;

    // Map detail shortcut type to section id.
    const sectionMap = {
        contributors: "section-contributors",
        related: "section-related-works",
        source: "section-source",
        proposers: "section-proposers",
        example: "section-example",
        brief: "section-brief"
    };

    const targetId = sectionMap[tabType] || sectionMap["brief"];
    const targetSection = document.getElementById(targetId);

    if (targetSection) {
        targetSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

// Scroll marker/thumb configuration.
const SCROLL_CONFIG = {
    thumbMargin: 0, // Top/bottom margin for thumb movement.
    thumbSize: 14 // Visual size of the thumb.
};

// Rebind scroll handlers and marker interactions to the active panel.
function updateScrollHandlers() {
    const activePanel = queryFloating('.panel-entry.active, .panel-comment.active');
    if (!activePanel) return;
    
    const panelMain = activePanel.querySelector('.panel-main');
    const scrollThumb = activePanel.querySelector('.scroll-thumb');
    const scrollTrack = activePanel.querySelector('.scroll-track');
    
    if (!panelMain || !scrollThumb || !scrollTrack) return;
    
    // Remove old listener first.
    panelMain.removeEventListener("scroll", handleScroll);
    // Attach listener for current panel.
    panelMain.addEventListener("scroll", handleScroll);
    
    // Sync thumb position immediately.
    handleScroll();
    
    // Rebind drag behavior.
    setupScrollDrag(scrollThumb, panelMain);
    
    // Rebind wheel and touch switching.
    setupWheelHandler();
    setupTouchHandlers();
}

// Update thumb position based on content scroll.
function handleScroll() {
    const activePanel = queryFloating('.panel-entry.active, .panel-comment.active');
    if (!activePanel) return;
    
    const panelMain = activePanel.querySelector('.panel-main');
    const scrollThumb = activePanel.querySelector('.scroll-thumb');
    if (!panelMain || !scrollThumb) return;
    
    const scrollTop = panelMain.scrollTop;
    const contentHeight = panelMain.scrollHeight;
    const visibleHeight = panelMain.clientHeight;

    const trackHeight = panelMain.clientHeight;
    const thumbHeight = scrollThumb.offsetHeight;

    const thumbActiveRange = trackHeight - (SCROLL_CONFIG.thumbMargin * 2) - thumbHeight;

    if (contentHeight <= visibleHeight) {
        scrollThumb.style.display = 'none';
        return;
    }

    const scrollRatio = scrollTop / (contentHeight - visibleHeight);

    const thumbTop = SCROLL_CONFIG.thumbMargin + scrollRatio * thumbActiveRange;
    scrollThumb.style.display = 'block';
    scrollThumb.style.top = `${thumbTop}px`;
}


// Thumb drag state
let isDragging = false;
let startY, startTop;
let currentScrollThumb = null;
let currentPanelMain = null;

function setupScrollDrag(scrollThumb, panelMain) {
    // Remove previous thumb binding if present.
    if (currentScrollThumb) {
        currentScrollThumb.removeEventListener('mousedown', handleThumbMouseDown);
    }
    
    currentScrollThumb = scrollThumb;
    currentPanelMain = panelMain;
    
    scrollThumb.addEventListener('mousedown', handleThumbMouseDown);
}

function handleThumbMouseDown(e) {
    if (!currentScrollThumb || !currentPanelMain) return;
    
    isDragging = true;
    startY = e.clientY;
    startTop = parseFloat(currentScrollThumb.style.top) || SCROLL_CONFIG.thumbMargin;
    document.body.style.userSelect = 'none';
}

document.addEventListener('mousemove', (e) => {
    if (!isDragging || !currentPanelMain || !currentScrollThumb) return;

    const deltaY = e.clientY - startY;
    const trackHeight = currentPanelMain.clientHeight;
    const thumbActiveRange = trackHeight - (SCROLL_CONFIG.thumbMargin * 2);

    // Clamp thumb position to its active range.
    let newTop = Math.min(
        Math.max(startTop + deltaY, SCROLL_CONFIG.thumbMargin),
        SCROLL_CONFIG.thumbMargin + thumbActiveRange
    );

    currentScrollThumb.style.top = `${newTop}px`;

    // Derive content scroll from thumb position.
    const thumbRatio = (newTop - SCROLL_CONFIG.thumbMargin) / thumbActiveRange;
    currentPanelMain.scrollTop = thumbRatio * (currentPanelMain.scrollHeight - currentPanelMain.clientHeight);
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = '';
});



function adjustMarkerTooltip(marker) {
    const tooltip = marker.querySelector('.scroll-tooltip');
    if (!tooltip) return;

    tooltip.style.setProperty('--tooltip-shift', '0px');
    tooltip.style.display = 'block';

    requestAnimationFrame(() => {
        const rect = tooltip.getBoundingClientRect();
        const padding = 6;
        let shift = 0;

        if (rect.bottom > window.innerHeight - padding) {
            shift -= rect.bottom - (window.innerHeight - padding);
        }
        if (rect.top < padding) {
            shift += padding - rect.top;
        }

        if (shift != 0) {
            tooltip.style.setProperty('--tooltip-shift', `${shift}px`);
        }
    });
}

function renderScrollMarkers(panelType = 'entry') {
    const panel = panelType === 'entry' 
        ? queryFloating('.panel-entry')
        : queryFloating('.panel-comment');
    
    if (!panel) return;

    const lang = normalizeLang(state.currentLang || "zh");
    
    const panelMain = panel.querySelector('.panel-main');
    const scrollTrack = panel.querySelector('.scroll-track');
    
    if (!panelMain || !scrollTrack) return;

    // Remove previous markers.
    scrollTrack.querySelectorAll(".scroll-marker").forEach(el => el.remove());

    const sections = [{
            id: "panel-top",
            label: { zh: "顶部", en: "Top" },
            isTop: true
        },
        {
            id: "section-brief",
            label: sectionTitles.brief
        },
        {
            id: "section-example",
            label: sectionTitles.example
        },
        {
            id: "section-proposers",
            label: sectionTitles.proposers
        },
        {
            id: "section-source",
            label: sectionTitles.source
        },
        {
            id: "section-related-works",
            label: sectionTitles.relatedWorks
        },
        {
            id: "section-understanding-vote",
            label: { zh: "理解投票", en: "Vote" }
        },
        {
            id: "section-contributors",
            label: sectionTitles.contributors
        },
        {
            id: "section-contact",
            label: sectionTitles.contact
        },
        {
            id: "section-editors",
            label: sectionTitles.editors
        }
    ];

    const contentHeight = panelMain.scrollHeight;
    const visibleHeight = panelMain.clientHeight;
    const contentScrollableRange = contentHeight - visibleHeight;

    const trackHeight = scrollTrack.clientHeight;
    const thumbActiveRange = trackHeight - (SCROLL_CONFIG.thumbMargin * 2) - SCROLL_CONFIG.thumbSize;

    // Skip markers when content does not overflow.
    if (contentHeight <= visibleHeight) return;

    sections.forEach(sec => {
        let markerTop;
        let scrollTarget;

        if (sec.isTop) {
            // Keep top marker pinned to the top of thumb range.
            markerTop = SCROLL_CONFIG.thumbMargin;
            scrollTarget = 0;
        } else {
            const el = document.getElementById(sec.id);
            if (!el) return;

            // Section offset in panel content coordinates.
            const sectionTop = el.offsetTop;

            // Ratio when section reaches panel top.
            const scrollRatio = Math.min(sectionTop / contentScrollableRange, 1);

            // Map ratio into thumb active range.
            markerTop = SCROLL_CONFIG.thumbMargin + (scrollRatio * thumbActiveRange);
            scrollTarget = sectionTop;
        }

        // Create marker with tooltip and click target.
        const marker = document.createElement("div");
        marker.className = "scroll-marker";
        marker.style.top = `${markerTop}px`;

        const tooltip = document.createElement("div");
        tooltip.className = "scroll-tooltip";
        tooltip.textContent = sec.label?.[lang] || sec.label;
        marker.appendChild(tooltip);

        marker.addEventListener("mouseenter", () => {
            adjustMarkerTooltip(marker);
        });

        marker.addEventListener("mouseleave", () => {
            tooltip.style.removeProperty('--tooltip-shift');
            tooltip.style.display = "";
        });

        marker.addEventListener("click", () => {
            const currentPanelMain = panel.querySelector('.panel-main');
            if (currentPanelMain) {
                currentPanelMain.scrollTo({
                    top: scrollTarget,
                    behavior: "smooth"
                });
            }
        });

        scrollTrack.appendChild(marker);
    });
}

function renderCommentMarkers(panelType = 'comment') {
    const panel = panelType === 'comment' 
        ? queryFloating('.panel-comment')
        : queryFloating('.panel-entry');
    
    if (!panel) return;

    const lang = normalizeLang(state.currentLang || "zh");
    
    const panelMain = panel.querySelector('.panel-main');
    const scrollTrack = panel.querySelector('.scroll-track');
    
    if (!panelMain || !scrollTrack) return;

    // Remove previous markers.
    scrollTrack.querySelectorAll(".scroll-marker").forEach(el => el.remove());

    let currentWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!currentWord || !currentWord.comments) return;

    const comments = currentWord.comments;

    const contentHeight = panelMain.scrollHeight;
    const visibleHeight = panelMain.clientHeight;
    const contentScrollableRange = contentHeight - visibleHeight;

    const trackHeight = scrollTrack.clientHeight;
    const thumbActiveRange = trackHeight - (SCROLL_CONFIG.thumbMargin * 2) - SCROLL_CONFIG.thumbSize;

    // Skip markers when comments do not overflow.
    if (contentHeight <= visibleHeight) return;

    comments.forEach((c, idx) => {
        const sectionEl = panelMain.querySelectorAll("section")[idx];
        if (!sectionEl) return;

        // Section offset in panel content coordinates.
        const sectionTop = sectionEl.offsetTop;
        const scrollRatio = Math.min(sectionTop / contentScrollableRange, 1);

        const markerTop = SCROLL_CONFIG.thumbMargin + (scrollRatio * thumbActiveRange);

        const marker = document.createElement("div");
        marker.className = "scroll-marker";
        marker.style.top = `${markerTop}px`;

        const tooltip = document.createElement("div");
        tooltip.className = "scroll-tooltip";
        const authorLabel = c?.author?.[lang];
        const fallbackLabel = lang === "en" ? `Note ${idx + 1}` : `评论${idx + 1}`;
        tooltip.textContent = authorLabel || fallbackLabel;
        marker.appendChild(tooltip);

        marker.addEventListener("mouseenter", () => {
            adjustMarkerTooltip(marker);
        });

        marker.addEventListener("mouseleave", () => {
            tooltip.style.removeProperty('--tooltip-shift');
            tooltip.style.display = "";
        });

        marker.addEventListener("click", () => {
            const currentPanelMain = panel.querySelector('.panel-main');
            if (currentPanelMain) {
                currentPanelMain.scrollTo({
                    top: sectionTop,
                    behavior: "smooth"
                });
            }
        });

        scrollTrack.appendChild(marker);
    });
}


// Close floating panel when clicking outside.
function initClickOutsideHandler() {
    document.addEventListener('click', (e) => {
        const panel = getFloatingPanel();
        const aboutButton = document.getElementById("about-button");
        if (isPanelVisible && panel && !panel.contains(e.target) && !aboutButton.contains(e.target)) {
            hideFloatingPanel();
        }
    });
}

// Detail shortcuts -> scroll to corresponding sections
const commentDiv = document.getElementById("comment");
const proposerDiv = document.getElementById("proposer");
const imageDiv = document.getElementById("image");

// Click "Comment".
commentDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    showFloatingPanel();
    renderCommentSection();
    switchTab("comment");
    scrollToTop("comment");
});

// Click "Related works / Proposers".
proposerDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    showFloatingPanel();
    updateTabContent("proposers");
});

// Click "Image".
imageDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    showFloatingPanel();
    switchTab("entry");
    updateTabContent("source");
});

// Enable edge click to switch between entry/comment panels.
function initPanelClickHandlers() {
    const entryPanel = queryFloating('.panel-entry');
    const commentPanel = queryFloating('.panel-comment');
    
    // Click visible edge of entry panel to activate it.
    if (entryPanel) {
        entryPanel.addEventListener('click', (e) => {
            // Only handle edge click while this panel is inactive.
            if (!entryPanel.classList.contains('active')) {
                // Allow only clicks in the left visible edge area.
                const rect = entryPanel.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (clickX < 100) { // Allow clicks within the left 100px edge.
                    e.stopPropagation();
                    switchTab('entry');
                }
            }
        });
    }
    
    // Click visible edge of comment panel to activate it.
    if (commentPanel) {
        commentPanel.addEventListener('click', (e) => {
            // Only handle edge click while this panel is inactive.
            if (!commentPanel.classList.contains('active')) {
                // Allow only clicks in the left visible edge area.
                const rect = commentPanel.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (clickX < 100) { // Allow clicks within the left 100px edge.
                    e.stopPropagation();
                    switchTab('comment');
                }
            }
        });
    }
}

// Show the floating About view.
export function showAboutPanel() {
    const panel = document.getElementById('floating-panel');
    panel.classList.remove('hidden');
    isPanelVisible = true;

    ensureExpandButton();
    renderAboutContent();

    // Hide scroll markers while About view is displayed.
    const entryPanel = document.querySelector('.panel-entry');
    if (entryPanel) {
        const scrollTrack = entryPanel.querySelector('.scroll-track');
        if (scrollTrack) {
            const scrollMarkers = scrollTrack.querySelectorAll('.scroll-marker');
            scrollMarkers.forEach(marker => marker.style.display = 'none');
        }
    }
}

// Initialize floating panel behaviors.
initVoteSync();
initVoteResetHotkey();
initClickOutsideHandler();
initPanelClickHandlers();
document.addEventListener('about-panel:show', () => {
    if (isPanelVisible) {
        hideFloatingPanel();
    }
});


