// Imports
import { state } from "./state.js";
import { updateWordNodeTransforms, handleZoomWheel } from "./uni-canvas.js";
import { country_bounding_boxes } from "./countryBoundingBoxes.js";
import { resolveCountryCode } from "./countryMapping.js";
import { renderPanelSections, showFloatingPanel } from "./detail.js";
import {updateRelations} from "./relationManager.js";
import {
    zoomToWord,
    zoomInToWordOnSessionEntry,
    updateWordFocus
} from "./wordFocus.js";
import { applyStintFallbackToElement } from "./fontFallback.js";
import {
    readSavedWordIdSet,
    applySavedStateToNode,
    bindSaveIndicatorInteraction,
    initSavedWordStorageSync
} from "./saved.js";
import { logEvent, startWordView, endWordView } from "/analytics.js";
import { yearPeriods } from "./menu.js";

const BOOT_PROGRESS_EVENT = "dunes:boot-progress";
const ENTRY_READY_EVENT = "dunes:entry-ready";

function setBootProgress(value, label) {
    window.dispatchEvent(new CustomEvent(BOOT_PROGRESS_EVENT, {
        detail: { value, label }
    }));
}

// Shared runtime state
let sessionStartTs = null;
window.allWords = [];

const yearPeriodColors = [
    "#F9D67A",
    "#FADD91",
    "#FAE2A5",
    "#FAE8BA",
    "#FAEED0",
    "#F9F3E3"
];

let wordsOnGrid = {};
let usedPositions = new Set();
let minGrid = 2;
let entryGateReady = false;
let entryDataReady = false;
let entryFlowStarted = false;

initSavedWordStorageSync();

function hasGateBeenDismissed() {
    const gate = document.getElementById("invite-gate");
    return !gate || gate.classList.contains("is-hidden");
}

function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function tryRunEntryFlow() {
    if (entryFlowStarted || !entryDataReady || !entryGateReady) {
        if (typeof window.__DD_BOOT_DEBUG_REPORT__ === "function") {
            window.__DD_BOOT_DEBUG_REPORT__(`entry wait: started=${entryFlowStarted} data=${entryDataReady} gate=${entryGateReady}`);
        }
        return;
    }
    entryFlowStarted = true;

    const targetId = state.focusedNodeId;
    setBootProgress(100, "Loaded");
    await wait(620);
    if (targetId !== null && targetId !== undefined) {
        await zoomInToWordOnSessionEntry(targetId, {
            minScale: 1,
            targetScale: state.scaleThreshold,
            duration: 1850
        });
    }

    updateWordFocus(targetId);
    if (targetId !== null && targetId !== undefined) {
        startWordView(targetId);
    }
    syncRouteFromState({ replace: true });
}

// Language helpers
function normalizeLang(code) {
    const v = (code || "").toLowerCase();
    return v.startsWith("zh") ? "zh" : "en";
}

function routeLangToStateLang(routeLang) {
    const v = String(routeLang || "").toLowerCase();
    if (v === "cn" || v === "zh") return "zh";
    if (v === "en") return "en";
    return null;
}

function stateLangToRouteLang(lang) {
    return normalizeLang(lang) === "zh" ? "cn" : "en";
}

function slugifyTerm(value) {
    const raw = String(value || "")
        .trim()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return raw
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}

function getWordSlug(word, lang = "en") {
    if (!word) return "";
    const preferred = word?.term?.[lang] || word?.term?.en || word?.term?.zh || word?.termOri || "";
    return slugifyTerm(preferred);
}

function buildWordSlugCandidates(word) {
    const candidates = new Set();
    const add = (value) => {
        const slug = slugifyTerm(value);
        if (slug) candidates.add(slug);
    };
    add(word?.term?.en);
    add(word?.term?.zh);
    add(word?.termOri);
    return candidates;
}

function findWordByRouteSlug(routeSlug, words = []) {
    const normalized = slugifyTerm(decodeURIComponent(String(routeSlug || "")));
    if (!normalized) return null;
    for (const word of words) {
        const candidates = buildWordSlugCandidates(word);
        if (candidates.has(normalized)) return word;
    }
    return null;
}

function parseRouteState(pathname = window.location.pathname) {
    const segments = String(pathname || "/")
        .split("/")
        .filter(Boolean)
        .map((v) => decodeURIComponent(v));

    if (!segments.length) return { routeLang: null, routeSlug: null };

    const first = segments[0].toLowerCase();
    const routeLang = routeLangToStateLang(first);
    if (routeLang) {
        return {
            routeLang,
            routeSlug: segments.slice(1).join("/")
        };
    }

    return {
        routeLang: null,
        routeSlug: segments.join("/")
    };
}

function resolveInitialLang(routeLang = null) {
    if (routeLang) return normalizeLang(routeLang);
    const browserLang = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    if (browserLang) return normalizeLang(browserLang);
    return normalizeLang(document.documentElement.lang || state.currentLang || "en");
}

let lastSyncedPath = null;

function syncRouteFromState({ replace = true } = {}) {
    const lang = normalizeLang(state.currentLang || document.documentElement.lang || "en");
    const routeLang = stateLangToRouteLang(lang);
    let nextPath = `/${routeLang}`;

    if (state.focusedNodeId !== null && state.focusedNodeId !== undefined && window.allWords?.length) {
        const word = window.allWords.find((w) => String(w.id) === String(state.focusedNodeId));
        const slug = getWordSlug(word, lang);
        if (slug) {
            nextPath = `/${routeLang}/${encodeURIComponent(slug)}`;
        }
    }

    if (window.location.pathname === nextPath || lastSyncedPath === nextPath) return;
    const fn = replace ? window.history.replaceState : window.history.pushState;
    fn.call(window.history, {}, "", nextPath);
    lastSyncedPath = nextPath;
}

window.__DD_SYNC_ROUTE = () => {
    syncRouteFromState({ replace: true });
};

// Session analytics
function endSession(reason = "unknown") {
    if (sessionStartTs === null) return;
    const durationMs = Date.now() - sessionStartTs;
    logEvent("session_end", { durationMs, reason });
    sessionStartTs = null;
}


// Language UI
const langBtn = document.getElementById("language-icon");
function updateTabLabels() {
    const currentLang = normalizeLang(state.currentLang);
    document.querySelectorAll('.panel-tabs button[data-tab]').forEach(button => {
        if (!button) return;

        let span = button.querySelector('span');
        if (!span) {
            const text = button.innerHTML;
            button.innerHTML = `<span>${text}</span>`;
            span = button.querySelector('span');
        }

        const tabName = button.dataset.tab;
        if (tabName === "entry") {
            span.textContent = currentLang === "en" ? "ENTRY" : "\u8bcd\u6761";
        } else if (tabName === "comment") {
            span.textContent = currentLang === "en" ? "NOTES" : "\u7b14\u8bb0";
        } else if (tabName === "about") {
            span.textContent = currentLang === "en" ? "ABOUT" : "\u5173\u4e8e";
        } else if (tabName === "devlog") {
            span.textContent = currentLang === "en" ? "DEVLOG" : "\u65e5\u5fd7";
        }

        if (currentLang === "en") {
            span.style.display = "inline-block";
            span.style.transform = "translateX(-10px) rotate(-90deg)";
        } else {
            span.style.transform = "rotate(0deg) translateY(0)";
        }
    });
}
langBtn.addEventListener("click", () => {
    const html = document.documentElement; 
    const prevLang = normalizeLang(html.lang || state.currentLang);
    const nextLang = prevLang === "en" ? "zh" : "en";
    html.lang = nextLang;
    state.currentLang = nextLang;
    langBtn.textContent = nextLang;
    logEvent("lang_toggle", { from: prevLang, to: nextLang });

    document.querySelectorAll('.word-node').forEach(node => {
        const wordId = node.id;
        const word = window.allWords.find(w => w.id == wordId);
        if (!word) return;
        const lang = normalizeLang(state.currentLang);

        const termMain = node.querySelector('.term-main');
        if(termMain) termMain.textContent = word.term?.[lang] || '未知单词';
    });

    updateTabLabels();


    if(state.focusedNodeId) {
        updateWordFocus();
        renderPanelSections();
    }else{
        updateWordFocus();
    }
    syncRouteFromState({ replace: true });
});

// Color and date helpers
function getWordColor(wordYear) {
    if (isNaN(wordYear)) {
        return yearPeriodColors[0];
    }
    let periodIndex = 0;
    
    for (let i = yearPeriods.length - 2; i >= 0; i--) {
        const period = yearPeriods[i];
        if (period.year !== null && wordYear >= period.year) {
            periodIndex = i;
            break;
        }
    }
    if (periodIndex >= yearPeriodColors.length) {
        periodIndex = yearPeriodColors.length - 1;
    }
    return yearPeriodColors[periodIndex];
}

function parseContributeDate(contributeDate) {
    if (!contributeDate || contributeDate.includes("TODO")) return 99991231;
    const parts = String(contributeDate).split("/").map((value) => parseInt(value, 10));
    if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return 99991231;
    const [year, month, day] = parts;
    return year * 10000 + month * 100 + day;
}

// Grid placement helpers
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getCountryBoundary(countryCode) {
    const box = country_bounding_boxes[countryCode];
    if (!box) return [-180, -90, 180, 90];
    return box[1];
}

function getCountryCenter(countryCode) {
    const box = country_bounding_boxes[countryCode];
    if (!box) {
        return { left: 50, top: 50 };
    }

    const [minLon, minLat, maxLon, maxLat] = box[1];

    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;

    const left = (centerLon + 180) / 3.6;
    const top = (90 - centerLat) / 1.8;

    return { left, top };
}


function generateGridPoints(min = 4, max = 96) {
    const points = [];
    for (let top = min; top <= max; top += minGrid) {
        for (let left = min; left <= max; left += minGrid) {
            points.push({
                left,
                top
            });
        }
    }
    return points;
}

function getFallbackPositions(count) {
    const positions = [];
    const allPoints = generateGridPoints();
    for (let i = 0; i < allPoints.length && positions.length < count; i++) {
        const point = allPoints[i];
        const key = `${Math.round(point.left)},${Math.round(point.top)}`;
        if (!usedPositions.has(key)) {
            positions.push(point);
            usedPositions.add(key);
        }
    }
    return positions;
}

function getCountryGridPoints(countryCode) {
    const [minLon, minLat, maxLon, maxLat] = getCountryBoundary(countryCode);

    const allPoints = generateGridPoints();
    const availablePoints = allPoints.filter(({
        left,
        top
    }) => {
        const lon = left * 3.6 - 180;
        const lat = 90 - top * 1.8;
        return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
    });

    shuffleArray(availablePoints);
    return availablePoints;
}

function findAvailablePositions(countryCode, wordCount) {
    const countryPoints = getCountryGridPoints(countryCode);
    const positions = [];
    
    for (let i = 0; i < countryPoints.length && positions.length < wordCount; i++) {
        const point = countryPoints[i];
        const key = `${Math.round(point.left)},${Math.round(point.top)}`;
        if (!usedPositions.has(key)) {
            positions.push(point);
            usedPositions.add(key);
        }
    }
    
    if (positions.length < wordCount) {
        const countryCenter = getCountryCenter(countryCode);
        const additionalPositions = expandFromCenter(
            countryCenter, 
            wordCount - positions.length,
            countryPoints
        );
        positions.push(...additionalPositions);
    }
    
    return positions;
}

function expandFromCenter(center, neededCount, excludePoints = []) {
    const positions = [];
    const excludeKeys = new Set(
        excludePoints.map(p => `${Math.round(p.left)},${Math.round(p.top)}`)
    );
    
    let radius = minGrid;
    const maxRadius = 50;
    
    while (positions.length < neededCount && radius <= maxRadius) {
        const ringPositions = generateRingPositions(center, radius);
        
        for (const pos of ringPositions) {
            if (positions.length >= neededCount) break;
            const key = `${Math.round(pos.left)},${Math.round(pos.top)}`;
            if (isValidPosition(pos) && 
                !usedPositions.has(key) && 
                !excludeKeys.has(key)) {
                positions.push(pos);
                usedPositions.add(key);
            }
        }
        radius += minGrid;
    }
    
    return positions;
}

function generateRingPositions(center, radius) {
    const positions = [];
    const steps = Math.max(8, Math.floor(2 * Math.PI * radius / minGrid));
    
    for (let i = 0; i < steps; i++) {
        const angle = (2 * Math.PI * i) / steps;
        const left = center.left + radius * Math.cos(angle);
        const top = center.top + radius * Math.sin(angle);
        
        const gridLeft = Math.round(left / minGrid) * minGrid;
        const gridTop = Math.round(top / minGrid) * minGrid;
        
        positions.push({ left: gridLeft, top: gridTop });
    }
    
    return positions;
}

function isValidPosition(pos) {
    return pos.left >= 5 && pos.left <= 95 && 
           pos.top >= 5 && pos.top <= 95;
}

function allocatePositionsForCountries(wordsByCountry) {
    usedPositions.clear();
    const countryPositions = {};

    const sortedCountries = Object.keys(wordsByCountry).sort((a, b) => {
        return wordsByCountry[b].length - wordsByCountry[a].length;
    });
    
    for (const country of sortedCountries) {
        const wordCount = wordsByCountry[country].length;
        countryPositions[country] = findAvailablePositions(country, wordCount);
    }
    
    return countryPositions;
}


// Render
function renderWordUniverse(wordsData) {
    const lang = normalizeLang(state.currentLang || "zh");
    console.log(lang);
    const savedWordIds = readSavedWordIdSet();
    const wordNodesContainer = document.getElementById('word-nodes-container');
    wordNodesContainer.innerHTML = '';
    wordsOnGrid = {};
    const nodesFragment = document.createDocumentFragment();

    const wordsByCountry = {};
    const unknownWords = [];
    const unknownLabels = new Set();
    wordsData.forEach(word => {
        const countryCode = resolveCountryCode(word.proposing_country);
        if (countryCode && country_bounding_boxes[countryCode]) {
            if (!wordsByCountry[countryCode]) {
                wordsByCountry[countryCode] = [];
            }
            wordsByCountry[countryCode].push(word);
        } else {
            const label = (word.proposing_country || countryCode || "\u672a\u77e5\u56fd\u5bb6").trim();
            unknownLabels.add(label);
            unknownWords.push({ word, label });
        }
    });

    for (const label of unknownLabels) {
        console.warn(`${label}\u65e0\u6cd5\u5339\u914d\u4e16\u754c\u5730\u56fe`);
    }

    const countryPositions = allocatePositionsForCountries(wordsByCountry);

    for (const country in wordsByCountry) {
        const words = wordsByCountry[country];
        const positions = countryPositions[country];

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            
            if (i >= positions.length) {
                console.warn(`国家 ${country} 的单词数量超过可分配位置，跳过单词 ${word.term}`);
                continue;
            }
            
            const pos = positions[i];
            const leftPercent = pos.left;
            const topPercent = pos.top;

            word.longitude = leftPercent * 3.6 - 180;
            word.latitude = 90 - topPercent * 1.8;

            const node = document.createElement('div');
            node.className = 'word-node';
            node.dataset.nodeFormat = "word";
            node.innerHTML = `
            <span class="save-indicator" aria-hidden="true"></span>
            <div class="detail-title">${String(word.id).padStart(4, '0')}</div>
            <div class="terms">
                <div class="term-main">${word.term?.[lang] || '未知单词'}</div>
                <div class="term-ori">${word.termOri || ''}</div>
            </div>
            `;
            applyStintFallbackToElement(node.querySelector('.term-ori'));
            node.style.left = `${leftPercent}%`;
            node.style.top = `${topPercent}%`;
            node.style.transform = `translate(-50%, -50%)`;

            
            const year = parseInt(word.proposing_time);
            const nodeColor = getWordColor(year);
            node.style.backgroundColor = nodeColor;

         

            node.dataset.lon = word.longitude;
            node.dataset.lat = word.latitude;
            node.dataset.x = leftPercent / 100;
            node.dataset.y = topPercent / 100;
            node.id = word.id;
            applySavedStateToNode(node, savedWordIds);
            bindSaveIndicatorInteraction(node);
            
            const key = `${Math.round(leftPercent)},${Math.round(topPercent)}`;
            wordsOnGrid[key] = node.id;

            node.addEventListener('wheel', (e) => {
                e.stopPropagation();
                handleZoomWheel(e);
            }, { passive: false });
            
            node.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });

            node.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!isDragging) {
                    if (node.classList.contains('focused')) {
                        showFloatingPanel();
                    } else {
                        endWordView("switch");
                        startWordView(node.id);
                        await zoomToWord(node.id, state.scaleThreshold, { animated: true, duration: 920 });
                        updateWordFocus(node.id);
                        renderPanelSections();
                        logEvent("word-node-click", { wordId: node.id });
                    }
                }
            });

            nodesFragment.appendChild(node);
        }
    }

    if (unknownWords.length) {
        const fallbackPositions = getFallbackPositions(unknownWords.length);
        for (let i = 0; i < unknownWords.length; i++) {
            const item = unknownWords[i];
            if (i >= fallbackPositions.length) {
                console.warn(`\u56fd\u5bb6 ${item.label} \u7684\u5355\u8bcd\u6570\u91cf\u8d85\u8fc7\u53ef\u5206\u914d\u4f4d\u7f6e\uff0c\u8df3\u8fc7\u5355\u8bcd ${item.word.term}`);
                continue;
            }

            const pos = fallbackPositions[i];
            const leftPercent = pos.left;
            const topPercent = pos.top;

            const word = item.word;
            word.longitude = leftPercent * 3.6 - 180;
            word.latitude = 90 - topPercent * 1.8;

            const node = document.createElement('div');
            node.className = 'word-node';
            node.dataset.nodeFormat = "word";
            node.innerHTML = `
            <span class="save-indicator" aria-hidden="true"></span>
            <div class="detail-title">${String(word.id).padStart(4, '0')}</div>
            <div class="terms">
                <div class="term-main">${word.term?.[lang] || '\u672a\u77e5\u5355\u8bcd'}</div>
                <div class="term-ori">${word.termOri || ''}</div>
            </div>
            `;
            applyStintFallbackToElement(node.querySelector('.term-ori'));
            node.style.left = `${leftPercent}%`;
            node.style.top = `${topPercent}%`;
            node.style.transform = `translate(-50%, -50%)`;

            const year = parseInt(word.proposing_time);
            const nodeColor = getWordColor(year);
            node.style.backgroundColor = nodeColor;
            node.style.zIndex = String(parseContributeDate(word.contribute_date));
            node.style.zIndex = String(parseContributeDate(word.contribute_date));

            node.dataset.lon = word.longitude;
            node.dataset.lat = word.latitude;
            node.dataset.x = leftPercent / 100;
            node.dataset.y = topPercent / 100;
            node.id = word.id;
            applySavedStateToNode(node, savedWordIds);
            bindSaveIndicatorInteraction(node);

            const key = `${Math.round(leftPercent)},${Math.round(topPercent)}`;
            wordsOnGrid[key] = node.id;

            node.addEventListener('wheel', (e) => {
                e.stopPropagation();
                handleZoomWheel(e);
            }, { passive: false });
            
            node.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });

            node.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!isDragging) {
                    if (node.classList.contains('focused')) {
                        showFloatingPanel();
                    } else {
                        endWordView("switch");
                        startWordView(node.id);
                        await zoomToWord(node.id, state.scaleThreshold, { animated: true, duration: 920 });
                        updateWordFocus(node.id);
                        renderPanelSections();
                        logEvent("word-node-click", { wordId: node.id });
                    }
                }
            });

            nodesFragment.appendChild(node);
        }
    }
    wordNodesContainer.appendChild(nodesFragment);
    updateWordNodeTransforms();
    let isDragging = false;

    let canvas = document.getElementById("universe-canvas");
    canvas.addEventListener('wheel', (e) => {
        updateWordFocus();
        updateRelations();
    });
    canvas.addEventListener('mouseup', () => {
        updateWordFocus();
        updateRelations();
    });

}

// Image visibility
function attachImageVisibility(img) {
    if (!img || img.dataset.imgVisibilityBound === "1") return;
    img.dataset.imgVisibilityBound = "1";
    const update = () => {
        const src = img.getAttribute("src");
        if (!src) {
            img.style.display = "none";
        } else {
            img.style.display = "";
        }
    };
    img.addEventListener("error", () => {
        img.style.display = "none";
    });
    img.addEventListener("load", () => {
        if (img.getAttribute("src")) {
            img.style.display = "";
        }
    });
    update();
}

function setupImageVisibilityWatcher() {
    document.querySelectorAll("img").forEach(attachImageVisibility);
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === "childList") {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    if (node.tagName === "IMG") {
                        attachImageVisibility(node);
                    } else {
                        node.querySelectorAll?.("img").forEach(attachImageVisibility);
                    }
                });
            } else if (m.type === "attributes" && m.attributeName === "src") {
                const target = m.target;
                if (target && target.tagName === "IMG") {
                    attachImageVisibility(target);
                }
            }
        }
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"]
    });
}

// App lifecycle
document.addEventListener('DOMContentLoaded', () => {
    setBootProgress(30, "Loading app...");
    entryGateReady = hasGateBeenDismissed();
    if (typeof window.__DD_BOOT_DEBUG_REPORT__ === "function") {
        window.__DD_BOOT_DEBUG_REPORT__(`gate initial hidden=${entryGateReady}`);
    }
    window.addEventListener(ENTRY_READY_EVENT, () => {
        entryGateReady = true;
        if (typeof window.__DD_BOOT_DEBUG_REPORT__ === "function") {
            window.__DD_BOOT_DEBUG_REPORT__("entry-ready event received");
        }
        tryRunEntryFlow();
    }, { once: true });
    sessionStartTs = Date.now();
    logEvent("session_start", {});
    const routeState = parseRouteState(window.location.pathname);
    const initialLang = resolveInitialLang(routeState.routeLang);
    document.documentElement.lang = initialLang;
    state.currentLang = initialLang;
    langBtn.textContent = initialLang;
    updateTabLabels();
    logEvent("page_loaded", { lang: initialLang });
    setBootProgress(42, "Loading data...");
    fetch('/content/draft/data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            return response.json();
        })
        .then(data => {
            setBootProgress(72, "Rendering words...");
            window.allWords = data.words;
            if (typeof window.__DD_BOOT_DEBUG_REPORT__ === "function") {
                window.__DD_BOOT_DEBUG_REPORT__(`render start: ${Array.isArray(data.words) ? data.words.length : 0} words`);
            }
            const matchedWord = findWordByRouteSlug(routeState.routeSlug, data.words);
            const homeIdRaw = data?.meta?.home_node_id;
            const homeIdNum = Number(homeIdRaw);
            if (matchedWord?.id !== null && matchedWord?.id !== undefined) {
                state.focusedNodeId = matchedWord.id;
            } else if (Number.isFinite(homeIdNum)) {
                state.focusedNodeId = homeIdNum;
            }
            logEvent("data_loaded", { status: "success", count: data.words ? data.words.length : 0 });
            // Render once data is loaded.
            renderWordUniverse(data.words);
            if (typeof window.__DD_BOOT_DEBUG_REPORT__ === "function") {
                window.__DD_BOOT_DEBUG_REPORT__("render complete");
            }
            entryDataReady = true;
            tryRunEntryFlow();
        })
        .catch(error => {
            logEvent("data_loaded", { status: "error" });
            setBootProgress(100, "Load failed, please refresh");
            console.error('加载数据失败:', error);
            // Optional UI error handling can be added here.
            document.getElementById('word-nodes-container').innerHTML =
                '<p class="error">加载单词数据失败，请刷新重试</p>';
        });
});

document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'x') {
        console.log('state.panX:', state.panX);
        console.log('state.panY:', state.panY);
        console.log('state.currentScale:', state.currentScale);
    }
    if (e.key.toLowerCase() === 'c') {
        console.log('state.focusedNodeId:', state.focusedNodeId);
    }
});


document.addEventListener("DOMContentLoaded", setupImageVisibilityWatcher, { once: true });

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        endWordView('page_hidden');
        endSession('page_hidden');
    } else if (document.visibilityState === 'visible') {
        if (sessionStartTs === null) {
            sessionStartTs = Date.now();
            logEvent("session_start", {});
        }
    }
});

window.addEventListener('beforeunload', () => {
    endWordView('unload');
    endSession('unload');
});

