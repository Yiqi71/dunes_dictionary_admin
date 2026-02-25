const PROGRESS_EVENT = "dunes:boot-progress";

const root = document.getElementById("boot-progress");
const indicator = document.getElementById("boot-progress-indicator");
const text = document.getElementById("boot-progress-text");
const body = document.body;

if (root && indicator && text) {
    let shown = 6;
    let done = false;
    let revealTimer = null;

    if (body) {
        body.classList.add("boot-pending");
    }

    const finishBoot = () => {
        if (done) return;
        done = true;
        if (body) body.classList.remove("boot-pending");
        root.classList.add("is-fading");
        window.setTimeout(() => {
            root.remove();
        }, 520);
    };

    const apply = (value, label) => {
        shown = Math.max(shown, Math.min(100, Math.round(value)));
        indicator.style.left = `${shown}%`;
        text.textContent = label || "Loading";

        if (shown >= 100 && !done) {
            if (revealTimer) window.clearTimeout(revealTimer);
            revealTimer = window.setTimeout(() => {
                finishBoot();
            }, 260);
        }
    };

    apply(shown, "Loading");

    window.addEventListener(PROGRESS_EVENT, (event) => {
        const detail = event && event.detail ? event.detail : {};
        apply(detail.value, detail.label);
    });

    window.setTimeout(() => apply(14, "Initializing"), 120);
    window.setTimeout(() => apply(24, "Preparing"), 800);
}
