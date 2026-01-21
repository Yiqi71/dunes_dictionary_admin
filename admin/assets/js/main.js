// 状态变�?
import { state } from "./state.js";
import { draw, updateWordNodeTransforms, updateScaleForNodes, handleZoomWheel } from "./uni-canvas.js";
import { country_bounding_boxes } from "./countryBoundingBoxes.js";
import { renderPanelSections } from "./detail.js";
import {updateRelations} from "./relationManager.js";
import {
    zoomToWord,
    updateWordDetails,
    updateWordFocus
} from "./wordFocus.js";
import { logEvent, startWordView, endWordView } from "/analytics.js";

import { yearPeriods } from "./menu.js";

let sessionStartTs = null;

function endSession(reason = "unknown") {
    if (sessionStartTs === null) return;
    const durationMs = Date.now() - sessionStartTs;
    logEvent("session_end", { durationMs, reason });
    sessionStartTs = null;
}

const langBtn = document.getElementById("language-icon");
// 点击按钮切换语言
langBtn.addEventListener("click", () => {
    const html = document.documentElement; 
    const prevLang = html.lang;
    html.lang = html.lang.startsWith('en') ? 'zh' : 'en';
    state.currentLang = html.lang;
    langBtn.textContent = html.lang;
    logEvent("lang_toggle", { from: prevLang, to: html.lang });
    // if (state.currentLang === "zh") {
    //     state.currentLang = "en";
    //     langBtn.textContent = "English";
    // } else {
    //     state.currentLang = "zh";
    //     langBtn.textContent = "中文";
    // }

    // 重新渲染节点上的文字
    document.querySelectorAll('.word-node').forEach(node => {
        const wordId = node.id;
        const word = window.allWords.find(w => w.id == wordId);
        if (!word) return;
        const lang = state.currentLang;

        const termMain = node.querySelector('.term-main');
        if(termMain) termMain.textContent = word.term?.[lang] || '未知单词';
    });

    // 重新渲染tab上的文字
    document.querySelectorAll('button').forEach(button => {
        if(!button) return;
    
        // 包一�?span，只旋转文字，不影响 SVG
        let span = button.querySelector('span');
        if (!span) {
            const text = button.innerHTML;
            button.innerHTML = `<span>${text}</span>`;
            span = button.querySelector('span');
        }

        // 切换文字
        if (button.innerHTML.includes("词条") || button.innerHTML.includes("ENTRY")) {
            button.querySelector('span').textContent = state.currentLang === "en" ? "ENTRY" : "词条";
        }
        if (button.innerHTML.includes("笔记") || button.innerHTML.includes("NOTES")) {
            button.querySelector('span').textContent = state.currentLang === "en" ? "NOTES" : "笔记";
        }

        // 设置旋转和偏�?
        if (state.currentLang === "en") {
            span.style.display = "inline-block"; // 必须�?inline-block 才能旋转
            span.style.transform = "translateX(-10px) rotate(-90deg)";
        } else {
            span.style.transform = "rotate(0deg) translateY(0)";
        }
    });


    // 如果需要更新浮�?
    if(state.focusedNodeId) {
        updateWordFocus();
        renderPanelSections();
    }else{
        updateWordFocus();
    }
});

window.allWords = [];
window.about = {};

const yearPeriodColors = [
    "#F9D67A", // 空白/-2000
    "#FADD91", // 1700
    "#FAE2A5", // 1800
    "#FAE8BA", // 1850
    "#FAEED0", // 1900
    "#F9F3E3" // 1950-now
];

function getWordColor(wordYear) {
    // Handle invalid years
    if (isNaN(wordYear)) {
        return yearPeriodColors[0]; // Default to first period color
    }
    
    // Find which year period this word belongs to
    let periodIndex = 0;
    
    for (let i = yearPeriods.length - 2; i >= 0; i--) {
        const period = yearPeriods[i];
        if (period.year !== null && wordYear >= period.year) {
            periodIndex = i;
            break;
        }
    }
    
    // Ensure we don't go out of bounds
    if (periodIndex >= yearPeriodColors.length) {
        periodIndex = yearPeriodColors.length - 1;
    }
    return yearPeriodColors[periodIndex];
}

// nodes
let wordsOnGrid = {};
let usedPositions = new Set(); // 记录已使用的位置
let minGrid = 2;

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getCountryBoundary(countryCode) {
    const box = country_bounding_boxes[countryCode];
    if (!box) return [-180, -90, 180, 90];
    return box[1]; // [minLon, minLat, maxLon, maxLat]
}

function getCountryCenter(countryCode) {
    const box = country_bounding_boxes[countryCode];
    if (!box) {
        // 没有数据时，返回世界中心
        return { left: 50, top: 50 };
    }

    const [minLon, minLat, maxLon, maxLat] = box[1];

    const centerLon = (minLon + maxLon) / 2; // 中心经度
    const centerLat = (minLat + maxLat) / 2; // 中心纬度

    // 把经纬度转成百分比坐标（和你�?renderWordUniverse 里一致）
    const left = (centerLon + 180) / 3.6;   // -180~180 �?0~100
    const top = (90 - centerLat) / 1.8;     // 90~-90 �?0~100

    return { left, top };
}


// 生成全地图网格（百分比坐标）
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

function getCountryGridPoints(countryCode) {
    const [minLon, minLat, maxLon, maxLat] = getCountryBoundary(countryCode);

    const allPoints = generateGridPoints();
    const availablePoints = allPoints.filter(({
        left,
        top
    }) => {
        // 转换百分比到经纬�?
        const lon = left * 3.6 - 180;
        const lat = 90 - top * 1.8;
        return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
    });

    shuffleArray(availablePoints); // 只打乱国家内部格子顺�?
    return availablePoints;
}

// 新增：扩散算�?- 从国家中心向外扩散寻找可用位�?
function findAvailablePositions(countryCode, wordCount) {
    const countryPoints = getCountryGridPoints(countryCode);
    const positions = [];
    
    // 首先使用国家内部的格�?
    for (let i = 0; i < countryPoints.length && positions.length < wordCount; i++) {
        const point = countryPoints[i];
        const key = `${Math.round(point.left)},${Math.round(point.top)}`;
        if (!usedPositions.has(key)) {
            positions.push(point);
            usedPositions.add(key);
        }
    }
    
    // 如果国家内部格点不够，向外扩�?
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

// 从中心点向外螺旋扩散寻找可用位置
function expandFromCenter(center, neededCount, excludePoints = []) {
    const positions = [];
    const excludeKeys = new Set(
        excludePoints.map(p => `${Math.round(p.left)},${Math.round(p.top)}`)
    );
    
    let radius = minGrid;
    const maxRadius = 50; // 最大扩散半�?
    
    while (positions.length < neededCount && radius <= maxRadius) {
        const ringPositions = generateRingPositions(center, radius);
        
        for (const pos of ringPositions) {
            if (positions.length >= neededCount) break;
            
            const key = `${Math.round(pos.left)},${Math.round(pos.top)}`;
            
            // 检查是否在地图范围内，未被使用，且不在排除列表�?
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

// 生成指定半径的环形位�?
function generateRingPositions(center, radius) {
    const positions = [];
    const steps = Math.max(8, Math.floor(2 * Math.PI * radius / minGrid)); // 根据半径调整密度
    
    for (let i = 0; i < steps; i++) {
        const angle = (2 * Math.PI * i) / steps;
        const left = center.left + radius * Math.cos(angle);
        const top = center.top + radius * Math.sin(angle);
        
        // 对齐到网�?
        const gridLeft = Math.round(left / minGrid) * minGrid;
        const gridTop = Math.round(top / minGrid) * minGrid;
        
        positions.push({ left: gridLeft, top: gridTop });
    }
    
    return positions;
}

// 检查位置是否有效（在地图范围内�?
function isValidPosition(pos) {
    return pos.left >= 5 && pos.left <= 95 && 
           pos.top >= 5 && pos.top <= 95;
}

// 优化后的位置分配算法
function allocatePositionsForCountries(wordsByCountry) {
    usedPositions.clear(); // 重置已使用位�?
    const countryPositions = {};
    
    // 按单词数量排序，优先分配单词多的国家
    const sortedCountries = Object.keys(wordsByCountry).sort((a, b) => {
        return wordsByCountry[b].length - wordsByCountry[a].length;
    });
    
    for (const country of sortedCountries) {
        const wordCount = wordsByCountry[country].length;
        countryPositions[country] = findAvailablePositions(country, wordCount);
    }
    
    return countryPositions;
}


// 优化后的渲染函数
function renderWordUniverse(wordsData) {
    const lang = state.currentLang || "zh";
    console.log(lang);
    const wordNodesContainer = document.getElementById('word-nodes-container');
    wordNodesContainer.innerHTML = '';
    wordsOnGrid = {};

    // 按国家分�?
    const wordsByCountry = {};
    wordsData.forEach(word => {
        if (!wordsByCountry[word.proposing_country]) {
            wordsByCountry[word.proposing_country] = [];
        }
        wordsByCountry[word.proposing_country].push(word);
    });

    // 使用优化的位置分配算�?
    const countryPositions = allocatePositionsForCountries(wordsByCountry);

    // 渲染每个国家的节�?
    for (const country in wordsByCountry) {
        const words = wordsByCountry[country];
        const positions = countryPositions[country];

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            
            // 使用分配好的位置，如果位置不够就跳过
            if (i >= positions.length) {
                console.warn(`国家 ${country} 的单词数量超过可分配位置，跳过单�? ${word.term}`);
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
            <div class="detail-title">${String(word.id).padStart(4, '0')}</div>
            <div class="terms">
                <div class="term-main">${word.term?.[lang] || '未知单词'}</div>
                <div class="term-ori">${word.termOri || ''}</div>
            </div>
            `;
            node.style.left = `${leftPercent}%`;
            node.style.top = `${topPercent}%`;
            node.style.transform = `translate(-50%, -50%)`;

            
            // Use yearPeriods-based coloring instead of equal distribution
            const year = parseInt(word.proposing_time);
            const nodeColor = getWordColor(year);
            node.style.backgroundColor = nodeColor;

         

            node.dataset.lon = word.longitude;
            node.dataset.lat = word.latitude;
            node.dataset.x = leftPercent / 100;
            node.dataset.y = topPercent / 100;
            node.id = word.id;
            
            // �?关键：用 "x,y" 作为 key 存储
            const key = `${Math.round(leftPercent)},${Math.round(topPercent)}`;
            wordsOnGrid[key] = node.id;

            node.addEventListener('wheel', (e) => {
                e.stopPropagation();
                handleZoomWheel(e);
            }, { passive: false });
            
            // 添加点击事件处理浮窗显示
            // 修改单词节点的点击事�?
            node.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });

            node.addEventListener('click', (e) => {
                e.stopPropagation();
                // 只有不是拖拽操作时才处理点击
                if (!isDragging) {
                    if (node.classList.contains('focused')) {} else {
                        endWordView("switch");
                        startWordView(node.id);
                        zoomToWord(node.id, state.scaleThreshold);
                        updateWordFocus();
                        renderPanelSections();
                        logEvent("word_node_click", { wordId: node.id });
                    }
                }
            });

            wordNodesContainer.appendChild(node);
            
            updateWordNodeTransforms();
        }
    }

    // drag
    let isDragging = false;

    let canvas = document.getElementById("universe-canvas");
    canvas.addEventListener('wheel', (e) => {
        updateWordFocus();
        updateRelations();
    });
    canvas.addEventListener('mouseup', () => {
        updateWordFocus(); // 拖动结束后更�?
        updateRelations();
    });

}



// 初始�?- 等待DOM加载完成后获取数�?
document.addEventListener('DOMContentLoaded', () => {
    sessionStartTs = Date.now();
    logEvent("session_start", {});
    logEvent("page_loaded", { lang: document.documentElement.lang || "zh" });
    fetch('/content/data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正确');
            }
            return response.json();
        })
        .then(data => {
            window.about = data.about;
            window.allWords = data.words;
            logEvent("data_loaded", { status: "success", count: data.words ? data.words.length : 0 });
            // 调用渲染函数，传入words数组
            renderWordUniverse(data.words);
            zoomToWord(state.focusedNodeId,state.scaleThreshold);
            updateWordFocus();
        })
        .catch(error => {
            logEvent("data_loaded", { status: "error" });
            console.error('加载数据失败:', error);
            // 可以在这里添加错误处理UI，比如显示错误信�?
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

