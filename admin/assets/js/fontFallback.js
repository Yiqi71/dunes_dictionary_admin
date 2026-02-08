const fontReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready.catch(() => {})
    : Promise.resolve();

const fallbackCache = new Map();
const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

const nonLatinRegex = (() => {
    try {
        return /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\p{Number}\p{Punctuation}\p{Separator}]/u;
    } catch (e) {
        return /[^\u0000-\u00ff]/;
    }
})();

const cyrillicRegex = (() => {
    try {
        return /\p{Script=Cyrillic}/u;
    } catch (e) {
        return /[\u0400-\u04ff\u0500-\u052f\u2de0-\u2dff\ua640-\ua69f]/;
    }
})();

function measureWidth(text, fontFamily) {
    measureCtx.font = `32px ${fontFamily}`;
    return measureCtx.measureText(text).width;
}

function shouldFallbackStint(text) {
    const content = (text || "").trim();
    if (!content) return false;
    if (fallbackCache.has(content)) return fallbackCache.get(content);

    let fallback = false;
    if (document.fonts && document.fonts.check) {
        const loaded = document.fonts.check(`16px "Stint Ultra Condensed"`, content);
        if (!loaded) fallback = true;
    }

    if (!fallback) {
        const hasNonLatin = nonLatinRegex.test(content);
        if (cyrillicRegex.test(content)) {
            fallback = true;
        }
        const stintWidth = measureWidth(
            content,
            `"Stint Ultra Condensed", "Barlow Condensed", "ChillDIN", sans-serif`
        );
        const barlowWidth = measureWidth(
            content,
            `"Barlow Condensed", "ChillDIN", sans-serif`
        );
        if (stintWidth === barlowWidth && hasNonLatin) {
            fallback = true;
        }
    }

    fallbackCache.set(content, fallback);
    return fallback;
}

function applyFallbackNow(el) {
    const text = (el?.textContent || "").trim();
    if (!text) {
        if (el) el.style.fontFamily = "";
        return;
    }
    if (shouldFallbackStint(text)) {
        el.style.fontFamily = `"Barlow Condensed", "ChillDIN", sans-serif`;
    } else {
        el.style.fontFamily = "";
    }
}

export function applyStintFallbackToElement(el) {
    if (!el) return;
    fontReady.then(() => applyFallbackNow(el));
}

export function applyStintFallbackIn(root) {
    if (!root) return;
    const elements = root.querySelectorAll(".term-ori");
    if (!elements.length) return;
    fontReady.then(() => {
        elements.forEach((el) => applyFallbackNow(el));
    });
}
