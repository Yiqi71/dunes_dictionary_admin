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

import { logEvent, startWordView, endWordView } from "/analytics.js";
// 浮窗相关变量
let isPanelVisible = false;
let isExpanded = false;
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

        if (img.complete && img.naturalWidth > 0) {
            img.classList.remove("lazy-img");
            return;
        }
        img.addEventListener("load", () => img.classList.remove("lazy-img"), { once: true });
        img.addEventListener("error", () => img.classList.add("lazy-img-error"), { once: true });
    });
}

function applyHashItalics(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/#([^#]+)#/g, "<i>$1</i>");
}

function filterProposer(name) {
    const focusedWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!focusedWord) return [];

    // 先渲�?proposer 相关的词
    const relatedContainer = document.createElement("div");
    relatedContainer.classList = `related-words`;
    relatedContainer.innerHTML = '';

    // 检索所�?proposers 里有该名字的�?
    const relatedWords = window.allWords.filter(w => {
        if (w.id === focusedWord.id) return false;
        return Array.isArray(w.proposers) && w.proposers.some(p => p.name === name);
    });

    relatedWords.forEach(w => {
        const link = document.createElement('div');
        link.id = `related-${w.id}`;
        link.textContent = w.term;
        link.style.display = 'block';

        // 点击跳转到这个单�?
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetNodeId = link.id.replace('related-', '');
            const fromWordId = state.focusedNodeId;
            endWordView("switch");
            startWordView(targetNodeId);
            logEvent("link_click", { fromWordId, toWordId: targetNodeId });
            zoomToWord(targetNodeId, state.currentScale);
            updateWordFocus();

            renderPanelSections();
            updateTabContent("book");
        });

        relatedContainer.appendChild(link);
    });
    return relatedContainer;
}

// function togglePanelWidth() {
//     const panel = getFloatingPanel();
//     const expandBtn = document.getElementById('expand-btn');

//     if (!panel || !expandBtn) return;

//     isExpanded = !isExpanded;

//     if (isExpanded) {
//         panel.classList.add('expanded');
//         expandBtn.innerHTML = `
//             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
//                 <polyline points="4,14 10,14 10,20"></polyline>
//                 <polyline points="20,10 14,10 14,4"></polyline>
//                 <line x1="14" y1="10" x2="21" y2="3"></line>
//                 <line x1="3" y1="21" x2="10" y2="14"></line>
//             </svg>
//         `;
//         const overlay = document.getElementById("overlay");
//         overlay.classList.remove("hidden");
//     } else {
//         panel.classList.remove('expanded');
//         expandBtn.innerHTML = `
//             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
//                 <polyline points="15,3 21,3 21,9"></polyline>
//                 <polyline points="9,21 3,21 3,15"></polyline>
//                 <line x1="21" y1="3" x2="14" y2="10"></line>
//                 <line x1="3" y1="21" x2="10" y2="14"></line>
//             </svg>
//         `;
//         const overlay = document.getElementById("overlay");
//         overlay.classList.add("hidden");
//     }
// }

// 浮窗功能函数
export function showFloatingPanel() {
    const panel = getFloatingPanel();
    if (!panel) return;
    panel.classList.remove('hidden');
    isPanelVisible = true;
    document.dispatchEvent(new CustomEvent('floating-panel:show'));

    ensureExpandButton();
    
    // 同时渲染两个panel的内�?
    renderPanelSections();
    renderCommentSection();

    // 重置 tab 按钮状态和panel状�?
    const allTabs = queryAllFloating('.panel-tabs button');
    allTabs.forEach(btn => btn.classList.remove('active'));
    const entryTabs = queryAllFloating('.panel-tabs button[data-tab="entry"]');
    entryTabs.forEach(tab => tab.classList.add('active'));

    // 设置默认选中entry panel
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
    
    // 初始化滚动处理器
    setTimeout(() => {
        updateScrollHandlers();
    }, 100);
}

function ensureExpandButton() {
    let expandBtn = document.getElementById('expand-btn');

    if (!expandBtn) {
        // 创建按钮
        expandBtn = document.createElement('button');
        expandBtn.id = 'expand-btn';

        // 添加样式
        expandBtn.style.cssText = `
            position: absolute;
            left: -6.5vw;
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

        // 创建箭头和竖线的HTML结构
        expandBtn.innerHTML = `
            <div class="expand-btn-content" style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100%;
                position: relative;
            ">
                <!-- 竖线 -->
                <div class="edge-line" style="
                    width: 2px;
                    height: 20px;
                    background-color: #FFFCF4;
                    border-radius: 1px;
                    margin-right: 1px;
                "></div>

                <!-- 箭头 -->
                <div class="arrow-container" style="
                    transition: transform 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFCF4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <!-- 箭头竖线部分 -->
                        <polyline points="11,18 5,12 11,6"></polyline>
                        <!-- 箭头横线，x2拉长 -->
                        <line x1="5" y1="12" x2="20" y2="12"></line>
                    </svg>
                </div>
            </div>
        `;


        // 添加点击事件
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanelWidth();
        });

        // 将按钮添加到 panel �?
        const panel = getFloatingPanel();
        if (!panel) return;
        panel.appendChild(expandBtn);

        // 添加动画样式到页�?
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

    // 重置按钮图标
    let expandBtn = document.getElementById('expand-btn');
    if (expandBtn) {
        expandBtn.remove();
    }

    // 重置tabs显示（显示所有panel的tabs�?
    const allTabs = queryAllFloating('.panel-tabs');
    allTabs.forEach(tabs => {
        if (tabs) tabs.style.display = 'flex';
    });

    // 重置scroll markers显示
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

// 定义标题中英文映�?
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

export function renderPanelSections() {
    let currentWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!currentWord) return;

    const lang = normalizeLang(state.currentLang || "zh");

    scrollToTop('entry');

    const entryPanel = queryFloating('.panel-entry');
    if (!entryPanel) return;

    // Upper section
    const title = entryPanel.querySelector('.panel-top');
    title.innerHTML = `
    <p> ${String(currentWord.id).padStart(4, '0')} </p>
    <img src = "${resolveImagePath(currentWord.concept_image)}" alt = "concept image" loading="lazy" decoding="async"></img> 
    <div>
    <div class = "term-main"> ${currentWord.term?.[lang] || '未知单词'} </div>
    <div class = "term-ori"> ${currentWord.termOri || '无'} </div></div>
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
        <section id="section-contributors"> </section>
        <section id="section-editors"> </section>
    `;

    const briefSec = document.getElementById("section-brief");
    const extendedSec = document.getElementById("section-extended");
    const exampleSec = document.getElementById("section-example");
    const proposerSec = document.getElementById("section-proposers");
    const sourceSec = document.getElementById("section-source");
    const relatedSec = document.getElementById("section-related-works");
    const contributorsSec = document.getElementById("section-contributors");
    const editorsSec = document.getElementById("section-editors");

    const briefText = applyHashItalics(currentWord.brief_definition?.[lang] || "\u6682\u65e0\u7b80\u8981\u91ca\u4e49");
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
        currentWord.diagrams.forEach(diagram => {
            const block = document.createElement("div");
            block.innerHTML = `
      <img src="${resolveImagePath(diagram.src)}" alt="diagram image" loading="lazy" decoding="async">
      <p class="diagram-caption">${applyHashItalics(diagram.caption?.[lang])}</p>
    `;
            diagramContainer.appendChild(block);
        });
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
            <p class="proposer-year">${proposer.year}</p>
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

    const contributors = Array.isArray(currentWord.contributors) ? currentWord.contributors : [];
    const contributorNames = contributors.map(c => {
        const name = c?.name?.[lang] || "";
        const role = c?.role?.[lang] || "";
        return name ? `${name}${role ? ` ，${role}` : ""}` : "";
    }).filter(Boolean);
    const contributorText = contributorNames.length
        ? (lang === "en"
            ? `The contributor for this entry is ${contributorNames.join(", ")}.`
            : `本期词条的贡献者是${contributorNames.join(", ")}。`)
        : (lang === "en" ? "No contributor information yet." : "暂无贡献者信息");
    contributorsSec.innerHTML = `<p>${contributorText}</p>`;

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
    title.innerHTML = `
    <p> ${String(currentWord.id).padStart(4, '0')} </p>
    <div>
    <div class = "term-main"> ${currentWord.term?.[lang] || '未知单词'} </div>
    <div class = "term-ori"> ${currentWord.termOri || '无'} </div></div>
    `

    // FIXED: Don't wrap in additional tags since JSON already contains HTML
    const contentScroll = commentPanel.querySelector('.panel-bottom');
    const comments = Array.isArray(currentWord.comments) ? currentWord.comments : [];
    const emptyCommentsLabel = lang === "en" ? "No comments" : "暂无评论";
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
                ? `<div class="note-images">
                    ${images.map(img => {
                        const cap = applyHashItalics(img?.caption?.[lang] || "");
                        return `
                            <img src="${resolveImagePath(img?.src)}" alt="note image" loading="lazy" decoding="async">
                            ${cap ? `<p class="diagram-caption">${cap}</p>` : ""}
                        `;
                    }).join("")}
                  </div>`
                : "";
            return `<section>
                <p class="left-title">${titleLabel}</p>
                <div class="note-body"><br><br><br><br>${content}${imagesHtml}</div>
            </section>`;
        }).join('') : emptyCommentsLabel}

        <section id="section-contributors"> </section>
        <section id="section-editors"> </section>        
    `;

    const contributorsSec = document.getElementById("section-contributors");
    const editorsSec = document.getElementById("section-editors");

    const contributorsInComment = Array.isArray(currentWord.contributors) ? currentWord.contributors : [];
    const contributorNamesInComment = contributorsInComment.map(c => {
        const name = c?.name?.[lang] || "";
        const role = c?.role?.[lang] || "";
        return name ? `${name}${role ? `，${role}` : ""}` : "";
    }).filter(Boolean);
    const contributorTextInComment = contributorNamesInComment.length
        ? (lang === "en"
            ? `The contributor for this entry is ${contributorNamesInComment.join(", ")}.`
            : `本期词条的贡献者是${contributorNamesInComment.join("、")}。`)
        : (lang === "en" ? "No contributor information yet." : "暂无贡献者信息");
    contributorsSec.innerHTML = `<p>${applyHashItalics(contributorTextInComment)}</p>`;

    editorsSec.innerHTML = `<p class="left-title">${sectionTitles.editors[lang]}</p>
                        <div id="editors-container">
                        ${currentWord.editors.map(editor => `<p>${applyHashItalics(editor?.[lang])}</p>`).join('')}
                        </div>`

    // 为每个note section添加折叠/展开功能
    const noteSections = Array.from(
        contentScroll.querySelectorAll('section:not(#section-contributors):not(#section-editors)')
    );

    const clearNoteLayout = () => {
        contentScroll.classList.remove('notes-mode');
        if (panelMain) panelMain.classList.remove('notes-fixed');
        noteSections.forEach(sec => {
            sec.classList.remove('note-expanded', 'note-above', 'note-below', 'note-below-first');
        });
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
                clearNoteLayout();
                return;
            }
            applyNoteLayout(section);
        });
    });
}


// tab 切换逻辑
function initTabs() {
    // 为所有panel的tab按钮添加事件监听
    const allTabs = queryAllFloating('.panel-tabs button');
    allTabs.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发panel的点击事�?
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

// 初始化时调用
initTabs();

// === Tab 边缘切换逻辑 ===

// 阈值（像素），表示一�?scroll �?touchmove 的力�?
const SWITCH_THRESHOLD = 180;

// 当前 tab 状�?
let currentTab = "entry"; // 默认�?entry

// 监听 tab 按钮，保�?currentTab 同步（已在initTabs中处理）

function switchTab(tabName) {
    const entryPanel = queryFloating('.panel-entry');
    const commentPanel = queryFloating('.panel-comment');
    
    // 更新所有panel的tab按钮状�?
    const allTabs = queryAllFloating('.panel-tabs button');
    allTabs.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // 切换panel的active状�?
    if (tabName === "entry") {
        if (entryPanel) entryPanel.classList.add('active');
        if (commentPanel) commentPanel.classList.remove('active');
    } else if (tabName === "comment") {
        if (commentPanel) commentPanel.classList.add('active');
        if (entryPanel) entryPanel.classList.remove('active');
    }
    
    currentTab = tabName;
    
    // 更新滚动条和markers绑定
    updateScrollHandlers();
}

// 在showFloatingPanel中初始化滚动处理�?

// 获取当前激活的panel-main
function getActivePanelMain() {
    const activePanel = queryFloating('.panel-entry.active, .panel-comment.active');
    return activePanel ? activePanel.querySelector('.panel-main') : null;
}

// PC 端滚�?- 需要绑定到当前激活的panel
function setupWheelHandler() {
    const panelMain = getActivePanelMain();
    if (!panelMain) return;
    
    // 移除旧的监听器（如果存在�?
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

// 移动端触�?
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




// 滚动到最顶端（panel-top位置�?
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

// 滚动到对�?section
function updateTabContent(tabType = "brief") {
    const panel = getFloatingPanel();
    if (!panel) return;
    const panelMain = panel.querySelector('.panel-main');

    if (!panelMain) return;

    // tabType -> section 的映�?
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

// 滑轨配置参数
const SCROLL_CONFIG = {
    thumbMargin: 0, // thumb上下边距，可调整参数
    thumbSize: 14 // thumb大小
};

// 更新滚动条和markers绑定到当前激活的panel
function updateScrollHandlers() {
    const activePanel = queryFloating('.panel-entry.active, .panel-comment.active');
    if (!activePanel) return;
    
    const panelMain = activePanel.querySelector('.panel-main');
    const scrollThumb = activePanel.querySelector('.scroll-thumb');
    const scrollTrack = activePanel.querySelector('.scroll-track');
    
    if (!panelMain || !scrollThumb || !scrollTrack) return;
    
    // 移除旧的滚动监听�?
    panelMain.removeEventListener("scroll", handleScroll);
    // 添加新的滚动监听�?
    panelMain.addEventListener("scroll", handleScroll);
    
    // 初始化滚动条位置
    handleScroll();
    
    // 更新拖动功能
    setupScrollDrag(scrollThumb, panelMain);
    
    // 更新wheel和touch事件
    setupWheelHandler();
    setupTouchHandlers();
}

// 滚动处理函数
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


// 拖动功能
let isDragging = false;
let startY, startTop;
let currentScrollThumb = null;
let currentPanelMain = null;

function setupScrollDrag(scrollThumb, panelMain) {
    // 移除旧的监听�?
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

    // 计算新的thumb位置（限制在活动范围内）
    let newTop = Math.min(
        Math.max(startTop + deltaY, SCROLL_CONFIG.thumbMargin),
        SCROLL_CONFIG.thumbMargin + thumbActiveRange
    );

    currentScrollThumb.style.top = `${newTop}px`;

    // 根据thumb位置计算内容滚动比例
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

    // 清空旧的 marker
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
            id: "section-contributors",
            label: sectionTitles.contributors
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

    // 如果内容不需要滚动，不显示markers
    if (contentHeight <= visibleHeight) return;

    sections.forEach(sec => {
        let markerTop;
        let scrollTarget;

        if (sec.isTop) {
            // 顶部 marker 固定�?thumb 活动范围的最上方
            markerTop = SCROLL_CONFIG.thumbMargin;
            scrollTarget = 0;
        } else {
            const el = document.getElementById(sec.id);
            if (!el) return;

            // 相对 panelMain 内容顶部的位�?
            const sectionTop = el.offsetTop;

            // 计算滚动比例（section 到达 panel 顶部时的比例�?
            const scrollRatio = Math.min(sectionTop / contentScrollableRange, 1);

            // 映射�?thumb 活动范围
            markerTop = SCROLL_CONFIG.thumbMargin + (scrollRatio * thumbActiveRange);
            scrollTarget = sectionTop;
        }

        // 生成 marker
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

    // 清空旧的 marker
    scrollTrack.querySelectorAll(".scroll-marker").forEach(el => el.remove());

    let currentWord = window.allWords.find(w => w.id == state.focusedNodeId);
    if (!currentWord || !currentWord.comments) return;

    const comments = currentWord.comments;

    const contentHeight = panelMain.scrollHeight;
    const visibleHeight = panelMain.clientHeight;
    const contentScrollableRange = contentHeight - visibleHeight;

    const trackHeight = scrollTrack.clientHeight;
    const thumbActiveRange = trackHeight - (SCROLL_CONFIG.thumbMargin * 2) - SCROLL_CONFIG.thumbSize;

    // 如果评论数量过少，不需要滚�?
    if (contentHeight <= visibleHeight) return;

    comments.forEach((c, idx) => {
        const sectionEl = panelMain.querySelectorAll("section")[idx];
        if (!sectionEl) return;

        // 相对 panelMain 内容顶部的位�?
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


// 点击外部关闭浮窗
function initClickOutsideHandler() {
    document.addEventListener('click', (e) => {
        const panel = getFloatingPanel();
        const aboutButton = document.getElementById("about-button");
        if (isPanelVisible && panel && !panel.contains(e.target) && !aboutButton.contains(e.target)) {
            hideFloatingPanel();
        }
    });
}

// click detail - scroll to according section
// const termDiv = document.getElementById("term");
const commentDiv = document.getElementById("comment");
const proposerDiv = document.getElementById("proposer");
const imageDiv = document.getElementById("image");



// 点击「词�?标题�? 滚动到最顶端
// termDiv.addEventListener("click", (e) => {
//     e.stopPropagation();
//     showFloatingPanel();
//     scrollToTop(); // 使用新的滚动到顶端函�?
// });

// 点击「评论�?
commentDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    showFloatingPanel();
    renderCommentSection();
    switchTab("comment");
    scrollToTop("comment");
});

// 点击「相关著�?/ 提出者�?
proposerDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    showFloatingPanel();
    updateTabContent("proposers");
});

// 点击「图片�?
imageDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    showFloatingPanel();
    switchTab("entry");
    updateTabContent("source");
});

// 添加下层panel边缘点击事件
function initPanelClickHandlers() {
    const entryPanel = queryFloating('.panel-entry');
    const commentPanel = queryFloating('.panel-comment');
    
    // 点击entry panel的可见边缘切换到entry
    if (entryPanel) {
        entryPanel.addEventListener('click', (e) => {
            // 只在未激活状态下点击时切�?
            if (!entryPanel.classList.contains('active')) {
                // 检查点击位置是否在可见的边缘区域（左侧50px内）
                const rect = entryPanel.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (clickX < 100) { // 允许点击左侧100px区域
                    switchTab('entry');
                }
            }
        });
    }
    
    // 点击comment panel的可见边缘切换到comment
    if (commentPanel) {
        commentPanel.addEventListener('click', (e) => {
            // 只在未激活状态下点击时切�?
            if (!commentPanel.classList.contains('active')) {
                // 检查点击位置是否在可见的边缘区域（左侧50px内）
                const rect = commentPanel.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (clickX < 100) { // 允许点击左侧100px区域
                    switchTab('comment');
                }
            }
        });
    }
}

// 初始化浮窗功�?
initClickOutsideHandler();
initPanelClickHandlers();
document.addEventListener('about-panel:show', () => {
    if (isPanelVisible) {
        hideFloatingPanel();
    }
});


// 显示About页面的浮�?
export function showAboutPanel() {
    const panel = document.getElementById('floating-panel');
    panel.classList.remove('hidden');
    isPanelVisible = true;

    ensureExpandButton();
    renderAboutContent();

    // 隐藏tabs（隐藏所有panel的tabs�?
    const allTabs = document.querySelectorAll('.panel-tabs');
    allTabs.forEach(tabs => {
        if (tabs) tabs.style.display = 'none';
    });

    // 隐藏scroll markers
    const entryPanel = document.querySelector('.panel-entry');
    if (entryPanel) {
        const scrollTrack = entryPanel.querySelector('.scroll-track');
        if (scrollTrack) {
            const scrollMarkers = scrollTrack.querySelectorAll('.scroll-marker');
            scrollMarkers.forEach(marker => marker.style.display = 'none');
        }
    }
}
