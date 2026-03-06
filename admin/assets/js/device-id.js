export const DEVICE_ID_KEY = "dd_device_id_v1";
const LEGACY_DEVICE_ID_KEYS = ["dunes_device_id_v1", "dd_vote_device_id_v1"];
const DEVICE_ID_PATTERN = /^[a-z0-9-]{16,128}$/;
const LEGACY_DEVICE_ID_PATTERN = /^d_[a-z0-9]+_[a-z0-9]+$/;

function normalizeDeviceId(value) {
    return String(value || "").trim().toLowerCase();
}

export function isValidDeviceId(value) {
    const normalized = normalizeDeviceId(value);
    return DEVICE_ID_PATTERN.test(normalized) || LEGACY_DEVICE_ID_PATTERN.test(normalized);
}

function generateDeviceId() {
    const ts = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 12);
    return `dunes-${ts}-${randomPart}`;
}

function persistDeviceId(id) {
    localStorage.setItem(DEVICE_ID_KEY, id);
}

function readStoredDeviceId() {
    const candidates = [DEVICE_ID_KEY, ...LEGACY_DEVICE_ID_KEYS];
    for (const key of candidates) {
        const raw = localStorage.getItem(key);
        const normalized = normalizeDeviceId(raw);
        if (!isValidDeviceId(normalized)) continue;
        persistDeviceId(normalized);
        return normalized;
    }
    return "";
}

export function getOrCreateDeviceId() {
    try {
        const existing = readStoredDeviceId();
        if (existing) return existing;

        const next = normalizeDeviceId(generateDeviceId());
        if (!isValidDeviceId(next)) return "";
        persistDeviceId(next);
        return next;
    } catch (_) {
        return "";
    }
}
