const fs = require("fs/promises");
const https = require("https");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "..", "content", "visitor-upload-words.json");
const LOG_FILE = path.join(__dirname, "..", "..", "content", "visitor-upload-blocked.json");
const DENYLIST_FILE = path.join(__dirname, "..", "data", "visitor_word_denylist.json");
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

let denylistCache = null;

function normalizeLooseText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeCompactText(value) {
  return normalizeLooseText(value)
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function getDenylist() {
  if (denylistCache) return denylistCache;

  const raw = require(DENYLIST_FILE);
  denylistCache = {
    zhExact: Array.isArray(raw.zhExact) ? raw.zhExact.map(normalizeCompactText).filter(Boolean) : [],
    zhContains: Array.isArray(raw.zhContains) ? raw.zhContains.map(normalizeCompactText).filter(Boolean) : [],
    enExact: Array.isArray(raw.enExact) ? raw.enExact.map(normalizeCompactText).filter(Boolean) : [],
    enContains: Array.isArray(raw.enContains) ? raw.enContains.map(normalizeCompactText).filter(Boolean) : []
  };
  return denylistCache;
}

function moderateVisitorWord(rawWord) {
  const compact = normalizeCompactText(rawWord);
  if (!compact) {
    return { allowed: false, reason: "empty" };
  }

  const denylist = getDenylist();
  if (denylist.zhExact.includes(compact) || denylist.enExact.includes(compact)) {
    return { allowed: false, reason: "keyword_blocked" };
  }

  if (
    denylist.zhContains.some((keyword) => compact.includes(keyword)) ||
    denylist.enContains.some((keyword) => compact.includes(keyword))
  ) {
    return { allowed: false, reason: "keyword_blocked" };
  }

  return { allowed: true, reason: "ok" };
}

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (_) {
            parsed = null;
          }
          resolve({
            statusCode: res.statusCode || 0,
            body: parsed,
            raw
          });
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function toGeminiCategories(safetyRatings = []) {
  const ratings = Array.isArray(safetyRatings) ? safetyRatings : [];
  const categories = {};

  for (const rating of ratings) {
    const category = String(rating && rating.category ? rating.category : "").toUpperCase();
    const probability = String(rating && rating.probability ? rating.probability : "").toUpperCase();
    if (!category) continue;
    categories[category] = probability || "UNSPECIFIED";
  }

  return categories;
}

async function moderateVisitorWordWithAI(rawWord) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { allowed: true, reason: "ai_not_configured", skipped: true };
  }

  const url = `${GEMINI_ENDPOINT_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: rawWord }]
      }
    ],
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_LOW_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_LOW_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_LOW_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_ONLY_HIGH"
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1
    }
  };

  const response = await postJson(url, payload);
  if (response.statusCode >= 400) {
    throw new Error(`gemini_request_failed_${response.statusCode}`);
  }

  const promptFeedback = response.body && response.body.promptFeedback ? response.body.promptFeedback : null;
  const blockReason = String(promptFeedback && promptFeedback.blockReason ? promptFeedback.blockReason : "").trim();
  const categories = toGeminiCategories(promptFeedback && promptFeedback.safetyRatings);
  const blocked = Boolean(blockReason);

  return {
    allowed: !blocked,
    reason: blocked ? "ai_flagged" : "ok",
    skipped: false,
    flagged: blocked,
    categories
  };
}

function buildVisitorWord(rawWord) {
  const now = new Date();
  const submittedAt = now.toISOString();

  return {
    id: `visitor-${now.getTime()}`,
    term: {
      zh: rawWord,
      en: rawWord
    },
    termOri: rawWord,
    source: {
      zh: "未知",
      en: "Unknown"
    },
    proposing_country: null,
    proposing_time: null,
    isVisitorWord: true,
    status: "not reviewed",
    brief_definition: {
      zh: "访客提交词条，待补充释义。",
      en: "Visitor-submitted term. Definition pending."
    },
    extended_definition: {
      zh: ["待补充。"],
      en: ["Pending."]
    },
    example_sentence: {
      zh: ["待补充。"],
      en: ["Pending."]
    },
    proposers: [],
    related_works: [],
    contributors: [],
    editors: [],
    comments: [],
    submitted_at: submittedAt
  };
}

async function saveVisitorWord(word) {
  let data = { meta: {}, words: [] };

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      data = parsed;
    }
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      throw err;
    }
  }

  data.meta = {
    ...(data.meta && typeof data.meta === "object" ? data.meta : {}),
    updated_at: new Date().toISOString()
  };
  data.words = Array.isArray(data.words) ? data.words : [];
  data.words.push(word);

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function logBlockedVisitorWord(rawWord, details = {}) {
  let data = { meta: {}, items: [] };

  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      data = parsed;
    }
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      throw err;
    }
  }

  const item = {
    raw_word: String(rawWord || ""),
    normalized: normalizeCompactText(rawWord),
    blocked_at: new Date().toISOString(),
    source: details.source || "unknown",
    reason: details.reason || "unknown",
    categories: details.categories || null,
    flagged: details.flagged === true
  };

  data.meta = {
    ...(data.meta && typeof data.meta === "object" ? data.meta : {}),
    updated_at: new Date().toISOString()
  };
  data.items = Array.isArray(data.items) ? data.items : [];
  data.items.push(item);

  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.writeFile(LOG_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

module.exports = {
  buildVisitorWord,
  logBlockedVisitorWord,
  moderateVisitorWord,
  moderateVisitorWordWithAI,
  saveVisitorWord
};
