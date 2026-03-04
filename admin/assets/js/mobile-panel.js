import { showFloatingPanel, hideFloatingPanel } from "./detail.js";
import { updateRelations } from "./relationManager.js";
import { updateWordFocus } from "./wordFocus.js";

const MOBILE_MAX_WIDTH = 768;

function isMobileLayout() {
    return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

function getFloatingPanel() {
    return document.getElementById("floating-panel");
}

function getAboutPanel() {
    return document.getElementById("about-panel");
}

function removeMobileCloseButton() {
    const btn = document.getElementById("floating-close-btn");
    if (btn) btn.remove();
}

function ensureMobileCloseButton(panel, onClose) {
    if (!panel) return;

    let btn = document.getElementById("floating-close-btn");
    if (!btn) {
        btn = document.createElement("button");
        btn.id = "floating-close-btn";
        btn.type = "button";
        btn.setAttribute("aria-label", "Close panel");
        btn.innerHTML = `
            <svg class="close-icon" width="14.32" height="14.32" viewBox="0 0 14.32 14.32" aria-hidden="true" focusable="false">
                <line x1="1.2" y1="1.2" x2="13.12" y2="13.12"></line>
                <line x1="13.12" y1="1.2" x2="1.2" y2="13.12"></line>
            </svg>
        `;
    }

    btn.onclick = (e) => {
        e.stopPropagation();
        if (typeof onClose === "function") onClose();
    };

    if (btn.parentElement !== panel) {
        panel.appendChild(btn);
    }
}

function closeAboutPanelMobile() {
    const panel = getAboutPanel();
    if (!panel) return;
    panel.classList.add("hidden");
    panel.classList.remove("expanded");

    const view = document.getElementById("universe-view");
    const relationLines = document.getElementById("connection-lines");
    if (view) view.style.left = "0";
    if (relationLines) relationLines.style.left = "0";

    updateRelations();
    setTimeout(updateRelations, 75);
    setTimeout(updateRelations, 150);
    setTimeout(updateRelations, 225);
    setTimeout(updateRelations, 300);
    setTimeout(updateRelations, 600);
    setTimeout(updateWordFocus, 300);
}

function forceMobilePanelLayout() {
    if (!isMobileLayout()) return;
    const view = document.getElementById("universe-view");
    const relationLines = document.getElementById("connection-lines");
    if (view) view.style.left = "0";
    if (relationLines) relationLines.style.left = "0";
}

function activateTab(tabName) {
    const panel = getFloatingPanel();
    if (!panel) return;
    const entryPanel = panel.querySelector(".panel-entry");
    const commentPanel = panel.querySelector(".panel-comment");
    const tabButtons = panel.querySelectorAll(".panel-tabs button");

    tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
    if (entryPanel) entryPanel.classList.toggle("active", tabName === "entry");
    if (commentPanel) commentPanel.classList.toggle("active", tabName === "comment");
}

function scrollEntryToSection(sectionId) {
    const panel = getFloatingPanel();
    if (!panel) return;
    const entryMain = panel.querySelector(".panel-entry .panel-main");
    const section = panel.querySelector(`#${sectionId}`);
    if (!entryMain || !section) return;
    entryMain.scrollTo({ top: section.offsetTop, behavior: "smooth" });
}

function openEntrySection(sectionId = null) {
    showFloatingPanel();
    forceMobilePanelLayout();
    ensureMobileCloseButton(getFloatingPanel(), hideFloatingPanel);
    activateTab("entry");
    if (sectionId) {
        requestAnimationFrame(() => scrollEntryToSection(sectionId));
    }
}

function openCommentPanel() {
    showFloatingPanel();
    forceMobilePanelLayout();
    ensureMobileCloseButton(getFloatingPanel(), hideFloatingPanel);
    activateTab("comment");
    const panel = getFloatingPanel();
    const main = panel?.querySelector(".panel-comment .panel-main");
    if (main) main.scrollTo({ top: 0, behavior: "smooth" });
}

function interceptDetailShortcuts() {
    const commentDiv = document.getElementById("comment");
    const proposerDiv = document.getElementById("proposer");
    const imageDiv = document.getElementById("image");

    if (commentDiv) {
        commentDiv.addEventListener("click", (e) => {
            if (!isMobileLayout()) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            openCommentPanel();
        }, true);
    }

    if (proposerDiv) {
        proposerDiv.addEventListener("click", (e) => {
            if (!isMobileLayout()) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            openEntrySection("section-proposers");
        }, true);
    }

    if (imageDiv) {
        imageDiv.addEventListener("click", (e) => {
            if (!isMobileLayout()) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            openEntrySection("section-source");
        }, true);
    }
}

function interceptFocusedNodeClick() {
    document.addEventListener("click", (e) => {
        if (!isMobileLayout()) return;
        const target = e.target;
        if (!(target instanceof Element)) return;
        const focusedNode = target.closest("#focused-node-layer .word-node.focused");
        if (!focusedNode) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openEntrySection();
    }, true);
}

function initMobilePanelEnhancements() {
    interceptDetailShortcuts();
    interceptFocusedNodeClick();

    document.addEventListener("floating-panel:show", () => {
        if (!isMobileLayout()) {
            removeMobileCloseButton();
            return;
        }
        forceMobilePanelLayout();
        ensureMobileCloseButton(getFloatingPanel(), hideFloatingPanel);
    });

    document.addEventListener("about-panel:show", () => {
        if (!isMobileLayout()) {
            removeMobileCloseButton();
            return;
        }
        forceMobilePanelLayout();
        ensureMobileCloseButton(getAboutPanel(), closeAboutPanelMobile);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobilePanelEnhancements, { once: true });
} else {
    initMobilePanelEnhancements();
}
