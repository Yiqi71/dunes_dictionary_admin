import { getOrCreateDeviceId } from "./device-id.js";

const INVITE_OK_KEY = "dunes_invite_verified_v1";
const INVITE_CODE_KEY = "dunes_invite_code_v1";
const DEVICE_ID_KEYS = ["dd_device_id_v1", "dunes_device_id_v1", "dd_vote_device_id_v1"];
const SUCCESS_HOLD_MS = 2000;
const FADE_OUT_MS = 700;
const GATE_FIRST_SHOW_DELAY_MS = 900;
const GATE_REVEAL_SETTLE_MS = 760;
const ENTRY_READY_EVENT = "dunes:entry-ready";

let entryReadyNotified = false;
const STRICT_DEVICE_ID_PATTERN = /^[a-z0-9-]{16,128}$/;

const API_BASE = (() => {
    const injected = (typeof window !== "undefined" && window.DD_API_BASE) ? String(window.DD_API_BASE).trim() : "";
    if (injected) return injected.replace(/\/+$/, "");
    const host = (typeof location !== "undefined" && location.hostname) ? location.hostname : "";
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3000";
    return "https://api.dunes-dictionary.com";
})();

function shouldBypassInviteForLocalDev() {
    if (typeof window === "undefined" || typeof location === "undefined") return false;
    const host = String(location.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function normalizeInviteCode(value) {
    return String(value || "").trim().toUpperCase();
}

function isValidInviteCode(value) {
    return /^DUNES-[A-Z0-9]{4}$/.test(normalizeInviteCode(value));
}

function isValidInviteDeviceId(value) {
    return STRICT_DEVICE_ID_PATTERN.test(String(value || "").trim().toLowerCase());
}

function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = type ? type : "";
}

async function verifyInvite(code, deviceId, options = {}) {
    const legacyCached = Boolean(options.legacyCached);
    const response = await fetch(`${API_BASE}/api/invite/verify`, {
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
    if (!gate) {
        notifyEntryReady(source);
        return;
    }
    gate.classList.add("is-hidden");
    notifyEntryReady(source);
}

function showSuccessOverlay(gate, input, submit, message) {
    gate.style.display = "";
    input.disabled = true;
    submit.disabled = true;
    setMessage(message, "", "");
    gate.classList.remove("is-waiting");
    gate.classList.remove("is-hidden");
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

function ensureGateDom() {
    let gate = document.getElementById("invite-gate");
    if (gate) return gate;

    gate = document.createElement("div");
    gate.id = "invite-gate";
    gate.style.display = "none";
    gate.innerHTML = `
        <div class="invite-card">
            <h1 class="invite-title">输入邀请码</h1>
            <p class="invite-sub">请输入你收到的邀请码后继续访问。</p>
            <form id="invite-form" novalidate>
                <label class="invite-label" for="invite-input">邀请码</label>
                <input id="invite-input" type="text" inputmode="latin" autocomplete="off" placeholder="DUNES-XXXX" />
                <button id="invite-submit" type="submit">进入</button>
                <p id="invite-message" role="status" aria-live="polite"></p>
            </form>
        </div>
    `;
    document.body.appendChild(gate);
    return gate;
}

function resolveDeviceIdWithRepair() {
    let id = getOrCreateDeviceId();
    if (isValidInviteDeviceId(id)) return id;
    try {
        for (const key of DEVICE_ID_KEYS) {
            localStorage.removeItem(key);
        }
    } catch (_) {
        // ignore
    }
    id = getOrCreateDeviceId();
    return isValidInviteDeviceId(id) ? id : "";
}

function initInviteGate() {
    const gate = ensureGateDom();
    const form = document.getElementById("invite-form");
    const input = document.getElementById("invite-input");
    const submit = document.getElementById("invite-submit");
    const message = document.getElementById("invite-message");

    if (!gate || !form || !input || !submit || !message) {
        notifyEntryReady("gate-missing");
        return;
    }

    if (shouldBypassInviteForLocalDev()) {
        hideGate(gate, "invite-bypass-local-dev");
        return;
    }

    gate.style.display = "";
    gate.classList.add("is-waiting");
    gate.classList.remove("is-success", "is-fading", "is-hidden");
    ensureSuccessTitle(gate);

    const showGate = () => {
        gate.style.display = "";
        gate.classList.remove("is-hidden");
        gate.classList.remove("is-fading");
        gate.classList.remove("is-success");
        gate.classList.remove("is-waiting");
        input.disabled = false;
        submit.disabled = false;
        if (!entryReadyNotified) {
            window.setTimeout(() => {
                notifyEntryReady("invite-required");
            }, GATE_REVEAL_SETTLE_MS);
        }
        if (!input.value) input.focus();
    };

    const clearLocalVerify = () => {
        try {
            localStorage.removeItem(INVITE_OK_KEY);
            localStorage.removeItem(INVITE_CODE_KEY);
        } catch (_) {
            // ignore
        }
    };

    let lastKnownDeviceId = resolveDeviceIdWithRepair();

    let unlocking = false;
    const verifyAndUnlock = async (code, options = {}) => {
        const silent = Boolean(options.silent);
        const retryOnInvalidDeviceId = options.retryOnInvalidDeviceId !== false;
        const immediateUnlock = Boolean(options.immediateUnlock);
        unlocking = true;
        submit.disabled = true;
        input.disabled = true;
        if (!silent) {
            setMessage(message, "正在验证邀请码...", "");
        }

        try {
            const currentDeviceId = resolveDeviceIdWithRepair();
            if (!isValidInviteDeviceId(currentDeviceId)) {
                throw Object.assign(new Error("设备标识异常，请刷新后重试"), {
                    code: "invalid_device_id"
                });
            }
            lastKnownDeviceId = currentDeviceId;
            await verifyInvite(code, currentDeviceId, {
                legacyCached: silent
            });
            localStorage.setItem(INVITE_OK_KEY, "true");
            localStorage.setItem(INVITE_CODE_KEY, code);
            unlocking = false;
            if (immediateUnlock) {
                hideGate(gate, "invite-cached");
                return;
            }
            showSuccessOverlay(gate, input, submit, message);
        } catch (err) {
            if (retryOnInvalidDeviceId && err && err.code === "invalid_device_id") {
                lastKnownDeviceId = resolveDeviceIdWithRepair();
                if (isValidInviteDeviceId(lastKnownDeviceId)) {
                    return verifyAndUnlock(code, {
                        silent,
                        immediateUnlock,
                        retryOnInvalidDeviceId: false
                    });
                }
            }
            clearLocalVerify();
            input.disabled = false;
            submit.disabled = false;
            unlocking = false;
            const text = (err && err.message) ? err.message : "邀请码验证失败，请稍后重试";
            setMessage(message, text, "error");
            showGate();
            if (!silent) {
                input.focus();
            }
        }
    };

    try {
        const cachedOk = localStorage.getItem(INVITE_OK_KEY) === "true";
        const cachedCode = normalizeInviteCode(localStorage.getItem(INVITE_CODE_KEY));
        if (cachedOk && isValidInviteCode(cachedCode) && isValidInviteDeviceId(lastKnownDeviceId)) {
            input.value = cachedCode;
            hideGate(gate, "invite-cached-local");
            verifyAndUnlock(cachedCode, { silent: true, immediateUnlock: true });
            return;
        }
        clearLocalVerify();
    } catch (_) {
        // ignore and continue with invite form
    }

    if (!isValidInviteDeviceId(lastKnownDeviceId)) {
        clearLocalVerify();
        window.setTimeout(() => {
            showGate();
            setMessage(message, "设备标识异常，请刷新后重试", "error");
        }, GATE_FIRST_SHOW_DELAY_MS);
    } else {
        window.setTimeout(() => {
            showGate();
        }, GATE_FIRST_SHOW_DELAY_MS);
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (unlocking) return;

        const code = normalizeInviteCode(input.value);
        input.value = code;

        if (!isValidInviteCode(code)) {
            setMessage(message, "格式不正确，请输入 DUNES-XXXX", "error");
            return;
        }

        verifyAndUnlock(code);
    });
}

initInviteGate();
