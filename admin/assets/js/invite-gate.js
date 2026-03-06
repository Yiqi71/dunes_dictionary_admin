const INVITE_OK_KEY = "dunes_invite_verified_v1";
const INVITE_CODE_KEY = "dunes_invite_code_v1";
const DEVICE_ID_KEY = "dunes_invite_device_id_v1";
const SUCCESS_HOLD_MS = 2000;
const FADE_OUT_MS = 700;
const ENTRY_READY_EVENT = "dunes:entry-ready";

let entryReadyNotified = false;

const API_BASE = (() => {
    const injected = (typeof window !== "undefined" && window.DD_API_BASE) ? String(window.DD_API_BASE).trim() : "";
    if (injected) return injected.replace(/\/+$/, "");
    const host = (typeof location !== "undefined" && location.hostname) ? location.hostname : "";
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3000";
    return "https://api.dunes-dictionary.com";
})();

function buildApiUrl(path) {
    return `${API_BASE}${path}`;
}

function normalizeInviteCode(value) {
    return String(value || "").trim().toUpperCase();
}

function normalizeDeviceId(value) {
    return String(value || "").trim().toLowerCase();
}

function createDeviceId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID().toLowerCase();
    }
    const rand = () => Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${rand()}-${rand()}`.toLowerCase();
}

function getOrCreateDeviceId() {
    try {
        const stored = normalizeDeviceId(localStorage.getItem(DEVICE_ID_KEY));
        if (/^[a-z0-9-]{16,128}$/.test(stored)) {
            return stored;
        }
        const next = createDeviceId();
        localStorage.setItem(DEVICE_ID_KEY, next);
        return next;
    } catch (_) {
        return createDeviceId();
    }
}

function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = type ? type : "";
}

async function verifyInvite(code, deviceId, options = {}) {
    const legacyCached = Boolean(options.legacyCached);
    const response = await fetch(buildApiUrl("/api/invite/verify"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            code,
            device_id: deviceId,
            legacy_cached: legacyCached
        })
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch (_) {
        payload = null;
    }

    if (!response.ok || !payload || payload.ok !== true || payload.allowed !== true) {
        const err = new Error((payload && payload.message) ? payload.message : "邀请码验证失败");
        err.code = payload && payload.error ? payload.error : "verify_failed";
        throw err;
    }

    return payload;
}

function notifyEntryReady(source) {
    if (entryReadyNotified) return;
    entryReadyNotified = true;
    window.dispatchEvent(new CustomEvent(ENTRY_READY_EVENT, {
        detail: { source: source || "unknown", at: Date.now() }
    }));
}

function hideGate(gate, source = "unknown") {
    if (!gate) return;
    gate.classList.add("is-hidden");
    notifyEntryReady(source);
}

function showSuccessOverlay(gate, input, submit, message) {
    input.disabled = true;
    submit.disabled = true;
    setMessage(message, "", "");
    gate.classList.add("is-success");

    window.setTimeout(() => {
        gate.classList.add("is-fading");
        window.setTimeout(() => {
            hideGate(gate, "invite-verified");
        }, FADE_OUT_MS);
    }, SUCCESS_HOLD_MS);
}

function ensureSuccessTitle(gate) {
    let title = gate.querySelector(".invite-success-title");
    if (title) return;

    title = document.createElement("h1");
    title.className = "invite-success-title";
    title.textContent = "欢迎进入沙丘词典";
    gate.appendChild(title);
}

function initInviteGate() {
    const gate = document.getElementById("invite-gate");
    const form = document.getElementById("invite-form");
    const input = document.getElementById("invite-input");
    const submit = document.getElementById("invite-submit");
    const message = document.getElementById("invite-message");

    if (!gate || !form || !input || !submit || !message) {
        notifyEntryReady("no-gate");
        return;
    }

    ensureSuccessTitle(gate);
    const deviceId = getOrCreateDeviceId();
    let unlocking = false;

    const clearLocalVerify = () => {
        try {
            localStorage.removeItem(INVITE_OK_KEY);
            localStorage.removeItem(INVITE_CODE_KEY);
        } catch (_) {
            // ignore
        }
    };

    const verifyAndUnlock = async (code, options = {}) => {
        const silent = Boolean(options.silent);
        unlocking = true;
        submit.disabled = true;
        input.disabled = true;
        if (!silent) {
            setMessage(message, "正在验证邀请码...", "");
        }

        try {
            await verifyInvite(code, deviceId, {
                legacyCached: silent
            });
            try {
                localStorage.setItem(INVITE_OK_KEY, "true");
                localStorage.setItem(INVITE_CODE_KEY, code);
            } catch (_) {
                setMessage(message, "本地存储不可用，无法保存验证状态", "error");
                unlocking = false;
                submit.disabled = false;
                input.disabled = false;
                return;
            }
            showSuccessOverlay(gate, input, submit, message);
        } catch (err) {
            clearLocalVerify();
            input.disabled = false;
            submit.disabled = false;
            unlocking = false;
            const text = (err && err.message) ? err.message : "邀请码验证失败，请稍后重试";
            setMessage(message, text, "error");
            if (!silent) {
                input.focus();
            }
        }
    };

    try {
        const cachedOk = localStorage.getItem(INVITE_OK_KEY) === "true";
        const cachedCode = normalizeInviteCode(localStorage.getItem(INVITE_CODE_KEY));
        if (cachedOk && /^DUNES-[A-Z0-9]{4}$/.test(cachedCode)) {
            input.value = cachedCode;
            verifyAndUnlock(cachedCode, { silent: true });
            return;
        }
    } catch (_) {
        // ignore and continue with invite form
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (unlocking) return;

        const code = normalizeInviteCode(input.value);
        input.value = code;

        if (!/^DUNES-[A-Z0-9]{4}$/.test(code)) {
            setMessage(message, "格式不正确，请输入 DUNES-XXXX", "error");
            return;
        }

        verifyAndUnlock(code);
    });
}

initInviteGate();
