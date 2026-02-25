const INVITE_OK_KEY = "dunes_invite_verified_v1";
const INVITE_CODE_KEY = "dunes_invite_code_v1";
const CODES_URL = "assets/data/invite-codes.json";
const SUCCESS_HOLD_MS = 2000;
const FADE_OUT_MS = 700;
const ENTRY_READY_EVENT = "dunes:entry-ready";

let entryReadyNotified = false;

function normalizeInviteCode(value) {
    return String(value || "").trim().toUpperCase();
}

function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = type ? type : "";
}

async function loadCodes() {
    const response = await fetch(CODES_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("failed_to_load_codes");
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.codes)) {
        throw new Error("invalid_code_payload");
    }
    return new Set(payload.codes.map(normalizeInviteCode));
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

    try {
        if (localStorage.getItem(INVITE_OK_KEY) === "true") {
            hideGate(gate, "invite-cached");
            return;
        }
    } catch (_) {
        // ignore and continue with invite form
    }

    let codeSet = null;
    let loading = false;
    let unlocking = false;

    const ensureCodes = async () => {
        if (codeSet) return codeSet;
        if (loading) return null;

        loading = true;
        submit.disabled = true;
        setMessage(message, "正在加载邀请码...", "");
        try {
            codeSet = await loadCodes();
            setMessage(message, "", "");
            return codeSet;
        } catch (_) {
            setMessage(message, "邀请码列表加载失败，请稍后刷新重试", "error");
            return null;
        } finally {
            loading = false;
            if (!unlocking) {
                submit.disabled = false;
            }
        }
    };

    ensureCodes();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (unlocking) return;

        const code = normalizeInviteCode(input.value);
        input.value = code;

        if (!/^DUNES-[A-Z0-9]{4}$/.test(code)) {
            setMessage(message, "格式不正确，请输入 DUNES-XXXX", "error");
            return;
        }

        const set = await ensureCodes();
        if (!set) return;

        if (!set.has(code)) {
            setMessage(message, "邀请码无效", "error");
            return;
        }

        try {
            localStorage.setItem(INVITE_OK_KEY, "true");
            localStorage.setItem(INVITE_CODE_KEY, code);
        } catch (_) {
            setMessage(message, "本地存储不可用，无法保存验证状态", "error");
            return;
        }

        unlocking = true;
        showSuccessOverlay(gate, input, submit, message);
    });
}

initInviteGate();
