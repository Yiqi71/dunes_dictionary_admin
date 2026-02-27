// relationsManager.js - 专门处理单词关系连线
import { state } from "./state.js";
import { updateWordFocus, zoomToWord } from "./wordFocus.js";
import { logEvent } from "/analytics.js";

const connectionLines = document.getElementById("connection-lines");
const universeCanvas = document.getElementById("universe-canvas");

function getLangText(value, lang) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(" ");
    if (typeof value === "object") {
        return value[lang] || value.zh || value.en || "";
    }
    return "";
}

if (connectionLines && universeCanvas) {
    connectionLines.addEventListener("wheel", (e) => {
        const forwarded = new WheelEvent("wheel", {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            clientX: e.clientX,
            clientY: e.clientY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            bubbles: true,
            cancelable: true
        });
        universeCanvas.dispatchEvent(forwarded);
        e.preventDefault();
    }, { passive: false });

    const forwardMouseEvent = (type, e) => {
        const forwarded = new MouseEvent(type, {
            clientX: e.clientX,
            clientY: e.clientY,
            screenX: e.screenX,
            screenY: e.screenY,
            button: e.button,
            buttons: e.buttons,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            bubbles: true,
            cancelable: true
        });
        universeCanvas.dispatchEvent(forwarded);
    };

    connectionLines.addEventListener("mousedown", (e) => {
        forwardMouseEvent("mousedown", e);
    });

    connectionLines.addEventListener("mousemove", (e) => {
        forwardMouseEvent("mousemove", e);
    });

    connectionLines.addEventListener("mouseup", (e) => {
        forwardMouseEvent("mouseup", e);
    });
}

function getCenterPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function getRelationLabel(relation, lang) {
    const isEn = lang === "en";
    switch (relation) {
        case "概念相关":
            return isEn ? "Conceptually Related" : "概念相关";
        case "共同提出者":
            return isEn ? "Same Proponent" : "同一提出者";
        default:
            return relation || "";
    }
}

// 创建直线路径（hover时使用）
function createStraightPath(pos1, pos2) {
    return `M ${pos1.x} ${pos1.y} L ${pos2.x} ${pos2.y}`;
}

function getRectEdgePoint(element, center, dirX, dirY, padding = 2) {
    const rect = element.getBoundingClientRect();
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;

    const safeDx = Math.abs(dirX) < 1e-6 ? 1e-6 : Math.abs(dirX);
    const safeDy = Math.abs(dirY) < 1e-6 ? 1e-6 : Math.abs(dirY);
    const t = Math.min(halfW / safeDx, halfH / safeDy);
    const edgeX = center.x + dirX * t;
    const edgeY = center.y + dirY * t;

    return {
        x: edgeX + dirX * padding,
        y: edgeY + dirY * padding
    };
}

function getFannedEndpointPositions(node1, node2, index, total) {
    const center1 = getCenterPosition(node1);
    const center2 = getCenterPosition(node2);
    const dx = center2.x - center1.x;
    const dy = center2.y - center1.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 1) {
        return { start: center1, end: center2, slotOffset: 0 };
    }

    const baseAngle = Math.atan2(dy, dx);
    const hasFan = total > 1;
    const normalizedSlot = hasFan ? (index - (total - 1) / 2) : 0;
    const spreadStep = Math.min(0.2, 0.65 / Math.max(1, total - 1));
    const angleOffset = normalizedSlot * spreadStep;

    const startDirX = Math.cos(baseAngle + angleOffset);
    const startDirY = Math.sin(baseAngle + angleOffset);
    const endDirX = Math.cos(baseAngle - angleOffset * 0.35);
    const endDirY = Math.sin(baseAngle - angleOffset * 0.35);

    return {
        start: getRectEdgePoint(node1, center1, startDirX, startDirY, 2),
        end: getRectEdgePoint(node2, center2, -endDirX, -endDirY, 2),
        slotOffset: normalizedSlot
    };
}

function createCurvedPath(pos1, pos2, relation, slotOffset) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 30) {
        return createStraightPath(pos1, pos2);
    }

    const ux = dx / distance;
    const uy = dy / distance;
    const perpX = -uy;
    const perpY = ux;

    const baseCurve = relation === "概念相关" ? 0.14 : 0.1;
    const longDistanceBoost = 1 + Math.min(0.35, Math.max(0, distance - 420) / 1400);
    const rawCurve = distance * baseCurve * longDistanceBoost;
    const dynamicMaxCurve = Math.max(40, distance * 0.1);
    const curveMagnitude = Math.min(dynamicMaxCurve, Math.max(24, rawCurve));
    const direction = slotOffset === 0 ? (relation === "概念相关" ? 1 : -1) : Math.sign(slotOffset);
    const slotBoost = 1 + Math.min(0.9, Math.abs(slotOffset) * 0.2);
    const bulge = curveMagnitude * direction * slotBoost;

    const c1x = pos1.x + ux * distance * 0.25 + perpX * bulge;
    const c1y = pos1.y + uy * distance * 0.25 + perpY * bulge;
    const c2x = pos1.x + ux * distance * 0.75 + perpX * bulge;
    const c2y = pos1.y + uy * distance * 0.75 + perpY * bulge;

    return `M ${pos1.x} ${pos1.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${pos2.x} ${pos2.y}`;
}

// 画线svg relations
function drawLine(id1, id2, relation, fanIndex = 0, fanTotal = 1) {
    const svg = document.getElementById('connection-lines');
    const node1 = document.getElementById(id1);
    const node2 = document.getElementById(id2);
    if (!node1 || !node2) return;

    const word1 = window.allWords.find(w => w.id == id1);
    const word2 = window.allWords.find(w => w.id == id2);

    const { start: pos1, end: pos2, slotOffset } = getFannedEndpointPositions(node1, node2, fanIndex, fanTotal);

    // 使用平滑弧线，按线序号做分流
    const mainPath = createCurvedPath(pos1, pos2, relation, slotOffset);

    // 视觉线 - 使用path元素
    const visualLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    visualLine.setAttribute('d', mainPath);
    visualLine.setAttribute('fill', 'none');
    visualLine.setAttribute('stroke-linecap', 'round');
    visualLine.setAttribute('pointer-events', 'none');
    
    // 添加平滑过渡效果
    visualLine.style.transition = 'all 0.3s ease';

    // 根据关系类型设置不同样式
    switch (relation) {
        case '概念相关':
            visualLine.setAttribute('stroke', '#FFFCF4');
            visualLine.setAttribute('stroke-width', '1.8'); // 稍微粗一点
            visualLine.setAttribute('stroke-dasharray', '6,5'); // 虚线：3像素实线，2像素间隔
            break;
        case '共同提出者':
            visualLine.setAttribute('stroke', '#FFFCF4');
            visualLine.setAttribute('stroke-width', '1.4'); // 稍微细一点
            // visualLine.setAttribute('stroke-dasharray', '1,1'); 
            // 更细密的点线
            break;
        default:
            visualLine.setAttribute('stroke', '#FFFCF4');
            visualLine.setAttribute('stroke-width', '1.5');
    }

    // 点击/hover hitbox - 也使用相同路径但更粗
    const hitbox = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitbox.setAttribute('d', mainPath);
    hitbox.setAttribute('fill', 'none');
    hitbox.setAttribute('stroke', 'transparent');
    hitbox.setAttribute('stroke-width', '15');
    hitbox.setAttribute('pointer-events', 'stroke');
    hitbox.setAttribute('stroke-linecap', 'round');
    hitbox.style.cursor = 'crosshair';

    // 添加交互事件
    addLineInteractions(hitbox, visualLine, word1, word2, relation, id2, mainPath);

    // 保证 hitbox 在上面，视觉线在下面
    svg.appendChild(visualLine);
    svg.appendChild(hitbox);
}

function addLineInteractions(hitbox, visualLine, word1, word2, relation, targetId, mainPath) {
    let tooltipDiv = document.getElementById("tooltipDiv");

    hitbox.addEventListener('mouseenter', (e) => {
        // 强制隐藏任何之前的tooltip
        hideTooltip();
        
        // 高亮效果：变粗、变亮
        const currentWidth = parseFloat(visualLine.getAttribute('stroke-width'));
        visualLine.setAttribute('stroke-width', currentWidth * 1.8);
        visualLine.setAttribute('stroke', '#F9D67A'); // 高亮颜色
        
        // hover时取消虚线效果，显示为实线
        visualLine.setAttribute('stroke-dasharray', 'none');
        
        visualLine.style.filter = 'drop-shadow(0 0 4px rgba(249, 214, 122, 0.6))'; // 发光效果
        
        // 显示tooltip
        const wordLabel = getLangText(word2?.term, state.currentLang) || String(targetId || "");
        const relationLabel = getRelationLabel(relation, state.currentLang);
        tooltipDiv.textContent = `${relationLabel}: ${wordLabel}`;
        tooltipDiv.style.position = 'fixed';
        tooltipDiv.style.background = '#1E1C16';
        tooltipDiv.style.color = '#F9D67A';
        tooltipDiv.style.padding = '6px 10px';
        tooltipDiv.style.borderRadius = '6px';
        tooltipDiv.style.fontSize = '13px';
        tooltipDiv.style.fontWeight = '500';
        tooltipDiv.style.pointerEvents = 'none';
        tooltipDiv.style.zIndex = '9999';
        tooltipDiv.style.display = 'block';
        tooltipDiv.style.opacity = "1";
        tooltipDiv.style.border = '1px solid #F9D67A';
        tooltipDiv.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
        tooltipDiv.style.left = (e.clientX + 12) + 'px';
        tooltipDiv.style.top = (e.clientY + 12) + 'px';
    });

    hitbox.addEventListener('mousemove', (e) => {
        if (tooltipDiv && tooltipDiv.style.opacity === '1') {
            tooltipDiv.style.left = (e.clientX + 12) + 'px';
            tooltipDiv.style.top = (e.clientY + 12) + 'px';
        }
    });

    hitbox.addEventListener('mouseleave', () => {
        // 恢复原始路径
        visualLine.setAttribute('d', mainPath);
        visualLine.style.filter = 'none'; // 移除发光
        
        // 恢复原始颜色和粗细
        switch (relation) {
            case '概念相关':
                visualLine.setAttribute('stroke', '#FFFCF4');
                visualLine.setAttribute('stroke-width', '1.8');
                visualLine.setAttribute('stroke-dasharray', '6,5'); // 恢复虚线
                break;
            case '共同提出者':
                visualLine.setAttribute('stroke', '#FFFCF4');
                visualLine.setAttribute('stroke-width', '1.4');
                visualLine.setAttribute('stroke-dasharray', '1,1'); // 恢复点线
                break;
            default:
                visualLine.setAttribute('stroke', '#FFFCF4');
                visualLine.setAttribute('stroke-width', '1.5');
        }
        
        hideTooltip();
    });

    hitbox.addEventListener('pointerdown', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const fromWordId = state.focusedNodeId;
        console.log("[relation click]", { from: fromWordId, to: targetId, relation });
        hideTooltip();
        await zoomToWord(targetId, state.currentScale, { animated: true, duration: 800 });
        updateWordFocus(targetId);
        logEvent("link_click", {
            fromWordId,
            toWordId: targetId,
            relation
        });
    });
}

// 统一的tooltip隐藏函数
function hideTooltip() {
    const tooltipDiv = document.getElementById("tooltipDiv");
    if (tooltipDiv) {
        tooltipDiv.style.opacity = '0';
        tooltipDiv.style.display = 'none';
        tooltipDiv.textContent = '';
        // 清除可能的样式
        tooltipDiv.style.border = '';
        tooltipDiv.style.boxShadow = '';
        tooltipDiv.style.color = '';
        tooltipDiv.style.background = '';
    }
}

// 更新所有关系连线
export function updateRelations() {
    const svg = document.getElementById('connection-lines');
    svg.innerHTML = '';

    // 每次更新关系时都隐藏tooltip，防止滞留
    hideTooltip();

    if (!state.focusedNodeId) return;

    const thisWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!thisWord) return;
    
    const lineSpecs = [];
    const drawn = new Set();
    const addLineSpec = (id1, id2, relation, key) => {
        if (key && drawn.has(key)) return;
        if (key) drawn.add(key);
        lineSpecs.push({ id1, id2, relation });
    };

    // 1. 收集概念相关关系

    if (Array.isArray(thisWord.related_terms)) {
        thisWord.related_terms.forEach(relation => {
            const key = `${state.focusedNodeId}->${relation.id}:concept`;
            addLineSpec(state.focusedNodeId, relation.id, '概念相关', key);
        });
    }

    // 1b. 收集反向相关：其他词条指向当前词条
    window.allWords.forEach(otherWord => {
        if (!otherWord || otherWord.id === thisWord.id) return;
        if (!Array.isArray(otherWord.related_terms)) return;
        const hits = otherWord.related_terms.some(r => r && r.id == thisWord.id);
        if (!hits) return;
        const key = `${state.focusedNodeId}->${otherWord.id}:concept`;
        addLineSpec(state.focusedNodeId, otherWord.id, '概念相关', key);
    });

    // 2. 收集共同提出者关系
    if (Array.isArray(thisWord.proposers)) {
        const proposerNames = thisWord.proposers
            .map(p => p?.name?.zh)
            .filter(Boolean);

        window.allWords.forEach(otherWord => {
            if (otherWord.id === thisWord.id) return; // 跳过自己
            if (!Array.isArray(otherWord.proposers)) return;

            // 判断是否有共同 proposer
            const hasCommon = otherWord.proposers.some(p => {
                const otherName = p?.name?.zh;
                return otherName && proposerNames.includes(otherName);
            });
            if (hasCommon) {
                const key = `${thisWord.id}->${otherWord.id}:proposer`;
                addLineSpec(thisWord.id, otherWord.id, "共同提出者", key);
            }
        });
    }

    if (lineSpecs.length === 0) return;

    const nodeCenterCache = new Map();
    const getNodeCenter = (id) => {
        if (nodeCenterCache.has(id)) return nodeCenterCache.get(id);
        const node = document.getElementById(String(id));
        const center = node ? getCenterPosition(node) : null;
        nodeCenterCache.set(id, center);
        return center;
    };

    const grouped = new Map();
    lineSpecs.forEach(spec => {
        const groupKey = String(spec.id1);
        if (!grouped.has(groupKey)) grouped.set(groupKey, []);
        grouped.get(groupKey).push(spec);
    });

    grouped.forEach((specs) => {
        const sourceCenter = getNodeCenter(specs[0].id1);
        if (sourceCenter) {
            specs.sort((a, b) => {
                const aCenter = getNodeCenter(a.id2);
                const bCenter = getNodeCenter(b.id2);
                const angleA = aCenter ? Math.atan2(aCenter.y - sourceCenter.y, aCenter.x - sourceCenter.x) : 0;
                const angleB = bCenter ? Math.atan2(bCenter.y - sourceCenter.y, bCenter.x - sourceCenter.x) : 0;
                return angleA - angleB;
            });
        }

        const total = specs.length;
        specs.forEach((spec, index) => {
            drawLine(spec.id1, spec.id2, spec.relation, index, total);
        });
    });
}

// 导出隐藏tooltip函数，供其他模块使用
export { hideTooltip };
