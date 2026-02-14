import { state } from "./state.js";
import { updateRelations } from "./relationManager.js";
import { moveIndicator } from "./menu.js";
import { hideFloatingPanel } from "./detail.js"
import { logEvent } from "/analytics.js";

const canvas = document.getElementById("universe-canvas");
const ctx = canvas.getContext("2d");

// 初始化尺�?+ 高清屏支�?
function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置
    ctx.scale(dpr, dpr);
}

function updateGridSizeToFitHeight() {
    state.baseWidth = window.innerWidth / 24;
    state.baseHeight = window.innerHeight;
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

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// 更新 word-nodes 的位�?
export function updateWordNodeTransforms() {
    const scale = state.currentScale;
    const totalWidth = state.baseWidth * scale * 24;
    const totalHeight = state.baseHeight * scale;

    const nodes = document.querySelectorAll(".word-node");

    nodes.forEach(node => {
        const xRatio = +node.dataset.x;
        const yRatio = +node.dataset.y;

        const baseX = xRatio * totalWidth + state.panX;
        const baseY = yRatio * totalHeight + state.panY;

        node.style.left = `0px`;
        node.style.top = `0px`;
        node.style.position = 'absolute';
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
    isDragging = false;
    updateRelations();
});

canvas.addEventListener("mouseleave", () => {
    isDragging = false;
    updateRelations();
});

// 缩放事件监听
export function handleZoomWheel(e) {
    e.preventDefault();

    let scale = state.currentScale;
    const isPreview = window.location.pathname.endsWith('preview.html');
    const minScale = isPreview ? 1.2 : 1;
    const zoomStep = 0.28;
    const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
    let newScale = Math.min(state.scaleThreshold, Math.max(minScale, scale + delta));

    // 获取当前�?snapped scale 级别
    const currentSnapped = getSnappedScale(scale);
    const newSnapped = getSnappedScale(newScale);

    // 如果当前�?scale 4-5 范围内，直接跳转
    if (currentSnapped === 4 || currentSnapped === 5) {
        if (delta > 0) {
            // 向上滚动 - zoom in
            if (currentSnapped === 4) {
                newScale = state.scaleThreshold; // 跳到 scale 5
            } else {
                newScale = state.scaleThreshold; // 已经�?scale 5，继续放大到最�?
            }
        } else {
            // 向下滚动 - zoom out  
            if (currentSnapped === 5) {
                newScale = 10; // 跳到 scale 4 的最大值，避免重复触发
            } else {
                newScale = scale+delta; // �?scale 4 跳到 scale 3 的最大�?
            }
        }
    }

    state.panX = e.clientX - (e.clientX - state.panX) * (newScale / scale);
    state.panY = e.clientY - (e.clientY - state.panY) * (newScale / scale);

    state.currentScale = newScale;
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

// 辅助函数：获�?snapped scale 级别
function getSnappedScale(scale) {
    if (scale < 1.5) return 1;
    else if (scale < 5) return 2;
    else if (scale < 10) return 3;
    else if (scale < 11) return 4;
    else return 5;
}

export function updateScaleForNodes(newScale) {
    let snapped;
    if (newScale < 1.5) snapped = 1;
    else if (newScale < 5) snapped = 2;
    else if (newScale < 10) snapped = 3;
    else if (newScale < 11) snapped = 4;
    else snapped = 5;

    document.body.dataset.scale = snapped;
}

// 主绘图函�?
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
    ctx.save();
    ctx.fillStyle = "#665539";
    ctx.font = `15px ChillDINGothic`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    for (let lonIdx = 0; lonIdx < lonCount; lonIdx++) {
        const centerX = lonIdx * gridWidth + offsetX + gridWidth / 2;
        const topY = offsetY + 25;
        const bottomY = offsetY + state.baseHeight * state.currentScale - 10;

        const tz = -11 + lonIdx;
        const label = tz > 0 ? `+${tz}` : `${tz}`;

        ctx.fillText(label, centerX, topY);
        ctx.fillText(label, centerX, bottomY);
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
    ctx.save();
    const latitudes = [
        { lat: 0, label: "0°", color: "#665539", dash: [], lineWidth: 1 },
        { lat: 23.5, label: "23.5°N", color: "#665539", dash: [], lineWidth: 1 },
        { lat: -23.5, label: "23.5°S", color: "#665539", dash: [], lineWidth: 1 }
    ];

    latitudes.forEach(({ lat, label, color, dash, lineWidth }) => {
        const latIdx = (90 - lat) / 180;
        const y = latIdx * gridHeight + offsetY + 0.5; // 半像素对�?

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);

        ctx.beginPath();
        ctx.moveTo(offsetX + gridWidth, y);
        ctx.lineTo(offsetX + totalWidth - gridWidth, y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "14px ChillDINGothic";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillText(label, offsetX + gridWidth / 2, y);
        ctx.fillText(label, offsetX + totalWidth - gridWidth / 2, y);
    });

    ctx.restore();
}

function initialize() {
    setupCanvas(); // 替换原始初始�?
    updateGridSizeToFitHeight();
    draw();
    updateWordNodeTransforms();
}

window.addEventListener("resize", initialize);
initialize();

