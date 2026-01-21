// relationsManager.js - 专门处理单词关系连线
import { state } from "./state.js";
import { updateWordFocus, zoomToWord } from "./wordFocus.js";

function getCenterPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

// 创建直线路径（hover时使用）
function createStraightPath(pos1, pos2) {
    return `M ${pos1.x} ${pos1.y} L ${pos2.x} ${pos2.y}`;
}

// 为每条线生成固定的波浪形状种子
const wormPathCache = new Map();

// 创建蚯蚓般的不规则波浪线路径（使用固定种子确保形状不变）
function createWormPath(pos1, pos2, lineId, relation) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 50) {
        // 距离太近时使用直线
        return createStraightPath(pos1, pos2);
    }
    
    // 检查缓存中是否已有这条线的波浪参数
    if (!wormPathCache.has(lineId)) {
        // 根据关系类型设置不同的波浪参数
        const segments = Math.max(3, Math.floor(distance / 60));
        const waveParams = [];
        
        // 概念相关：更弯曲，波浪更明显
        // 共同提出者：相对平缓一些
        const baseAmplitude = relation === '概念相关' ? 0 : 20;
        const amplitudeVariation = relation === '概念相关' ? 25 : 10;
        
        for (let i = 1; i <= segments; i++) {
            waveParams.push({
                amplitude: baseAmplitude + Math.random() * amplitudeVariation,
                direction: (Math.random() - 0.5) * 2,
                irregularity: 0.7 + Math.random() * 0.6,
                frequency: 1 + Math.sin(i * Math.PI * 2 + Math.random() * Math.PI) * 0.3
            });
        }
        
        wormPathCache.set(lineId, waveParams);
    }
    
    // 使用缓存的参数生成路径
    const waveParams = wormPathCache.get(lineId);
    const segments = waveParams.length;
    let path = `M ${pos1.x} ${pos1.y}`;
    
    // 计算垂直于连线的方向
    const perpX = -dy / distance;
    const perpY = dx / distance;
    
    for (let i = 0; i < segments; i++) {
        const t = (i + 1) / segments;
        
        // 基础插值点
        const baseX = pos1.x + dx * t;
        const baseY = pos1.y + dy * t;
        
        // 使用固定的波浪参数
        const params = waveParams[i];
        const offsetX = perpX * params.amplitude * params.direction * params.irregularity * params.frequency;
        const offsetY = perpY * params.amplitude * params.direction * params.irregularity * params.frequency;
        
        const controlX = baseX + offsetX;
        const controlY = baseY + offsetY;
        
        if (i === 0) {
            // 第一个点使用二次贝塞尔曲线
            path += ` Q ${controlX} ${controlY} ${baseX} ${baseY}`;
        } else {
            // 后续点使用平滑曲线连接
            const prevT = i / segments;
            const prevBaseX = pos1.x + dx * prevT;
            const prevBaseY = pos1.y + dy * prevT;
            
            // 创建平滑的控制点
            const smoothX = (prevBaseX + baseX) / 2 + offsetX * 0.5;
            const smoothY = (prevBaseY + baseY) / 2 + offsetY * 0.5;
            
            path += ` S ${smoothX} ${smoothY} ${baseX} ${baseY}`;
        }
    }
    
    // 最后连接到终点
    path += ` L ${pos2.x} ${pos2.y}`;
    
    return path;
}

// 画线svg relations
function drawLine(id1, id2, relation) {
    const svg = document.getElementById('connection-lines');
    const node1 = document.getElementById(id1);
    const node2 = document.getElementById(id2);
    if (!node1 || !node2) return;

    const word1 = window.allWords.find(w => w.id == id1);
    const word2 = window.allWords.find(w => w.id == id2);

    const pos1 = getCenterPosition(node1);
    const pos2 = getCenterPosition(node2);

    // 为每条线创建唯一ID
    const lineId = `${id1}-${id2}-${relation}`;
    
    // 两种关系都使用蚯蚓波浪线
    const mainPath = createWormPath(pos1, pos2, lineId, relation);
    const hoverPath = createStraightPath(pos1, pos2); // hover时变直线

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
    addLineInteractions(hitbox, visualLine, word1, word2, relation, id2, mainPath, hoverPath);

    // 保证 hitbox 在上面，视觉线在下面
    svg.appendChild(visualLine);
    svg.appendChild(hitbox);
}

function addLineInteractions(hitbox, visualLine, word1, word2, relation, targetId, mainPath, hoverPath) {
    let tooltipDiv = document.getElementById("tooltipDiv");

    hitbox.addEventListener('mouseenter', (e) => {
        // 强制隐藏任何之前的tooltip
        hideTooltip();
        
        // 高亮效果：变粗、变亮
        const currentWidth = parseFloat(visualLine.getAttribute('stroke-width'));
        visualLine.setAttribute('stroke-width', currentWidth * 1.8);
        visualLine.setAttribute('stroke', '#FFE135'); // 高亮颜色
        
        // hover时变成直线
        visualLine.setAttribute('d', hoverPath);
        // hover时取消虚线效果，显示为实线
        visualLine.setAttribute('stroke-dasharray', 'none');
        
        visualLine.style.filter = 'drop-shadow(0 0 4px rgba(255, 225, 53, 0.6))'; // 发光效果
        
        // 显示tooltip
        tooltipDiv.textContent = `${relation}： ${word2.term}`;
        tooltipDiv.style.position = 'fixed';
        tooltipDiv.style.background = 'rgba(0, 0, 0, 0.85)';
        tooltipDiv.style.color = '#FFE135';
        tooltipDiv.style.padding = '6px 10px';
        tooltipDiv.style.borderRadius = '6px';
        tooltipDiv.style.fontSize = '13px';
        tooltipDiv.style.fontWeight = '500';
        tooltipDiv.style.pointerEvents = 'none';
        tooltipDiv.style.zIndex = '9999';
        tooltipDiv.style.display = 'block';
        tooltipDiv.style.opacity = "1";
        tooltipDiv.style.border = '1px solid #FFE135';
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

    hitbox.addEventListener('click', () => {
        hideTooltip();
        zoomToWord(targetId, state.currentScale);
        updateWordFocus();
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
    if (!thisWord || !thisWord.related_terms) return;
    
    // 1. 绘制概念相关的关系
    thisWord.related_terms.forEach(relation => {
        drawLine(state.focusedNodeId, relation.id, '概念相关');
    });

    // 2. 绘制共同提出者的关系
    if (Array.isArray(thisWord.proposers)) {
        // 当前词的 proposer 名称列表
        const proposerNames = thisWord.proposers.map(p => p.name);

        window.allWords.forEach(otherWord => {
            if (otherWord.id === thisWord.id) return; // 跳过自己
            if (!Array.isArray(otherWord.proposers)) return;

            // 判断是否有共同 proposer
            const hasCommon = otherWord.proposers.some(p => proposerNames.includes(p.name));
            if (hasCommon) {
                drawLine(thisWord.id, otherWord.id, "共同提出者");
            }
        });
    }
}

// 导出隐藏tooltip函数，供其他模块使用
export { hideTooltip };