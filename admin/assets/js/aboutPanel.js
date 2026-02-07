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

function resolveAboutContent(lang) {
    const about = window.about || {};
    const aboutContent = about.about || about.content || "";
    return getAboutText(aboutContent, lang);
}

function resolveDevlogContent(lang) {
    const about = window.about || {};
    const devlogContent = about.devlog || about.developer_log || about.log || about.logs || about.journal || about.content || "";
    return getAboutText(devlogContent, lang);
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

    const aboutContent = resolveAboutContent(lang);
    const devlogContent = resolveDevlogContent(lang);

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
                <p class="about-intro">Dunes Dictionary is a living index of concepts and terminologies central to different disciplines. We consider those selected concepts and terms as incisions to the vast academic terrain —opening up a constellation of ideas and further inquiries. By offering clear and accessible explanations, we aim to dismantle academic barriers and reveal the rich connections among fields.
<br><br>Founded in 2019 as a series of social-media posts by Dunes Workshop?an artist-researcher collective with an architectural background?the project has grown through co-creation workshops with early-career scholars across disciplines. In 2025, it moved to this carefully structured website, now a growing repository of concepts, definitions, and related commentaries.
<br><br>If you are interested in participating in our co-creation workshops, please read the Guide. We also welcome commentary essays on existing terms and proposals for new terms.
<br><br>Embracing the internet?s fluid and relational landscape, we strive to give just enough structure to wander and enough openness to inspire.</p>
                ${aboutContent}
            </div>
        </section>
        <section>
            <p class="left-title">Staff Team</p>
            <div>
                <p>Feiyue Chen, Yalun Li, Ruozhu Li, Qisen Song, Mengting Lu, Yiqi Chen</p>
            </div>
        </section>
        <section>
            <p class="left-title">Content Contributors</p>
            <div>
                <p>2024 Co-creation Workshop participants:</p>
                <p>Chloe (张路尧), Huiran (易慧然), Yorkson (刘楚彬), Xiao Wang (小王), Shelley, Yunxi (蕴溪), Haoran (夏浩然), Hydrogen (黄河清), Xinran (欣然), 汪义, 吕孟汀, Sandy (张三折), Alex Jin (金炜东), William (梁慧琳/小蓝), Yuanlong (朱元龙), Diane (筱闻), Brook (太白), Lin (魏莞琳), Yaqi (雅淇), Sati</p>
            </div>
        </section>
        <section>
            <p class="left-title">Web Design & Development</p>
            <div>
                <p>Dunes Creative (Feiyue Chen, Yalun Li, Ruozhu Li, Yiqi Chen)</p>
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
                ${devlogContent}
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
                <p class="about-intro">《沙丘词典》是一部持续生长的思想索引，收录了跨学科领域的关键概念与术语。

<br><br>我们将这些遴选出的概念与术语，视为剖开广袤学术疆域的一道道切口——由此开启一片由思想构成的星丛，并激发更深远的追问。我们旨在通过清晰晓畅的阐释，消融学术的藩篱，展现不同学科之间丰厚的内在联结。
<br><br>自2019年起，沙丘研究所（一个由具建筑学背景的艺术家与研究者组成的团体）在社交媒体上分享建筑和城市学相关的专业术语。在后续的五年时间里，沙丘词典通过工作坊的形式邀请了各学科的青年学者进行共创，将词典延展至更多的学科。在2025 年，我们将此前分散在社交媒体上的内容迁移至网站。这个精心架构的网站便于读者跟随词条之间的联系进行探索。
<br><br>若您有兴趣参与我们的共创工作坊，请阅读“参与指南”。我们也欢迎您针对现有词条撰写评注，或举荐新的词条。
<br><br>沙丘词典仍在持续的生长，我们拥抱互联网流动且联结的状态，希望提供足够结构以便漫游。</p>
                ${aboutContent}
            </div>
        </section>
        
        <section>
            <p class="left-title">Staff Team</p>
            <div>
                <p>Feiyue Chen, Yalun Li, Ruozhu Li, Qisen Song, Mengting Lu, Yiqi Chen</p>
            </div>
        </section>
        <section>
            <p class="left-title">Content Contributors</p>
            <div>
                <p>2024 Co-creation Workshop participants:</p>
                <p>Chloe (张路尧), Huiran (易慧然), Yorkson (刘楚彬), Xiao Wang (小王), Shelley, Yunxi (蕴溪), Haoran (夏浩然), Hydrogen (黄河清), Xinran (欣然), 汪义, 吕孟汀, Sandy (张三折), Alex Jin (金炜东), William (梁慧琳/小蓝), Yuanlong (朱元龙), Diane (筱闻), Brook (太白), Lin (魏莞琳), Yaqi (雅淇), Sati</p>
            </div>
        </section>
        <section>
            <p class="left-title">Web Design & Development</p>
            <div>
                <p>Dunes Creative (Feiyue Chen, Yalun Li, Ruozhu Li, Yiqi Chen)</p>
            </div>
        </section>
        <section>
            <p class="left-title">Special Thanks</p>
            <div>
                <p>Shanshan Duan, Tairan An, Sibo Zhu, Jin Gao, Xuan Luo</p>
            </div>
        </section>
<section>
            <p class="left-title">联系方式</p>
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
                ${devlogContent}
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