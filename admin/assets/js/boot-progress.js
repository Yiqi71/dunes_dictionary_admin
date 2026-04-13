const PROGRESS_EVENT = "dunes:boot-progress";

const root = document.getElementById("boot-progress");
const indicator = document.getElementById("boot-progress-indicator");
const text = document.getElementById("boot-progress-text");
const body = document.body;

if (root && indicator && text) {
    let shown = 6;
    let done = false;
    let revealTimer = null;
    let progressDone = false;
    let stylesDone = false;

    if (body) {
        body.classList.add("boot-pending");
    }

    const waitForStylesAndFonts = async () => {
        const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        const styleTasks = styleLinks.map((link) => new Promise((resolve) => {
            if (link.sheet) {
                resolve();
                return;
            }
            const settle = () => resolve();
            link.addEventListener("load", settle, { once: true });
            link.addEventListener("error", settle, { once: true });
        }));

        if (styleTasks.length > 0) {
            await Promise.all(styleTasks);
        }

        if (document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready;
            } catch (_) {
                // ignore
            }
        }

        await new Promise((resolve) => {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(resolve);
            });
        });
    };

    const finishBoot = () => {
        if (done) return;
        done = true;
        if (body) body.classList.remove("boot-pending");
        root.classList.add("is-fading");
        window.setTimeout(() => {
            root.remove();
        }, 520);
    };

    const maybeFinishBoot = () => {
        if (done || !progressDone || !stylesDone) return;
        finishBoot();
    };

    const apply = (value, label) => {
        shown = Math.max(shown, Math.min(100, Math.round(value)));
        indicator.style.left = `${shown}%`;
        text.textContent = label || "Loading";

        if (shown >= 100 && !done && !progressDone) {
            progressDone = true;
            if (revealTimer) window.clearTimeout(revealTimer);
            revealTimer = window.setTimeout(() => {
                maybeFinishBoot();
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

    waitForStylesAndFonts().then(() => {
        stylesDone = true;
        maybeFinishBoot();
    });
}
