import { state } from "./state.js";
import { zoomToWord, updateWordFocus } from "./wordFocus.js";

const HOTKEY_KEYS = new Set(["r", "s"]);
const DEFAULT_COOLDOWN_MS = 120000;
const DEFAULT_ANIMATION_DURATION_MS = 920;
const RATIO_OVERLAY_ID = "screen-ratio-overlay";
const RATIO_HIDE_DELAY_MS = 2000;
const RATIO_MAX_TERM = 40;

let initialized = false;
let isNavigating = false;
let comboLocked = false;
let cooldownMs = DEFAULT_COOLDOWN_MS;
let ratioHideTimer = null;
const pressedKeys = new Set();
const recentVisited = new Map();

function isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = String(target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
}

function normalizeHotkeyKey(event) {
    if (!event) return "";
    const key = String(event.key || "").toLowerCase();
    return HOTKEY_KEYS.has(key) ? key : "";
}

function toWordId(value) {
    if (value === null || value === undefined) return null;
    return String(value);
}

function normalizeContentText(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeContentText(item)).join(" ").trim();
    }
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function isPlaceholderContent(rawText) {
    const text = normalizeContentText(rawText);
    if (!text) return true;
    const normalized = text.replace(/\s+/g, "").toLowerCase();
    return (
        normalized === "暂无导读" ||
        normalized === "暂无筆記" ||
        normalized === "暂无笔记" ||
        normalized === "noguideyet." ||
        normalized === "noguideyet" ||
        normalized === "nocommentaryyet." ||
        normalized === "nocommentaryyet" ||
        normalized === "nonotesyet." ||
        normalized === "nonotesyet"
    );
}

function hasProposer(word) {
    if (!Array.isArray(word?.proposers) || word.proposers.length === 0) return false;
    const proposer = word.proposers.find(Boolean);
    if (!proposer) return false;
    const name = proposer.name || {};
    return Boolean(
        normalizeContentText(name.zh) ||
        normalizeContentText(name.en) ||
        normalizeContentText(name.ori)
    );
}

function hasSource(word) {
    const source = word?.source;
    if (!source || typeof source !== "object") return false;
    const zh = normalizeContentText(source.zh);
    const en = normalizeContentText(source.en);
    if (!zh && !en) return false;
    return !isPlaceholderContent(zh || en);
}

function hasGuide(word) {
    const content = word?.commentAbs?.content;
    if (!content || typeof content !== "object") return false;
    const zh = normalizeContentText(content.zh);
    const en = normalizeContentText(content.en);
    if (!zh && !en) return false;
    return !isPlaceholderContent(zh || en);
}

function isWordEligibleForRsJump(word) {
    if (!word || word.id === null || word.id === undefined) return false;
    return hasProposer(word) && hasSource(word) && hasGuide(word);
}

function getAllWordIds() {
    if (!Array.isArray(window.allWords)) return [];
    return window.allWords
        .map((word) => toWordId(word?.id))
        .filter(Boolean);
}

function getEligibleWordIds() {
    if (!Array.isArray(window.allWords)) return [];
    return window.allWords
        .filter((word) => isWordEligibleForRsJump(word))
        .map((word) => toWordId(word?.id))
        .filter(Boolean);
}

function getCurrentWord() {
    const focusedId = toWordId(state.focusedNodeId);
    if (!focusedId || !Array.isArray(window.allWords)) return null;
    return window.allWords.find((word) => toWordId(word?.id) === focusedId) || null;
}

function cleanupRecentVisited(now = Date.now()) {
    for (const [id, timestamp] of recentVisited.entries()) {
        if (!id || !Number.isFinite(timestamp) || now - timestamp > cooldownMs) {
            recentVisited.delete(id);
        }
    }
}

function isBlockedByCooldown(wordId, now = Date.now()) {
    const id = toWordId(wordId);
    if (!id) return true;
    const ts = recentVisited.get(id);
    return Number.isFinite(ts) && (now - ts) <= cooldownMs;
}

function pickRandom(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    const index = Math.floor(Math.random() * list.length);
    return list[index];
}

function dedupeIds(ids) {
    return Array.from(new Set((ids || []).map((id) => toWordId(id)).filter(Boolean)));
}

function getRelatedWordIds(currentWord) {
    if (!currentWord || !Array.isArray(window.allWords)) return [];
    const currentId = toWordId(currentWord.id);
    if (!currentId) return [];

    const direct = Array.isArray(currentWord.related_terms)
        ? currentWord.related_terms.map((relation) => toWordId(relation?.id)).filter(Boolean)
        : [];

    const reverse = window.allWords
        .filter((word) => toWordId(word?.id) !== currentId)
        .filter((word) => Array.isArray(word?.related_terms) && word.related_terms.some((relation) => toWordId(relation?.id) === currentId))
        .map((word) => toWordId(word?.id))
        .filter(Boolean);

    return dedupeIds([...direct, ...reverse]).filter((id) => id !== currentId);
}

function filterAllowedCandidates(candidates, currentId, now = Date.now(), eligibleIds = null) {
    return dedupeIds(candidates)
        .filter((id) => id !== currentId)
        .filter((id) => !eligibleIds || eligibleIds.has(id))
        .filter((id) => !isBlockedByCooldown(id, now));
}

function pickNextWordId() {
    const now = Date.now();
    cleanupRecentVisited(now);

    const currentWord = getCurrentWord();
    const currentId = toWordId(currentWord?.id);
    if (!currentId) return null;
    const eligibleIds = new Set(getEligibleWordIds());
    if (eligibleIds.size === 0) return null;

    const relatedCandidates = getRelatedWordIds(currentWord);
    if (relatedCandidates.length > 0) {
        const allowedRelated = filterAllowedCandidates(relatedCandidates, currentId, now, eligibleIds);
        if (allowedRelated.length > 0) {
            return pickRandom(allowedRelated);
        }
    }

    const globalCandidates = getAllWordIds().filter((id) => eligibleIds.has(id));
    const allowedGlobal = filterAllowedCandidates(globalCandidates, currentId, now, eligibleIds);
    if (allowedGlobal.length > 0) {
        return pickRandom(allowedGlobal);
    }

    const fallbackGlobal = dedupeIds(globalCandidates)
        .filter((id) => id !== currentId)
        .filter((id) => eligibleIds.has(id));
    if (fallbackGlobal.length > 0) {
        return pickRandom(fallbackGlobal);
    }

    return null;
}

async function jumpToNextWord() {
    if (isNavigating) return;

    const nextId = pickNextWordId();
    if (!nextId) return;

    isNavigating = true;
    try {
        await zoomToWord(nextId, state.scaleThreshold, {
            animated: true,
            duration: DEFAULT_ANIMATION_DURATION_MS
        });
        updateWordFocus(nextId);
        recentVisited.set(nextId, Date.now());
    } finally {
        isNavigating = false;
    }
}

function onKeyDown(event) {
    if (isEditableTarget(event?.target)) return;
    const key = normalizeHotkeyKey(event);
    if (!key) return;

    pressedKeys.add(key);

    if (pressedKeys.has("r") && pressedKeys.has("s")) {
        if (comboLocked) return;
        comboLocked = true;
        void jumpToNextWord();
    }
}

function onKeyUp(event) {
    const key = normalizeHotkeyKey(event);
    if (!key) return;

    pressedKeys.delete(key);
    if (!pressedKeys.has("r") || !pressedKeys.has("s")) {
        comboLocked = false;
    }
}

function onWindowBlur() {
    pressedKeys.clear();
    comboLocked = false;
}

function getViewportSize() {
    const vv = window.visualViewport;
    if (vv) {
        return {
            width: Math.max(1, Math.round(vv.width)),
            height: Math.max(1, Math.round(vv.height))
        };
    }
    return {
        width: Math.max(1, Math.round(window.innerWidth || 1)),
        height: Math.max(1, Math.round(window.innerHeight || 1))
    };
}

function approximateRatio(width, height, maxTerm = RATIO_MAX_TERM) {
    const ratio = width / height;
    let bestW = width;
    let bestH = height;
    let bestError = Number.POSITIVE_INFINITY;

    for (let h = 1; h <= maxTerm; h += 1) {
        const w = Math.max(1, Math.round(ratio * h));
        const error = Math.abs((w / h) - ratio);
        if (error < bestError) {
            bestError = error;
            bestW = w;
            bestH = h;
        }
    }

    return `${bestW}:${bestH}`;
}

function ensureRatioOverlay() {
    let overlay = document.getElementById(RATIO_OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = RATIO_OVERLAY_ID;
    overlay.style.position = "fixed";
    overlay.style.top = "16px";
    overlay.style.right = "16px";
    overlay.style.zIndex = "9999";
    overlay.style.padding = "6px 10px";
    overlay.style.borderRadius = "8px";
    overlay.style.fontFamily = "monospace";
    overlay.style.fontSize = "12px";
    overlay.style.lineHeight = "1";
    overlay.style.color = "#fff";
    overlay.style.background = "rgba(0,0,0,0.65)";
    overlay.style.pointerEvents = "none";
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 160ms ease";
    document.body.appendChild(overlay);
    return overlay;
}

function showScreenRatioOverlay() {
    if (!document.body) return;
    const { width, height } = getViewportSize();
    const approx = approximateRatio(width, height);
    const overlay = ensureRatioOverlay();
    overlay.textContent = `${width}:${height} (~${approx})`;
    overlay.style.opacity = "1";

    if (ratioHideTimer) {
        window.clearTimeout(ratioHideTimer);
    }
    ratioHideTimer = window.setTimeout(() => {
        overlay.style.opacity = "0";
    }, RATIO_HIDE_DELAY_MS);
}

function onResize() {
    showScreenRatioOverlay();
}

export function initWordFocusRsHotkey(options = {}) {
    if (initialized) return;
    initialized = true;
    cooldownMs = Number.isFinite(options.cooldownMs) ? Math.max(0, Number(options.cooldownMs)) : DEFAULT_COOLDOWN_MS;

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("resize", onResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", onResize);
    }
}

export function destroyWordFocusRsHotkey() {
    if (!initialized) return;
    initialized = false;

    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("resize", onResize);
    if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onResize);
    }

    pressedKeys.clear();
    comboLocked = false;
    isNavigating = false;

    if (ratioHideTimer) {
        window.clearTimeout(ratioHideTimer);
        ratioHideTimer = null;
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initWordFocusRsHotkey(), { once: true });
} else {
    initWordFocusRsHotkey();
}
