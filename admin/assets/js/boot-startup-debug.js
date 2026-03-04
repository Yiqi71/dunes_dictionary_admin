(function () {
    if (window.__DD_BOOT_STARTUP_DEBUG__) return;
    window.__DD_BOOT_STARTUP_DEBUG__ = true;

    var MAX_LINES = 14;
    var lines = [];
    var panel = null;
    var lastProgressValue = null;
    var lastProgressLabel = "";
    var bootDone = false;

    function toText(value) {
        if (value === null || value === undefined) return "";
        if (typeof value === "string") return value;
        if (value && value.message) return String(value.message);
        try {
            return JSON.stringify(value);
        } catch (_) {
            return String(value);
        }
    }

    function ensurePanel() {
        if (panel) return panel;
        panel = document.createElement("pre");
        panel.id = "boot-startup-debug";
        panel.style.position = "fixed";
        panel.style.left = "12px";
        panel.style.right = "12px";
        panel.style.bottom = "12px";
        panel.style.zIndex = "100001";
        panel.style.margin = "0";
        panel.style.padding = "10px 12px";
        panel.style.maxHeight = "40vh";
        panel.style.overflow = "auto";
        panel.style.whiteSpace = "pre-wrap";
        panel.style.wordBreak = "break-word";
        panel.style.fontSize = "12px";
        panel.style.lineHeight = "1.35";
        panel.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        panel.style.background = "rgba(70, 16, 16, 0.92)";
        panel.style.color = "#FFE8E8";
        panel.style.border = "1px solid rgba(255,255,255,0.2)";
        panel.style.borderRadius = "8px";
        panel.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
        panel.style.display = "block";
        panel.setAttribute("aria-live", "polite");
        panel.setAttribute("role", "status");
        if (document.body) {
            document.body.appendChild(panel);
        } else {
            document.addEventListener(
                "DOMContentLoaded",
                function () {
                    if (document.body && panel && !panel.parentNode) {
                        document.body.appendChild(panel);
                        renderPanel();
                    }
                },
                { once: true }
            );
            document.documentElement.appendChild(panel);
        }
        return panel;
    }

    function pushLine(message) {
        var msg = toText(message);
        if (!msg) return;
        var stamp = new Date().toISOString().slice(11, 23);
        lines.push("[" + stamp + "] " + msg);
        if (lines.length > MAX_LINES) lines = lines.slice(lines.length - MAX_LINES);
        renderPanel();
    }

    function renderPanel() {
        var el = ensurePanel();
        var head = "Startup Debug (always on)";
        if (lastProgressValue !== null) {
            head += "\nBoot progress: " + String(lastProgressValue) + "%";
            if (lastProgressLabel) head += " (" + lastProgressLabel + ")";
        } else {
            head += "\nBoot progress: <no event>";
        }
        el.textContent = head + "\n\n" + lines.join("\n");
    }

    function showLine(message) {
        pushLine(message);
        var bootText = document.getElementById("boot-progress-text");
        if (bootText) {
            bootText.textContent = "Startup error: " + message;
            bootText.style.color = "#8B0000";
        }
    }

    function describeWindowError(event) {
        if (!event) return "Unknown error event";

        if (event.target && event.target !== window) {
            var target = event.target;
            var tag = target.tagName ? String(target.tagName).toLowerCase() : "resource";
            var src = target.src || target.href || target.currentSrc || "";
            return "Resource load error (" + tag + "): " + src;
        }

        var msg = toText(event.message) || "Unknown runtime error";
        var file = toText(event.filename);
        var line = event.lineno || 0;
        var col = event.colno || 0;
        if (file) {
            return msg + " @ " + file + ":" + line + ":" + col;
        }
        return msg;
    }

    function describeRejection(reason) {
        var text = toText(reason);
        if (!text) text = "Unknown promise rejection";
        return "Unhandled rejection: " + text;
    }

    window.addEventListener(
        "error",
        function (event) {
            showLine(describeWindowError(event));
        },
        true
    );

    window.addEventListener(
        "unhandledrejection",
        function (event) {
            showLine(describeRejection(event && event.reason));
        },
        true
    );

    window.addEventListener("DOMContentLoaded", function () {
        pushLine("DOMContentLoaded");
    });

    window.addEventListener("load", function () {
        pushLine("window.load");
    });

    window.addEventListener(
        "dunes:boot-progress",
        function (event) {
            var detail = event && event.detail ? event.detail : {};
            var value = Number(detail.value);
            if (isFinite(value)) lastProgressValue = Math.round(value);
            lastProgressLabel = toText(detail.label);
            pushLine("boot-progress event: " + toText(lastProgressValue) + "% " + lastProgressLabel);
            if (lastProgressValue >= 100) bootDone = true;
        },
        true
    );

    window.setTimeout(function () {
        if (bootDone) return;
        pushLine("watchdog(8s): still not ready; app may be blocked before entry flow");
    }, 8000);

    window.setTimeout(function () {
        if (bootDone) return;
        pushLine("watchdog(15s): still stuck; likely early runtime failure or blocked module/resource");
    }, 15000);

    window.__DD_BOOT_DEBUG_REPORT__ = function (message) {
        pushLine("manual: " + toText(message));
    };

    pushLine("boot-startup-debug loaded");
})();
