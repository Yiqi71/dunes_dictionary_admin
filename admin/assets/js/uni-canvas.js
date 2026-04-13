import { state } from "./state.js";
import { updateRelations } from "./relationManager.js";
import { moveIndicator } from "./menu.js";
import { hideFloatingPanel } from "./detail.js"
import { getMinScaleForCurrentPath, resolveWheelScale, updateScaleForNodes } from "./zoom.js";
import { logEvent } from "/analytics.js";

const canvas = document.getElementById("universe-canvas");
const universeView = document.getElementById("universe-view");
const ctx = canvas.getContext("2d");

function updateViewportCssVars() {
    const root = document.documentElement;
    const viewport = getViewportSize();
    root.style.setProperty("--app-vh", `${viewport.height}px`);

    const vv = window.visualViewport;
    const browserBottomInset = vv
        ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop))
        : 0;
    root.style.setProperty("--app-bottom-inset", `${browserBottomInset}px`);
}

function getViewportSize() {
    const vv = window.visualViewport;
    if (vv) {
        return {
            width: vv.width,
            height: vv.height
        };
    }
    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

// 初始化尺�?+ 高清屏支�?
function setupCanvas() {
    const viewport = getViewportSize();
    const dpr = window.devicePixelRatio || 1;
    updateViewportCssVars();
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";
    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置
    ctx.scale(dpr, dpr);
}

function updateGridSizeToFitHeight() {
    const viewport = getViewportSize();
    state.baseWidth = viewport.width / 24;
    state.baseHeight = viewport.height;
}

// 限制 Y 方向边界
export function clampOffsetY(offsetY) {
    const totalHeight = state.baseHeight * state.currentScale;
    const minY = -totalHeight + canvas.height / (window.devicePixelRatio || 1); 
    const maxY = 0;
    return Math.min(Math.max(offsetY, minY), maxY);
}

// 限制 X 方向边界
export function clampOffsetX(offsetX) {
    const totalWidth = state.baseWidth * state.currentScale * 24;
    const minX = -totalWidth + canvas.width / (window.devicePixelRatio || 1);
    const maxX = 0;
    return Math.min(Math.max(offsetX, minX), maxX);
}

export function getMobileFocusedNodeAnchor() {
    const ratioX = 100 / 440;
    const ratioY = 460 / 956;
    const vv = window.visualViewport;
    if (vv) {
        return {
            x: vv.offsetLeft + vv.width * ratioX,
            y: vv.offsetTop + vv.height * ratioY
        };
    }
    return {
        x: ratioX * window.innerWidth,
        y: ratioY * window.innerHeight
    };
}

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let isPinching = false;
let pinchStartDistance = 0;
let pinchStartScale = 1;
let pinchStartPanX = 0;
let pinchStartPanY = 0;
let pinchStartCenterX = 0;
let pinchStartCenterY = 0;

function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    updateRelations();
}

function getTouchDistance(touchA, touchB) {
    return Math.hypot(touchB.clientX - touchA.clientX, touchB.clientY - touchA.clientY);
}

function getTouchCenter(touchA, touchB) {
    return {
        x: (touchA.clientX + touchB.clientX) / 2,
        y: (touchA.clientY + touchB.clientY) / 2
    };
}

function beginPinch(touchA, touchB) {
    const center = getTouchCenter(touchA, touchB);
    pinchStartDistance = Math.max(1, getTouchDistance(touchA, touchB));
    pinchStartScale = state.currentScale;
    pinchStartPanX = state.panX;
    pinchStartPanY = state.panY;
    pinchStartCenterX = center.x;
    pinchStartCenterY = center.y;
    isPinching = true;
    isDragging = false;

    const detailDiv = document.getElementById("word-details");
    if (detailDiv) {
        detailDiv.classList.add("hidden");
    }
    hideFloatingPanel();
}

function applyPinch(touchA, touchB) {
    if (!isPinching) return;

    const currentDistance = Math.max(1, getTouchDistance(touchA, touchB));
    const center = getTouchCenter(touchA, touchB);
    const minScale = getMinScaleForCurrentPath();
    const maxScale = state.scaleThreshold;

    const rawScale = pinchStartScale * (currentDistance / pinchStartDistance);
    const nextScale = Math.min(maxScale, Math.max(minScale, rawScale));

    const anchorWorldX = (pinchStartCenterX - pinchStartPanX) / pinchStartScale;
    const anchorWorldY = (pinchStartCenterY - pinchStartPanY) / pinchStartScale;

    state.currentScale = nextScale;
    state.panX = clampOffsetX(center.x - anchorWorldX * nextScale);
    state.panY = clampOffsetY(center.y - anchorWorldY * nextScale);

    draw();
    updateWordNodeTransforms();
    updateRelations();
    moveIndicator(state.currentScale);
    updateScaleForNodes(nextScale);
}

// 更新 word-nodes 的 position
export function updateWordNodeTransforms() {
    const scale = state.currentScale;
    const totalWidth = state.baseWidth * scale * 24;
    const totalHeight = state.baseHeight * scale;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    const nodes = document.querySelectorAll(".word-node");

    nodes.forEach(node => {
        const xRatio = +node.dataset.x;
        const yRatio = +node.dataset.y;

        const baseX = xRatio * totalWidth + state.panX;
        const baseY = yRatio * totalHeight + state.panY;

        node.style.left = `0px`;
        node.style.top = `0px`;
        node.style.position = 'absolute';

        // On mobile, keep the focused node pinned to the requested viewport spot.
        const isFocusedNode = node.parentElement?.id === "focused-node-layer";
        if (isMobile && isFocusedNode) {
            const mobileAnchor = getMobileFocusedNodeAnchor();
            node.style.transform = `translate(${mobileAnchor.x}px, ${mobileAnchor.y}px)`;
            return;
        }

        node.style.transform = `translate(${baseX}px, ${baseY}px)`;
    });
}

// 拖拽事件监听
canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const detailDiv = document.getElementById("word-details");
    detailDiv.classList.add("hidden");
    hideFloatingPanel();
});

canvas.addEventListener("mousemove", (e) => {
    if (isDragging) {
        let offsetX = state.panX + (e.clientX - dragStartX);
        let offsetY = state.panY + (e.clientY - dragStartY);

        dragStartX = e.clientX;
        dragStartY = e.clientY;

        state.panX = clampOffsetX(offsetX);
        state.panY = clampOffsetY(offsetY);

        draw();
        updateWordNodeTransforms();
        updateRelations();
    }
});

canvas.addEventListener("mouseup", () => {
    endDrag();
});

canvas.addEventListener("mouseleave", () => {
    endDrag();
});

function canStartSingleFingerDrag(target) {
    return target === canvas || canvas.contains(target);
}

function handleTouchStart(e) {
    if (e.touches.length === 2) {
        beginPinch(e.touches[0], e.touches[1]);
        e.preventDefault();
        return;
    }

    if (e.touches.length !== 1) return;
    if (!canStartSingleFingerDrag(e.target)) return;
    const touch = e.touches[0];
    if (!touch) return;

    isPinching = false;
    isDragging = true;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    const detailDiv = document.getElementById("word-details");
    if (detailDiv) {
        detailDiv.classList.add("hidden");
    }
    hideFloatingPanel();
}

function handleTouchMove(e) {
    if (e.touches.length === 2) {
        if (!isPinching) {
            beginPinch(e.touches[0], e.touches[1]);
        }
        applyPinch(e.touches[0], e.touches[1]);
        e.preventDefault();
        return;
    }

    if (!isDragging || isPinching || e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;

    let offsetX = state.panX + (touch.clientX - dragStartX);
    let offsetY = state.panY + (touch.clientY - dragStartY);

    dragStartX = touch.clientX;
    dragStartY = touch.clientY;

    state.panX = clampOffsetX(offsetX);
    state.panY = clampOffsetY(offsetY);

    draw();
    updateWordNodeTransforms();
    updateRelations();
    e.preventDefault();
}

function handleTouchEnd(e) {
    if (e.touches.length >= 2) {
        beginPinch(e.touches[0], e.touches[1]);
        return;
    }

    if (isPinching && e.touches.length === 1) {
        isPinching = false;
        isDragging = true;
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        return;
    }

    if (e.touches.length === 0) {
        isPinching = false;
        endDrag();
    }
}

function handleTouchCancel() {
    isPinching = false;
    endDrag();
}

const touchSurface = universeView || canvas;
touchSurface.addEventListener("touchstart", handleTouchStart, { passive: false });
touchSurface.addEventListener("touchmove", handleTouchMove, { passive: false });
touchSurface.addEventListener("touchend", handleTouchEnd, { passive: true });
touchSurface.addEventListener("touchcancel", handleTouchCancel);

window.addEventListener("mouseup", endDrag);
window.addEventListener("blur", endDrag);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
        isPinching = false;
        endDrag();
    }
});

// 缩放事件监听
export function handleZoomWheel(e) {
    e.preventDefault();

    const scale = state.currentScale;
    const { newScale } = resolveWheelScale(scale, e.deltaY, {
        maxScale: state.scaleThreshold
    });

    // 获取当前的snapped scale 级别
    state.panX = e.clientX - (e.clientX - state.panX) * (newScale / scale);
    state.panY = e.clientY - (e.clientY - state.panY) * (newScale / scale);

    state.currentScale = newScale;
    console.log("scale:", Number(state.currentScale.toFixed(3)));
    state.panX = clampOffsetX(state.panX);
    state.panY = clampOffsetY(state.panY);

    draw();
    updateWordNodeTransforms();
    updateRelations();
    moveIndicator(state.currentScale);
    hideFloatingPanel();

    updateScaleForNodes(newScale);
    logEvent("canvas_zoom", { deltaY: e.deltaY, scaleBefore: scale, scaleAfter: newScale });
}

canvas.addEventListener("wheel", handleZoomWheel, { passive: false });

// 主绘图函数
export function draw() {
    const offsetX = clampOffsetX(state.panX);
    const offsetY = clampOffsetY(state.panY);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gridWidth = state.baseWidth * state.currentScale;
    const gridHeight = state.baseHeight * state.currentScale;
    const lonCount = 24;

    drawGrid(offsetX, offsetY, gridWidth, gridHeight, lonCount);
    drawSpecialLatLines(offsetX, offsetY, gridHeight, gridWidth * lonCount, gridWidth);
    drawTimezoneLabels(offsetX, offsetY, gridWidth, lonCount);
}

function drawTimezoneLabels(offsetX, offsetY, gridWidth, lonCount) {
    // Ruler mode: keep longitude labels pinned to top edge.
    ctx.save();
    ctx.fillStyle = "#665539";
    ctx.font = `15px ChillDINGothic`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const fixedTopY = 18;
    const minVisibleX = 32;
    const maxVisibleX = window.innerWidth - 8;
    const minLabelSpacing = 26;
    let lastDrawnX = -Infinity;

    for (let lonIdx = 0; lonIdx < lonCount; lonIdx++) {
        const centerX = lonIdx * gridWidth + offsetX + gridWidth / 2;
        if (centerX < minVisibleX || centerX > maxVisibleX) continue;
        if (centerX - lastDrawnX < minLabelSpacing) continue;

        const tz = -11 + lonIdx;
        const label = tz > 0 ? `+${tz}` : `${tz}`;
        ctx.fillText(label, centerX, fixedTopY);
        lastDrawnX = centerX;
    }
    ctx.restore();
}

// �?高清屏优化版网格绘制
function drawGrid(offsetX, offsetY, gridWidth, gridHeight, lonCount) {
    ctx.strokeStyle = "#665539";
    ctx.lineWidth = 1;

    // 垂直�?
    for (let lonIdx = 0; lonIdx <= lonCount; lonIdx++) {
        const x = lonIdx * gridWidth + offsetX + 0.5; // 半像素对�?
        ctx.beginPath();
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + gridHeight);
        ctx.stroke();
    }

    // 顶部
    ctx.beginPath();
    ctx.moveTo(offsetX + 0.5, offsetY + 0.5);
    ctx.lineTo(offsetX + gridWidth * lonCount + 0.5, offsetY + 0.5);
    ctx.stroke();

    // 底部
    ctx.beginPath();
    ctx.moveTo(offsetX + 0.5, offsetY + gridHeight + 0.5);
    ctx.lineTo(offsetX + gridWidth * lonCount + 0.5, offsetY + gridHeight + 0.5);
    ctx.stroke();
}

function drawSpecialLatLines(offsetX, offsetY, gridHeight, totalWidth, gridWidth) {
    // Ruler mode: keep latitude labels pinned to left edge.
    ctx.save();
    const rulerLatitudes = [
        { lat: 0, label: "0°", color: "#665539", dash: [], lineWidth: 1 },
        { lat: 23.5, label: "23.5°N", color: "#665539", dash: [], lineWidth: 1 },
        { lat: -23.5, label: "23.5°S", color: "#665539", dash: [], lineWidth: 1 }
    ];

    rulerLatitudes.forEach(({ lat, label, color, dash, lineWidth }) => {
        const latIdx = (90 - lat) / 180;
        const y = latIdx * gridHeight + offsetY + 0.5;
        if (y < 0 || y > window.innerHeight) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + totalWidth, y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "14px ChillDINGothic";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, 8, y - 4);
    });

    ctx.restore();
    return;
}

function initialize() {
    setupCanvas(); // 替换原始初始�?
    updateGridSizeToFitHeight();
    updateScaleForNodes(state.currentScale);
    draw();
    updateWordNodeTransforms();
}

window.addEventListener("resize", initialize);
if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", initialize);
    window.visualViewport.addEventListener("scroll", initialize);
}
initialize();

