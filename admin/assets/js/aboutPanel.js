import {
    state
} from "./state.js";
import {
    updateRelations
} from "./relationManager.js";
import {
    updateWordFocus
} from "./wordFocus.js";

let isAboutVisible = false;

function getAboutPanel() {
    return document.getElementById('about-panel');
}

function queryAbout(selector) {
    const panel = getAboutPanel();
    return panel ? panel.querySelector(selector) : null;
}

function queryAllAbout(selector) {
    const panel = getAboutPanel();
    return panel ? panel.querySelectorAll(selector) : [];
}

function normalizeLang(code) {
    const v = (code || "").toLowerCase();
    return v.startsWith("en") ? "en" : "zh";
}

function getAboutText(value, lang) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(" ");
    if (typeof value === "object") {
        return value[lang] || value.zh || value.en || "";
    }
    return "";
}


function renderAboutContent() {
    const lang = normalizeLang(state.currentLang || "zh");

    const aboutPanel = queryAbout('.panel-entry');
    const devlogPanel = queryAbout('.panel-comment');
    if (!aboutPanel || !devlogPanel) return;

    const aboutTitle = aboutPanel.querySelector('.panel-top');
    const aboutBottom = aboutPanel.querySelector('.panel-bottom');

    const devlogTitle = devlogPanel.querySelector('.panel-top');
    const devlogBottom = devlogPanel.querySelector('.panel-bottom');


    if (lang === "en") {
        aboutTitle.innerHTML = `
        <div>
            <div class = "term-main"> About </div>
            <div class = "term-ori"> About </div>
        </div>
        `;
        aboutBottom.innerHTML = `
        <section>
            <div>
                <p class="about-intro">Dunes Dictionary is a living index of concepts and terminologies, comprising keyword explanations and notes from diverse contributors. We view "words" as "incisions" into the vast terrain. By offering clear, accessible explanations, these words become entry points that open up a constellation of ideas and further inquiries. Whether a personal perspective, a story, a field visit, a dialogue, a correspondence, or a translation, these notes—stemming from "words"—provide an openness and depth that dismantles barriers and reveals the rich interconnectedness of different fields.
<br><br>In an era where jargon and buzzwords run rampant, Dunes Dictionary does not aim to establish authority; rather, it is an invitation to examine how words can help us navigate contemporary life. Started in 2019 as a series of social media posts to introduce architectural jargon, the project has expanded with contributions from young scholars across the humanities and sciences, evolving into this website launched in 2026. A biannual publication on themed topics is also part of the Dunes Dictionary project.
<br><br>We invite you to be part of this growing repository of concepts, definitions, and critical notes. If you are interested in participating in our workshops and/or contributing your notes, please contact us.
<br><br>Precise and lucid, intersecting and illuminating, focused and diverse. Dunes Dictionary strives to provide just enough structure to inspire, and enough openness to wander.
                </p>
            </div>
        </section>
        <section>
            <p class="left-title">Staff Team</p>
            <div>
                <p>Feiyue Chen, Yalun Li, Ruozhu Li, Qisen Song, Mengting Lü, Yiqi Chen</p>
            </div>
        </section>
        <section>
            <p class="left-title">Content Contributors</p>
            <div>
                <p>2024 Workshop participants: </p>
                <p>Chloe Zhang, Huiran Yi, Yorkson Liu, Xiao Wang, Shelley, Yunxi, Haoran Xia, Hydrogen Huang, Xinran, Yi Wang, Mengting Lü, Sandy Zhang, Alex Jin, William Liang, Yuanlong Zhu, Diane, Brook, WanLin Wei,  Yaqi, Sati</p>
            </div>
        </section>
        <section>
            <p class="left-title">Web Design & Development</p>
            <div>
                <p>Dunes Creative</p>
            </div>
        </section>
        <section>
            <p class="left-title">Special Thanks</p>
            <div>
                <p>Shanshan Duan, Tairan An, Xuan Luo, Sibo Zhu, Jin Gao, Zi Meng, Yiran Zhang, (Daisy) Ziyan Zhang, Chang Liu</p>
            </div>
        </section>
        <section>
            <p class="left-title">Contact</p>
                <div>
                    <p>hello@dunesworkshop.org</p>
                </div>
        </section>
        `;

        devlogTitle.innerHTML = `
        <div>
            <div class = "term-main"> Developer Log </div>
            <div class = "term-ori"> Dev Log </div>
        </div>
        `;
        devlogBottom.innerHTML = `
        <section>
            <div>
               
            </div>
        </section>
        `;
    } else {
        aboutTitle.innerHTML = `
        <div>
            <div class = "term-main"> 关于我们 </div>
            <div class = "term-ori"> About Us</div>
        </div>
        `;
        aboutBottom.innerHTML = `
        <section>
            <div>
                <p class="about-intro">沙丘词典编写词条的释义，并收录多元贡献者们对它们的笔记。这是一个跨学科的、持续生长的思想索引。
<br><br>我们将“词条”视为剖开广袤学术疆域的“切口”。通过提供明白晓畅的阐释，词条开启一片由思想构成的星丛，并激发更深远的追问。无论是个人视角、故事、田野考察、对话、书信还是翻译，这些围绕“词条”的“笔记”提供了一种开放性与深度，消融学术的藩篱，并展现不同学科之间丰厚的内在联结。
<br><br>在行业黑话、缩写词、网络用语横行的当下，沙丘词典并不想要树立权威；而是为了发起一场关于“如何解释并定义当下”的思考运动。最早在2019年，沙丘研究所在微信公众平台发布了“沙丘词典”这个推送栏目，其初衷是解释建筑术语。此后，通过不同学科的青年学者的贡献，项目得以不断扩展，演变为这个于 2026 年上线的网站。同时，半年刊出版物也是项目的一部分。
<br><br>若您有兴趣参与我们的共创工作坊或贡献你的笔记，请联系我们。我们诚邀你加入这个不断生长的档案库。
<br><br>直白而精准，交织而启发，聚焦而多元。我们希望赋予词典恰如其分的结构，能够提供让思想漫游、灵感涌现的开放空间。
                </p>
            </div>
        </section>
        
        <section>
            <p class="left-title">工作人员</p>
            <div>
                <p>陈飞樾、李雅伦、李若竹、宋淇森、吕孟汀、陈一齐</p>
            </div>
        </section>
        <section>
            <p class="left-title">内容贡献者</p>
            <div>
                <p>2024 共创会成员:</p>
                <p>张路尧、易慧然、刘楚彬、小王、Shelley、蕴溪、夏浩然、黄河清、欣然、汪义、吕孟汀、张三折、金炜东、梁慧琳、朱元龙、筱闻、太白、魏莞琳、雅淇、Sati</p>
            </div>
        </section>
        <section>
            <p class="left-title">网页设计与开发</p>
            <div>
                <p>沙丘创意</p>
            </div>
        </section>
        <section>
            <p class="left-title">特别感谢</p>
            <div>
                <p>段珊珊、安太然、罗璇、朱思博、高金、孟子、张一然、张子彦、刘唱</p>
            </div>
        </section>
        <section>
            <p class="left-title">联系我们</p>
                <div>
                    <p>hello@dunesworkshop.org</p>
                </div>
        </section>
        `;

        devlogTitle.innerHTML = `
        <div>
            <div class = "term-main"> 开发者日志</div>
            <div class = "term-ori"> Developer Log </div>
        </div>
        `;
        devlogBottom.innerHTML = `
        <section>
            <div>
                
            </div>
        </section>
        `;
    }
}

// About tab logic
let aboutCurrentTab = "about";
let aboutTouchStartY = 0;

const SWITCH_THRESHOLD = 180;
const SCROLL_CONFIG = {
    thumbMargin: 0,
    thumbSize: 14
};

let isDragging = false;
let startY = 0;
let startTop = 0;
let currentScrollThumb = null;
let currentPanelMain = null;

function setupScrollDrag(scrollThumb, panelMain) {
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

    let newTop = Math.min(
        Math.max(startTop + deltaY, SCROLL_CONFIG.thumbMargin),
        SCROLL_CONFIG.thumbMargin + thumbActiveRange
    );

    currentScrollThumb.style.top = `${newTop}px`;

    const thumbRatio = (newTop - SCROLL_CONFIG.thumbMargin) / thumbActiveRange;
    currentPanelMain.scrollTop = thumbRatio * (currentPanelMain.scrollHeight - currentPanelMain.clientHeight);
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = '';
});

function initAboutTabs() {
    const allTabs = queryAllAbout('.panel-tabs button');
    allTabs.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tabName = btn.dataset.tab;
            switchAboutTab(tabName);
        });
    });
}

function switchAboutTab(tabName) {
    const aboutPanel = queryAbout('.panel-entry');
    const devlogPanel = queryAbout('.panel-comment');
    if (!aboutPanel || !devlogPanel) return;

    const allTabs = queryAllAbout('.panel-tabs button');
    allTabs.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });

    if (tabName === "about") {
        aboutPanel.classList.add('active');
        devlogPanel.classList.remove('active');
    } else if (tabName === "devlog") {
        devlogPanel.classList.add('active');
        aboutPanel.classList.remove('active');
    }

    aboutCurrentTab = tabName;
    updateAboutScrollHandlers();
}

function getAboutActivePanelMain() {
    const activePanel = queryAbout('.panel-entry.active, .panel-comment.active');
    return activePanel ? activePanel.querySelector('.panel-main') : null;
}

function updateAboutScrollHandlers() {
    const activePanel = queryAbout('.panel-entry.active, .panel-comment.active');
    if (!activePanel) return;

    const panelMain = activePanel.querySelector('.panel-main');
    const scrollThumb = activePanel.querySelector('.scroll-thumb');
    const scrollTrack = activePanel.querySelector('.scroll-track');

    if (!panelMain || !scrollThumb || !scrollTrack) return;

    panelMain.removeEventListener("scroll", handleAboutScroll);
    panelMain.addEventListener("scroll", handleAboutScroll);

    handleAboutScroll();
    setupScrollDrag(scrollThumb, panelMain);
    setupAboutWheelHandler();
    setupAboutTouchHandlers();
}

function handleAboutScroll() {
    const activePanel = queryAbout('.panel-entry.active, .panel-comment.active');
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

function setupAboutWheelHandler() {
    const panelMain = getAboutActivePanelMain();
    if (!panelMain) return;

    panelMain.removeEventListener("wheel", handleAboutWheel);
    panelMain.addEventListener("wheel", handleAboutWheel);
}

function handleAboutWheel(e) {
    const panelMain = getAboutActivePanelMain();
    if (!panelMain) return;

    const atBottom = panelMain.scrollTop + panelMain.clientHeight >= panelMain.scrollHeight - 2;
    const atTop = panelMain.scrollTop <= 2;

    if (aboutCurrentTab === "about" && atBottom && e.deltaY > SWITCH_THRESHOLD) {
        switchAboutTab("devlog");
    } else if (aboutCurrentTab === "devlog" && atTop && e.deltaY < -SWITCH_THRESHOLD) {
        switchAboutTab("about");
    }
}

function setupAboutTouchHandlers() {
    const panelMain = getAboutActivePanelMain();
    if (!panelMain) return;

    panelMain.removeEventListener("touchstart", handleAboutTouchStart);
    panelMain.removeEventListener("touchend", handleAboutTouchEnd);
    panelMain.addEventListener("touchstart", handleAboutTouchStart);
    panelMain.addEventListener("touchend", handleAboutTouchEnd);
}

function handleAboutTouchStart(e) {
    aboutTouchStartY = e.touches[0].clientY;
}

function handleAboutTouchEnd(e) {
    const panelMain = getAboutActivePanelMain();
    if (!panelMain) return;

    const deltaY = e.changedTouches[0].clientY - aboutTouchStartY;
    const atBottom = panelMain.scrollTop + panelMain.clientHeight >= panelMain.scrollHeight - 2;
    const atTop = panelMain.scrollTop <= 2;

    if (aboutCurrentTab === "about" && atBottom && deltaY < -SWITCH_THRESHOLD) {
        switchAboutTab("devlog");
    } else if (aboutCurrentTab === "devlog" && atTop && deltaY > SWITCH_THRESHOLD) {
        switchAboutTab("about");
    }
}

function initAboutPanelClickHandlers() {
    const aboutPanel = queryAbout('.panel-entry');
    const devlogPanel = queryAbout('.panel-comment');

    if (aboutPanel) {
        aboutPanel.addEventListener('click', (e) => {
            if (!aboutPanel.classList.contains('active')) {
                const rect = aboutPanel.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (clickX < 100) {
                    switchAboutTab('about');
                }
            }
        });
    }

    if (devlogPanel) {
        devlogPanel.addEventListener('click', (e) => {
            if (!devlogPanel.classList.contains('active')) {
                const rect = devlogPanel.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (clickX < 100) {
                    switchAboutTab('devlog');
                }
            }
        });
    }
}

export function showAboutPanel() {
    const panel = getAboutPanel();
    if (!panel) return;
    panel.classList.remove('hidden');
    isAboutVisible = true;
    document.dispatchEvent(new CustomEvent('about-panel:show'));

    renderAboutContent();
    switchAboutTab("about");

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

    setTimeout(() => {
        updateAboutScrollHandlers();
    }, 100);
}

function hideAboutPanel() {
    const panel = getAboutPanel();
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('expanded');
    isAboutVisible = false;

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

function initClickOutsideHandler() {
    document.addEventListener('click', (e) => {
        const panel = getAboutPanel();
        const aboutButton = document.getElementById("about-button");
        if (isAboutVisible && panel && !panel.contains(e.target) && !aboutButton.contains(e.target)) {
            hideAboutPanel();
        }
    });
}

document.addEventListener('floating-panel:show', () => {
    if (isAboutVisible) {
        hideAboutPanel();
    }
});

initClickOutsideHandler();
initAboutTabs();
initAboutPanelClickHandlers();