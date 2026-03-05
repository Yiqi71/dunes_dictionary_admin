import { state } from "./state.js";

const MOBILE_QUERY = "(max-width: 768px)";

function isMobileLayout() {
    return window.matchMedia(MOBILE_QUERY).matches;
}

function hasFocusedWord() {
    return Boolean(state.focusedNodeId) || Boolean(document.querySelector(".word-node.focused"));
}

function syncYearMenuVisibility() {
    const yearMenu = document.getElementById("year-menu");
    if (!yearMenu) return;
    const shouldHide = isMobileLayout() && hasFocusedWord();
    yearMenu.classList.toggle("mobile-hidden", shouldHide);
}

function dispatchMouseEvent(target, type, touch) {
    if (!target || !touch) return;
    target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: touch.clientX,
        clientY: touch.clientY,
        screenX: touch.screenX,
        screenY: touch.screenY,
        button: 0
    }));
}

function initMobileYearTouchBridge() {
    const yearContainer = document.getElementById("yearContainer");
    const yearIndicator = document.getElementById("yearIndicator");
    if (!yearContainer || !yearIndicator) return;

    let isTouchDragging = false;
    let tapCandidate = null;

    yearIndicator.addEventListener("touchstart", (e) => {
        if (!isMobileLayout() || hasFocusedWord()) return;
        if (e.touches.length !== 1) {
            isTouchDragging = false;
            tapCandidate = null;
            return;
        }
        const touch = e.touches[0];
        if (!touch) return;
        isTouchDragging = true;
        tapCandidate = null;
        e.preventDefault();
        dispatchMouseEvent(yearIndicator, "mousedown", touch);
    }, { passive: false });

    yearContainer.addEventListener("touchstart", (e) => {
        if (!isMobileLayout() || hasFocusedWord()) return;
        if (e.touches.length !== 1) {
            tapCandidate = null;
            return;
        }
        if (e.target === yearIndicator || yearIndicator.contains(e.target)) return;
        const touch = e.touches[0];
        if (!touch) return;
        tapCandidate = { x: touch.clientX, y: touch.clientY };
        e.preventDefault();
    }, { passive: false });

    window.addEventListener("touchmove", (e) => {
        if (!isTouchDragging) return;
        if (e.touches.length !== 1) {
            window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
            isTouchDragging = false;
            tapCandidate = null;
            return;
        }
        const touch = e.touches[0];
        if (!touch) return;
        e.preventDefault();
        dispatchMouseEvent(window, "mousemove", touch);
    }, { passive: false });

    window.addEventListener("touchend", (e) => {
        if (isTouchDragging) {
            if (e.touches.length > 0) {
                return;
            }
            const touch = e.changedTouches[0];
            if (touch) {
                dispatchMouseEvent(window, "mouseup", touch);
            } else {
                window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
            }
            isTouchDragging = false;
            e.preventDefault();
            syncYearMenuVisibility();
            return;
        }

        if (!isMobileLayout() || hasFocusedWord() || !tapCandidate) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        const moved = Math.hypot(touch.clientX - tapCandidate.x, touch.clientY - tapCandidate.y);
        if (moved <= 8) {
            e.preventDefault();
            dispatchMouseEvent(yearContainer, "click", touch);
        }
        tapCandidate = null;
    }, { passive: false });

    window.addEventListener("touchcancel", () => {
        if (isTouchDragging) {
            window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
        }
        isTouchDragging = false;
        tapCandidate = null;
    });
}

function initMobileInteractions() {
    initMobileYearTouchBridge();
    syncYearMenuVisibility();
    window.addEventListener("resize", syncYearMenuVisibility);
    document.addEventListener("word-focus-change", syncYearMenuVisibility);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileInteractions, { once: true });
} else {
    initMobileInteractions();
}
