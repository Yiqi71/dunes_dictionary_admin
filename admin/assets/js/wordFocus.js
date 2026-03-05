// wordFocus.js - 专门处理单词焦点和缩放
import { state } from "./state.js";
import { draw, getMobileFocusedNodeAnchor, updateWordNodeTransforms } from "./uni-canvas.js";
import { updateScaleForNodes } from "./zoom.js";
import { updateRelations } from "./relationManager.js";
import { renderPanelSections , showFloatingPanel, scrollToTop, resetFloatingPanelState } from "./detail.js";
import { moveIndicator } from "./menu.js";


let focusedWord = null;
let lastFocusedNodeId = null;
let activeZoomAnimation = null;
const MENU_COMPACT_CLASS = "menu-compact";
const PENDING_FOCUS_CLASS = "pending-focus";
const FOCUSED_NODE_LAYER_ID = "focused-node-layer";

function emitWordFocusChange(focusedNodeId) {
    document.dispatchEvent(new CustomEvent("word-focus-change", {
        detail: { focusedNodeId: focusedNodeId ?? null }
    }));
}

function isMobileLayout() {
    return window.matchMedia("(max-width: 768px)").matches;
}

function ensureFocusedNodeLayer() {
    let layer = document.getElementById(FOCUSED_NODE_LAYER_ID);
    if (layer) return layer;
    const universeView = document.getElementById("universe-view");
    if (!universeView) return null;

    layer = document.createElement("div");
    layer.id = FOCUSED_NODE_LAYER_ID;
    universeView.appendChild(layer);
    return layer;
}

function moveFocusedNodeToLayer(node) {
    if (!node) return;
    const layer = ensureFocusedNodeLayer();
    if (!layer || node.parentElement === layer) return;
    layer.appendChild(node);
}

function restoreNodeToContainer(node) {
    if (!node) return;
    const container = document.getElementById("word-nodes-container");
    if (!container || node.parentElement === container) return;
    container.appendChild(node);
}

function fadeOutDetailsForTransition() {
    const detailDiv = document.getElementById("word-details");
    if (!detailDiv) return;
    detailDiv.classList.add("details-transition-out");
}

function fadeInDetailsAfterTransition() {
    const detailDiv = document.getElementById("word-details");
    if (!detailDiv) return;
    detailDiv.classList.remove("details-transition-out");
}

function prepareLazyImage(img) {
    if (!img) return;
    img.loading = "lazy";
    img.decoding = "async";
    img.classList.add("lazy-img");
    if (img.complete && img.naturalWidth > 0) {
        img.classList.remove("lazy-img");
        return;
    }
    img.addEventListener("load", () => img.classList.remove("lazy-img"), { once: true });
    img.addEventListener("error", () => img.classList.add("lazy-img-error"), { once: true });
}
const noteAuthor = {
    role: { zh: "编辑", en: "Editor" },
    name: { zh: "陈飞樾", en: "Chen Feiyue" }
};

function setMenuCompact(enabled) {
    const sideMenu = document.getElementById("side-menu");
    if (!sideMenu) return;
    if (enabled && sideMenu.classList.contains("menu-search-lock")) {
        return;
    }
    sideMenu.classList.toggle(MENU_COMPACT_CLASS, Boolean(enabled));
}

// 定义每个section的基础位置和变化范围
const detailPositions = {
    image: {
        baseTop: 30, // vh
        baseLeft: 70, // vw
        topRange: 8,  // ±8vh
        leftRange: 10 // ±10vw
    },
    proposer: {
        baseTop: 65, // vh
        baseLeft: 30, // vw
        topRange: 6,  // ±6vh
        leftRange: 8  // ±8vw
    },
    comment: {
        baseTop: 80, // vh
        baseLeft: 60, // vw
        topRange: 5,  // ±5vh
        leftRange: 12 // ±12vw
    }
};

// 修改现有的 applyPositionVariations 函数，添加呼吸感的 CSS 属性
export function applyPositionVariations(wordId) {
    if (isMobileLayout()) {
        Object.keys(detailPositions).forEach((sectionId) => {
            const section = document.getElementById(sectionId);
            if (!section) return;
            section.style.top = "";
            section.style.left = "";
            section.style.transition = "";
        });
        return;
    }
    // 使用单词ID作为种子来确保相同单词的位置是一致的
    const seed = parseInt(wordId) || 1;
    
    Object.keys(detailPositions).forEach((sectionId, index) => {
        const section = document.getElementById(sectionId);
        if (!section) return;
        
        const config = detailPositions[sectionId];
        
        // 为每个section使用不同的随机种子
        const sectionSeed = seed * (index + 1) * 17 + (index + 1) * 31;
        
        // 使用简单的伪随机数生成器，每个section都有独立的随机值
        const random1 = ((sectionSeed * 9301 + 49297) % 233280) / 233280;
        const random2 = ((sectionSeed * 9307 + 49321) % 233280) / 233280;
        
        // 计算位置偏移（在范围内的随机值）
        const topOffset = (random1 - 0.5) * config.topRange;
        const leftOffset = (random2 - 0.5) * config.leftRange;
        
        // 应用新位置
        const newTop = config.baseTop + topOffset;
        const newLeft = config.baseLeft + leftOffset;
        
        // 添加平滑过渡效果和为动画准备的样式
        section.style.transition = 'top 0.3s ease-out, left 0.3s ease-out';
        section.style.top = `${newTop}vh`;
        section.style.left = `${newLeft}vw`;
        
        // 为呼吸动画准备样式
        section.style.willChange = 'transform, opacity';
        section.style.backfaceVisibility = 'hidden'; // 优化动画性能
    });
}

// 重置所有detail sections到基础位置
function resetPositions() {
    if (isMobileLayout()) {
        Object.keys(detailPositions).forEach((sectionId) => {
            const section = document.getElementById(sectionId);
            if (!section) return;
            section.style.top = "";
            section.style.left = "";
            section.style.transition = "";
        });
        return;
    }
    Object.keys(detailPositions).forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (!section) return;
        
        const config = detailPositions[sectionId];
        section.style.transition = 'top 0.3s ease-out, left 0.3s ease-out';
        section.style.top = `${config.baseTop}vh`;
        section.style.left = `${config.baseLeft}vw`;
    });
}

// 获取邻居节点（用于检查周围空间）
function getNeighbors(left, top) {
    const neighbors = [];
    const deltas = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1]
    ];

    for (const [dx, dy] of deltas) {
        const nx = Math.round(left + dx);
        const ny = Math.round(top + dy);
        
        // 检查是否有节点在这个位置
        const nodeAtPosition = document.querySelector(
            `.word-node[data-x="${(nx/100).toFixed(2)}"][data-y="${(ny/100).toFixed(2)}"]`
        );
        
        neighbors.push({
            x: nx,
            y: ny,
            hasValue: !!nodeAtPosition
        });
    }

    return neighbors;
}
function cancelActiveZoomAnimation(resolveValue = false) {
    if (!activeZoomAnimation) return;
    const { rafId, resolve } = activeZoomAnimation;
    if (rafId) {
        window.cancelAnimationFrame(rafId);
    }
    activeZoomAnimation = null;
    if (typeof resolve === "function") {
        resolve(resolveValue);
    }
}

export function zoomToWord(id, newScale, options = {}) {
    const node = document.getElementById(String(id));
    if (!node) return Promise.resolve(false);
    document.querySelectorAll(`.word-node.${PENDING_FOCUS_CLASS}`).forEach((n) => {
        n.classList.remove(PENDING_FOCUS_CLASS);
    });
    node.classList.add(PENDING_FOCUS_CLASS);

    const {
        animated = false,
        duration = 780,
        easing = (t) => 1 - Math.pow(1 - t, 4)
    } = options;

    const target = getPanForWordAtScale(node, newScale);
    if (!target) return Promise.resolve(false);

    if (!animated || duration <= 0) {
        cancelActiveZoomAnimation(false);
        applyViewport(newScale, target.panX, target.panY);
        return Promise.resolve(true);
    }

    cancelActiveZoomAnimation(false);
    fadeOutDetailsForTransition();

    const previousFocusedNode = document.querySelector(".word-node.focused");
    const oldFocusedNode = previousFocusedNode && previousFocusedNode !== node ? previousFocusedNode : null;
    const oldFocusedStartOpacity = oldFocusedNode ? Number(window.getComputedStyle(oldFocusedNode).opacity) || 1 : 1;
    const newFocusedStartOpacity = Number(window.getComputedStyle(node).opacity) || 1;

    const startScale = state.currentScale;
    const startPanX = state.panX;
    const startPanY = state.panY;
    const deltaScale = newScale - startScale;
    const deltaPanX = target.panX - startPanX;
    const deltaPanY = target.panY - startPanY;

    return new Promise((resolve) => {
        const startedAt = performance.now();
        const animationState = { rafId: null, resolve };
        activeZoomAnimation = animationState;

        const step = (now) => {
            if (activeZoomAnimation !== animationState) return;

            const progress = Math.min(1, (now - startedAt) / duration);
            const eased = easing(Math.max(0, Math.min(1, progress)));

            applyViewport(
                startScale + deltaScale * eased,
                startPanX + deltaPanX * eased,
                startPanY + deltaPanY * eased
            );

            // Fade only two nodes linearly for better performance.
            if (oldFocusedNode) {
                const oldOpacity = oldFocusedStartOpacity + (0.2 - oldFocusedStartOpacity) * progress;
                oldFocusedNode.style.opacity = String(oldOpacity);
            }
            const newOpacity = newFocusedStartOpacity + (1 - newFocusedStartOpacity) * progress;
            node.style.opacity = String(newOpacity);

            if (progress < 1) {
                animationState.rafId = window.requestAnimationFrame(step);
                return;
            }

            // Ensure final opacity state is ready before focus handoff.
            if (oldFocusedNode) oldFocusedNode.style.opacity = "0.2";
            node.style.opacity = "1";

            activeZoomAnimation = null;
            resolve(true);
        };

        animationState.rafId = window.requestAnimationFrame(step);
    });
}

// 修改现有的 updateWordFocus 函数
function normalizeLang(code) {
    const v = (code || "").toLowerCase();
    return v.startsWith("en") ? "en" : "zh";
}

function applyHashItalics(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/#([^#]+)#/g, "<i>$1</i>");
}

function resolveImagePath(src) {
    if (!src) return "";
    if (src.startsWith("http") || src.startsWith("data:") || src.startsWith("/")) return src;
    if (src.startsWith("images/")) return `/content/draft/${src}`;
    return src;
}

export function updateWordFocus(targetNodeId = null) {
    document.querySelectorAll(`.word-node.${PENDING_FOCUS_CLASS}`).forEach((node) => {
        node.classList.remove(PENDING_FOCUS_CLASS);
    });

    // 清除之前聚焦的单词
    if (focusedWord) {
        restoreNodeToContainer(focusedWord);
        focusedWord.classList.remove('focused');
        focusedWord = null;
        state.focusedNodeId = null;
        emitWordFocusChange(null);
        lastFocusedNodeId = null;
        restoreAllNodes();
        resetPositions();
        const detailDiv = document.getElementById("word-details");
        detailDiv.classList.add("hidden");
        setMenuCompact(false);
        
        // 停止呼吸动画
        stopBreathingAnimation();
    }

    // 获取视图中心坐标
    const viewportCenter = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };

    // 如果缩放足够大（达到或超过阈值）
    if (state.currentScale >= state.scaleThreshold) {
        // 找出距离视图中心最近的单词
        let closestWord = null;
        const targetId = targetNodeId !== null && targetNodeId !== undefined ? String(targetNodeId) : "";
        if (targetId) {
            closestWord = document.getElementById(targetId);
        }

        if (!closestWord) {
            let minDistance = window.innerHeight / 4;

            document.querySelectorAll('.word-node').forEach(node => {
                const rect = node.getBoundingClientRect();
                const nodeCenter = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };

                // Calculate distance from viewport center.
                const distance = Math.sqrt(
                    Math.pow(nodeCenter.x - viewportCenter.x, 2) +
                    Math.pow(nodeCenter.y - viewportCenter.y, 2)
                );

                // Keep nearest word candidate.
                if (distance < minDistance) {
                    minDistance = distance;
                    closestWord = node;
                }
            });
        }

        // 聚焦最近的单词
        if (closestWord) {
            closestWord.classList.add('focused');
            moveFocusedNodeToLayer(closestWord);
            focusedWord = closestWord;
            state.focusedNodeId = closestWord.id;
            emitWordFocusChange(closestWord.id);
            setMenuCompact(true);
            if (lastFocusedNodeId !== closestWord.id) {
                resetFloatingPanelState();
                lastFocusedNodeId = closestWord.id;
            }

            updateRelations();
            hideNearbyNodes(closestWord);

            // 自动吸附到屏幕中心
            zoomToWord(focusedWord.id, state.scaleThreshold);
            updateWordDetails();
            
            // 应用位置变化（除了term section）
            applyPositionVariations(closestWord.id);

            // 启动呼吸动画
            setTimeout(startBreathingAnimation, 500); // 延迟启动，让位置动画先完成

            const node = document.getElementById(state.focusedNodeId);
            if(node){
                node.addEventListener("click", (e) => {
                    e.stopPropagation();
                    showFloatingPanel();
                    scrollToTop(); // 使用新的滚动到顶端函数
                });
            }
            if (typeof window.__DD_SYNC_ROUTE === "function") {
                window.__DD_SYNC_ROUTE();
            }
        }
    } else {
        emitWordFocusChange(null);
        setMenuCompact(false);
    }
}

export function updateWordDetails() {
    if (!state.focusedNodeId) return;
    const word = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!word) return;

    const lang = normalizeLang(state.currentLang || "zh");

    // 显示details
    const detailDiv = document.getElementById("word-details");
    detailDiv.classList.remove('hidden');
    fadeInDetailsAfterTransition();

    detailDiv.addEventListener('wheel', function (e) {
        e.stopPropagation();
        e.preventDefault();
    }, {
        passive: false
    });

    // related works + source image section
    const imageTitle = document.querySelector('#image .detail-title');
    const imageEl = document.querySelector('#image img');
    const relatedWorksEl = document.querySelector('#image .related-works');
    prepareLazyImage(imageEl);
    if (normalizeLang(state.currentLang) == "en") {
        imageTitle.textContent = 'Source';
    } else if (normalizeLang(state.currentLang) == "zh") {
        imageTitle.textContent = '出处';
    }

    if (word.source_image) {
        imageEl.src = resolveImagePath(word.source_image);
        imageEl.alt = word.term?.[lang] || '';
        imageEl.style.display = 'block';
    } else {
        imageEl.src = '';
        imageEl.style.display = 'none';
    }

    relatedWorksEl.innerHTML = "";
    relatedWorksEl.style.display = "none";

    // proposer section
    const proposerTitle = document.querySelector('#proposer .detail-title');
    const proposerPrimary = document.querySelector('#proposer .proposer-primary');
    const proposerOri = document.querySelector('#proposer .proposer-ori');
    const proposerImg = document.querySelector('#proposer img');
    prepareLazyImage(proposerImg);
    if(normalizeLang(state.currentLang)=="en"){
        proposerTitle.textContent = 'Proponent';
    }else if(normalizeLang(state.currentLang)=="zh"){
        proposerTitle.textContent = '提出者';
    }
    if (word.proposers && word.proposers.length>0) {
        const proposer = word.proposers[0];
        const localizedName = proposer.name?.[lang] || '';
        const sourceName = proposer.name?.ori || '';
        proposerPrimary.textContent = localizedName || sourceName;
        proposerOri.textContent = sourceName;
        proposerImg.src = resolveImagePath(proposer.image);
        proposerImg.alt = localizedName || sourceName || '';
        proposerImg.style.display = 'block';
    } else {
        proposerPrimary.textContent = '未知';
        proposerOri.textContent = '';
        proposerImg.style.display = 'none';
    }

    // comment section
    const commentTitle = document.querySelector('#comment .detail-title');
    const commentContent = document.querySelector('#comment #comment-content');

    if(normalizeLang(state.currentLang)=="en"){
        commentTitle.textContent = 'Echoes';
    }else if(normalizeLang(state.currentLang)=="zh"){
        commentTitle.textContent = '笔记';
    }
    if (word.commentAbs) {
        const comment = word.commentAbs;
        const content = applyHashItalics(comment.content?.[lang] || "");
        const author = comment.author?.[lang] || "";
        const authorBlock = author ? ` <p>${author}</p>` : "";
        commentContent.innerHTML = `<div class="comment-abs-content">${content}</div>${authorBlock}`;
    } else {
        commentContent.innerHTML = `<h3>暂无笔记</h3> <p></p>`;
    }
}

function hideNearbyNodes(focusedNode) {
    document.querySelectorAll('.word-node').forEach(node => {
        if (node === focusedNode) {
            node.style.opacity = '1';
            return;
        }
        node.style.opacity = '0.2';
    });
}

function restoreAllNodes() {
    document.querySelectorAll('.word-node').forEach(node => {
        node.style.opacity = '1';
    });
}

// 在 wordFocus.js 中添加以下代码

// 呼吸动画相关变量
let breathingAnimationId = null;
let startTime = null;

// 呼吸动画配置
const breathingConfig = {
    image: {
        amplitude: 5,      // 振幅（像素）
        frequency: 0.8,    // 频率
        phaseOffset: 0     // 相位偏移
    },
    proposer: {
        amplitude: 4,
        frequency: 0.9,
        phaseOffset: Math.PI * 0.6  // 错开约108度
    },
    comment: {
        amplitude: 8,
        frequency: 0.7,
        phaseOffset: Math.PI * 1.3  // 错开约234度
    }
};

// 启动呼吸动画
function startBreathingAnimation() {
    if (breathingAnimationId) return; // 防止重复启动
    
    startTime = performance.now();
    
    function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const elapsed = (currentTime - startTime) / 1000; // 转换为秒
        
        // 为每个 detail 元素应用呼吸动画
        Object.keys(breathingConfig).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (!section || section.classList.contains('hidden')) return;
            
            const config = breathingConfig[sectionId];
            
            // 计算 sin 波动值
            const sineValue = Math.sin(elapsed * config.frequency + config.phaseOffset);
            const offset = sineValue * config.amplitude;
            
            // 应用到 transform，保持原有的居中定位并添加微小偏移
            section.style.transform = `translate(-50%, -50%) translateY(${offset}px)`;
        });
        
        breathingAnimationId = requestAnimationFrame(animate);
    }
    
    breathingAnimationId = requestAnimationFrame(animate);
}

// 停止呼吸动画
function stopBreathingAnimation() {
    if (breathingAnimationId) {
        cancelAnimationFrame(breathingAnimationId);
        breathingAnimationId = null;
        startTime = null;
        
        // 重置所有元素的 transform 和 opacity
        Object.keys(breathingConfig).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.transform = '';
                section.style.opacity = '';
            }
        });
    }
}

function getCenteredPanForScale(scale) {
    const totalWidth = state.baseWidth * scale * 24;
    const totalHeight = state.baseHeight * scale;
    return {
        panX: (window.innerWidth - totalWidth) / 2,
        panY: (window.innerHeight - totalHeight) / 2
    };
}

function getPanForWordAtScale(node, scale) {
    const logicalX = parseFloat(node.dataset.x);
    const logicalY = parseFloat(node.dataset.y);
    if (Number.isNaN(logicalX) || Number.isNaN(logicalY)) return null;

    const worldX = logicalX * state.baseWidth * 24;
    const worldY = logicalY * state.baseHeight;

    if (isMobileLayout()) {
        const anchor = getMobileFocusedNodeAnchor();
        return {
            panX: anchor.x - worldX * scale,
            panY: anchor.y - worldY * scale
        };
    }

    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    return {
        panX: viewportCenterX - (worldX * scale + 318 / 2),
        panY: viewportCenterY - (worldY * scale + 210 / 2)
    };
}

function applyViewport(scale, panX, panY, { drawRelations: shouldDrawRelations = true } = {}) {
    state.currentScale = scale;
    state.panX = panX;
    state.panY = panY;
    draw();
    updateWordNodeTransforms();
    if (shouldDrawRelations) {
        updateRelations();
    }
    updateScaleForNodes(scale);
    moveIndicator(scale);
}

function applyEntryOpacityTransition(focusedNode, progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    const otherOpacity = 1 - 0.8 * clamped;
    document.querySelectorAll(".word-node").forEach((node) => {
        if (node === focusedNode) {
            node.style.opacity = "1";
        } else {
            node.style.opacity = String(otherOpacity);
        }
    });
}

export function zoomInToWordOnSessionEntry(targetWordId, options = {}) {
    const node = document.getElementById(String(targetWordId));
    if (!node) return Promise.resolve(false);
    const relationLines = document.getElementById("connection-lines");
    const setRelationVisibility = (isVisible) => {
        if (!relationLines) return;
        relationLines.style.opacity = isVisible ? "1" : "0";
    };

    const {
        minScale = 1,
        targetScale = state.scaleThreshold,
        duration = 2400,
        firstFrameHold = 500
    } = options;

    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = getCenteredPanForScale(minScale);
    const to = getPanForWordAtScale(node, targetScale);
    if (!to) return Promise.resolve(false);

    if (reducedMotion || duration <= 0) {
        applyViewport(targetScale, to.panX, to.panY);
        setRelationVisibility(true);
        applyEntryOpacityTransition(node, 1);
        clearEntryNodeVisualScale();
        return Promise.resolve(true);
    }

    setRelationVisibility(false);
    applyViewport(minScale, from.panX, from.panY, { drawRelations: false });
    applyEntryOpacityTransition(node, 0);

    return new Promise((resolve) => {
        const startedAt = performance.now() + Math.max(0, Number(firstFrameHold) || 0);
        const ease = (t) => 1 - Math.pow(1 - t, 3);

        const frame = (now) => {
            if (now < startedAt) {
                window.requestAnimationFrame(frame);
                return;
            }
            const progress = Math.min(1, (now - startedAt) / duration);
            const eased = ease(progress);

            const nextScale = minScale + (targetScale - minScale) * eased;
            const nextPanX = from.panX + (to.panX - from.panX) * eased;
            const nextPanY = from.panY + (to.panY - from.panY) * eased;

            applyViewport(nextScale, nextPanX, nextPanY, { drawRelations: false });
            applyEntryOpacityTransition(node, progress);

            if (progress < 1) {
                window.requestAnimationFrame(frame);
            } else {
                updateRelations();
                setRelationVisibility(true);
                resolve(true);
            }
        };

        window.requestAnimationFrame(frame);
    });
}
