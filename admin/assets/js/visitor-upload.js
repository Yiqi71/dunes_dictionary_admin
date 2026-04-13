import { state } from "./state.js";
import { zoomToWord, updateWordFocus } from "./wordFocus.js";
import { renderPanelSections } from "./detail.js";

const API_BASE = (() => {
    const injected = (typeof window !== "undefined" && window.DD_API_BASE) ? String(window.DD_API_BASE).trim() : "";
    if (injected) return injected.replace(/\/+$/, "");
    const host = (typeof location !== "undefined" && location.hostname) ? location.hostname : "";
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3000";
    return "https://api.dunes-dictionary.com";
})();

function normalizeLang(code) {
    const value = (code || "").toLowerCase();
    return value.startsWith("en") ? "en" : "zh";
}

function getStatusCopy(status, lang) {
    const copy = {
        zh: {
            submitting: "测试词条提交中...",
            success: "提交完成，正在聚焦到测试词条。",
            empty: "请先输入一个词。",
            notAllowed: "该词不适合公开提交。",
            missingEndpoint: "测试中：上传接口暂未开放。",
            error: "提交失败，请稍后再试。"
        },
        en: {
            submitting: "Submitting test word...",
            success: "Submitted. Focusing on the test word.",
            empty: "Please enter a word first.",
            notAllowed: "This word is not allowed for public submission.",
            missingEndpoint: "Testing in progress: upload endpoint is not available yet.",
            error: "Submission failed. Please try again later."
        }
    };

    const dict = lang === "en" ? copy.en : copy.zh;
    if (status === "submitting") return dict.submitting;
    if (status === "success") return dict.success;
    if (status === "empty") return dict.empty;
    if (status === "not-allowed") return dict.notAllowed;
    if (status === "missing-endpoint") return dict.missingEndpoint;
    return dict.error;
}

function setProgressState(progressEl, active) {
    if (!progressEl) return;
    progressEl.classList.toggle("is-hidden", !active);
    progressEl.setAttribute("aria-hidden", active ? "false" : "true");
}

async function focusVisitorWord(word) {
    if (!word?.id) return;
    state.focusedNodeId = word.id;
    await zoomToWord(word.id, state.scaleThreshold, { animated: true, duration: 920 });
    updateWordFocus(word.id);
    renderPanelSections();
}

async function handleSubmit(event) {
    event.preventDefault();

    const input = document.getElementById("visitor-word-input");
    const submitButton = document.getElementById("visitor-upload-submit");
    const statusEl = document.getElementById("visitor-upload-status");
    const progressEl = document.getElementById("visitor-upload-progress");
    const lang = normalizeLang(document.documentElement.lang || state.currentLang || "zh");
    const rawWord = String(input?.value || "").trim();

    if (!rawWord) {
        if (statusEl) statusEl.textContent = getStatusCopy("empty", lang);
        return;
    }

    if (statusEl) statusEl.textContent = getStatusCopy("submitting", lang);
    if (submitButton) submitButton.disabled = true;
    if (input) input.disabled = true;
    setProgressState(progressEl, true);

    try {
        const response = await fetch(`${API_BASE}/api/visitor-words`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ word: rawWord })
        });

        if (response.status === 404 || response.status === 501) {
            throw new Error("missing-endpoint");
        }
        if (response.status === 422) {
            throw new Error("not-allowed");
        }
        if (!response.ok) {
            throw new Error(`submit-failed-${response.status}`);
        }

        const payload = await response.json();
        const incomingWord = payload?.word || payload?.data || payload;
        if (!incomingWord || typeof window.__DD_ADD_VISITOR_WORD__ !== "function") {
            throw new Error("missing-endpoint");
        }

        const visitorWord = await window.__DD_ADD_VISITOR_WORD__(incomingWord);
        if (statusEl) statusEl.textContent = getStatusCopy("success", lang);
        if (input) input.value = "";
        await focusVisitorWord(visitorWord);
    } catch (error) {
        const statusKey = error?.message === "missing-endpoint"
            ? "missing-endpoint"
            : (error?.message === "not-allowed" ? "not-allowed" : "error");
        if (statusEl) statusEl.textContent = getStatusCopy(statusKey, lang);
        console.error("visitor upload failed:", error);
    } finally {
        if (submitButton) submitButton.disabled = false;
        if (input) input.disabled = false;
        setProgressState(progressEl, false);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("visitor-upload-form");
    if (!form) return;
    form.addEventListener("submit", handleSubmit);
});
