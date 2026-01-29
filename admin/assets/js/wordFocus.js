// wordFocus.js - 专门处理单词焦点和缩放
import { state } from "./state.js";
import { draw, updateWordNodeTransforms, updateScaleForNodes } from "./uni-canvas.js";
import { updateRelations } from "./relationManager.js";
import { renderPanelSections , showFloatingPanel, scrollToTop} from "./detail.js";
import { moveIndicator } from "./menu.js";


let focusedWord = null;
const MENU_COMPACT_CLASS = "menu-compact";
const noteAuthor = {
    role: { zh: "编辑", en: "Editor" },
    name: { zh: "陈飞樾", en: "Chen Feiyue" }
};

function setMenuCompact(enabled) {
    const sideMenu = document.getElementById("side-menu");
    if (!sideMenu) return;
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

export function zoomToWord(id, newScale) {
    const node = document.getElementById(id);
    if (!node) return;

    const oldScale = state.currentScale;

    // 用逻辑坐标而不是 rect
    const logicalX = parseFloat(node.dataset.x); // 假设0-1范围
    const logicalY = parseFloat(node.dataset.y);

    const container = document.getElementById('word-nodes-container');
    const containerRect = container.getBoundingClientRect();
    const worldX = logicalX * containerRect.width;
    const worldY = logicalY * containerRect.height;

    // 屏幕中心
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    // 补偿 node 尺寸
    const rect = node.getBoundingClientRect();
    const nodeWidth = rect.width / oldScale; 
    const nodeHeight = rect.height / oldScale;

    state.panX = viewportCenterX - (worldX * newScale + 318 / 2);
    state.panY = viewportCenterY - (worldY * newScale + 210 / 2);

    state.currentScale = newScale;

    draw();
    updateWordNodeTransforms();
    updateRelations();
    updateScaleForNodes(newScale);
    moveIndicator(newScale);
}

// 修改现有的 updateWordFocus 函数
export function updateWordFocus() {
    // 清除之前聚焦的单词
    if (focusedWord) {
        focusedWord.classList.remove('focused');
        focusedWord = null;
        state.focusedNodeId = null;
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
        let minDistance = window.innerHeight / 4;

        document.querySelectorAll('.word-node').forEach(node => {
            const rect = node.getBoundingClientRect();
            const nodeCenter = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };

            // 计算距离
            const distance = Math.sqrt(
                Math.pow(nodeCenter.x - viewportCenter.x, 2) +
                Math.pow(nodeCenter.y - viewportCenter.y, 2)
            );

            // 更新最近单词
            if (distance < minDistance) {
                minDistance = distance;
                closestWord = node;
            }
        });

        // 聚焦最近的单词
        if (closestWord) {
            closestWord.classList.add('focused');
            focusedWord = closestWord;
            state.focusedNodeId = closestWord.id;
            setMenuCompact(true);

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
        }
    } else {
        setMenuCompact(false);
    }
}

export function updateWordDetails() {
    if (!state.focusedNodeId) return;
    const word = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!word) return;

    const lang = state.currentLang || "zh";

    // 显示details
    const detailDiv = document.getElementById("word-details");
    detailDiv.classList.remove('hidden');

    detailDiv.addEventListener('wheel', function (e) {
        e.stopPropagation();
        e.preventDefault();
    }, {
        passive: false
    });

    // term section
    // const termTitle = document.querySelector('#term .detail-title');
    // const termMainEl = document.querySelector('#term .term-main');
    // const originalTermEl = document.querySelector('#term .term-ori');
    // termTitle.textContent = String(word.id).padStart(4, '0');
    // termMainEl.textContent = word.term || '未知单词';
    // originalTermEl.textContent = word.termOri || '无';

    // const node = document.getElementById(word.id);
    // const termDiv = document.getElementById("term");
    // termDiv.style.backgroundColor = node.style.backgroundColor;

    // image section
    const imageTitle = document.querySelector('#image .detail-title');
    const imageEl = document.querySelector('#image img');
    if(state.currentLang=="en"){
        imageTitle.textContent = 'Concept Image';
    }else if(state.currentLang=="zh"){
        imageTitle.textContent = '概念图片';
    }
    if (word.diagrams && word.diagrams.length > 0) {
        imageEl.src = word.concept_image;
        imageEl.alt = word.term?.[lang];
        imageEl.style.display = 'block';
    } else {
        imageEl.src = '';
        imageEl.style.display = 'none';
    }

    // proposer section
    const proposerTitle = document.querySelector('#proposer .detail-title');
    const proposerP = document.querySelector('#proposer p');
    const proposerImg = document.querySelector('#proposer img');
    if(state.currentLang=="en"){
        proposerTitle.textContent = 'Proposer';
    }else if(state.currentLang=="zh"){
        proposerTitle.textContent = '提出人';
    }
    if (word.proposers && word.proposers.length>0) {
        proposerP.textContent = word.proposers[0].name?.[lang];
        proposerImg.src = word.proposers[0].image;
        proposerImg.alt = word.proposers[0].name?.[lang] || '';
        proposerImg.style.display = 'block';
    } else {
        proposerP.textContent = '未知';
        proposerImg.style.display = 'none';
    }

    // comment section
    const commentTitle = document.querySelector('#comment .detail-title');
    const commentContent = document.querySelector('#comment #comment-content');

    if(state.currentLang=="en"){
        commentTitle.textContent = 'Notes';
    }else if(state.currentLang=="zh"){
        commentTitle.textContent = '笔记';
    }
    if (word.commentAbs) {
        const comment = word.commentAbs;
        commentContent.innerHTML = `${comment.content?.[lang]} <p>${noteAuthor.role[lang]}</p><p>${noteAuthor.name[lang]}</p>`;
    } else {
        commentContent.innerHTML = `<h3>暂无笔记</h3> <p></p>`;
    }
}

function hideNearbyNodes(focusedNode) {
    document.querySelectorAll('.word-node').forEach(node => {
        if (node === focusedNode) return;
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



