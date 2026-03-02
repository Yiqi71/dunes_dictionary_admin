import { state } from "./state.js";

const ZOOM_WHEEL_STEP = 0.28;
const MIN_SCALE = 3;

export function getMinScaleForCurrentPath(pathname = window.location.pathname) {
    return MIN_SCALE;
}

export function getScaleFromSliderPercent(percent) {
    const minScale = getMinScaleForCurrentPath();
    const maxScale = state.scaleThreshold;
    return (percent * (maxScale - minScale)) / 100 + minScale;
}

export function getIndicatorScaleValue(scaleValue, scaleThreshold = state.scaleThreshold) {
    const minScale = getMinScaleForCurrentPath();
    const clamped = Math.min(scaleThreshold, Math.max(minScale, scaleValue));
    return (clamped - minScale) * 4 / (scaleThreshold - minScale) + 1;
}

export function getIndicatorPercent(scaleValue) {
    return (scaleValue - 1) * 25;
}

export function clampIndicatorScaleValue(scaleValue) {
    if (scaleValue < 1) return 1;
    if (scaleValue > 5) return 5;
    return scaleValue;
}

export function getLinearNodeScaleFactor(scaleValue, scaleThreshold = state.scaleThreshold) {
    const indicatorScale = clampIndicatorScaleValue(
        getIndicatorScaleValue(scaleValue, scaleThreshold)
    );
    return indicatorScale / 5;
}

export function updateScaleForNodes(newScale) {
    const factor = getLinearNodeScaleFactor(newScale);
    document.body.dataset.scale = "5";
    document.body.style.setProperty("--word-node-scale-factor", String(factor));
}

export function resolveWheelScale(scale, deltaY, options = {}) {
    const minScale = options.minScale ?? getMinScaleForCurrentPath();
    const maxScale = options.maxScale ?? state.scaleThreshold;
    const zoomStep = options.zoomStep ?? ZOOM_WHEEL_STEP;

    const delta = deltaY > 0 ? -zoomStep : zoomStep;
    const newScale = Math.min(maxScale, Math.max(minScale, scale + delta));

    return { delta, newScale };
}
