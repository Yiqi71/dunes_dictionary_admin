const fs = require("fs/promises");
const path = require("path");
const OpenAI = require("openai");

const DATA_FILE = path.join(__dirname, "..", "..", "content", "visitor-upload-words.json");
const LOG_FILE = path.join(__dirname, "..", "..", "content", "visitor-upload-blocked.json");
const DENYLIST_FILE = path.join(__dirname, "..", "data", "visitor_word_denylist.json");

let denylistCache = null;
let openaiClient = null;

function normalizeLooseText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeCompactText(value) {
  return normalizeLooseText(value).replace(/[\s\W]+/g, "");
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

function getOpenAIClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

async function moderateVisitorWordWithAI(rawWord) {
  const client = getOpenAIClient();
  if (!client) {
    return { allowed: true, reason: "ai_not_configured", skipped: true };
  }

  const moderation = await client.moderations.create({
    model: "omni-moderation-latest",
    input: rawWord
  });

  const result = moderation && Array.isArray(moderation.results) ? moderation.results[0] : null;
  const categories = result && result.categories ? result.categories : {};
  const flagged = Boolean(result && result.flagged);
  const blocked =
    flagged &&
    Boolean(
      categories.harassment ||
      categories["harassment/threatening"] ||
      categories.hate ||
      categories["hate/threatening"] ||
      categories["sexual/minors"] ||
      categories.sexual
    );

  return {
    allowed: !blocked,
    reason: blocked ? "ai_flagged" : "ok",
    skipped: false,
    flagged,
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
