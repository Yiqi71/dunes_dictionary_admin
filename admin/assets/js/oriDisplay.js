function normalizeLangForOri(code) {
    const v = (code || "").toLowerCase();
    return v.startsWith("zh") ? "zh" : "en";
}

export function getDisplayOriText(ori, lang, zhMainText = "") {
    const rawOri = String(ori || "").trim();
    if (!rawOri) return "";
    const rawZhMain = String(zhMainText || "").trim();
    if (normalizeLangForOri(lang) === "zh" && rawZhMain && rawOri === rawZhMain) return "";
    return rawOri;
}
