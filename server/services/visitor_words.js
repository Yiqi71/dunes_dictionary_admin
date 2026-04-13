const crypto = require("crypto");
const fs = require("fs/promises");
const https = require("https");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "..", "content", "visitor-upload-words.json");
const LOG_FILE = path.join(__dirname, "..", "..", "content", "visitor-upload-blocked.json");
const DENYLIST_FILE = path.join(__dirname, "..", "data", "visitor_word_denylist.json");

const TMS_ACTION = "TextModeration";
const TMS_VERSION = "2020-12-29";
const TMS_SERVICE = "tms";
const TMS_HOST = "tms.tencentcloudapi.com";
const TMS_ENDPOINT = `https://${TMS_HOST}`;

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

function getTencentCloudCredentials() {
  return {
    secretId: String(process.env.TENCENTCLOUD_SECRET_ID || "").trim(),
    secretKey: String(process.env.TENCENTCLOUD_SECRET_KEY || "").trim(),
    region: String(process.env.TENCENTCLOUD_REGION || "ap-beijing").trim(),
    bizType: String(process.env.TENCENTCLOUD_TMS_BIZ_TYPE || "TencentCloudDefault").trim()
  };
}

function hasTencentCloudCredentials() {
  const { secretId, secretKey } = getTencentCloudCredentials();
  return Boolean(secretId && secretKey);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function buildTencentCloudAuthorization({ secretId, secretKey, timestamp, date, payload }) {
  const algorithm = "TC3-HMAC-SHA256";
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${TMS_HOST}\nx-tc-action:${TMS_ACTION.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload)
  ].join("\n");

  const credentialScope = `${date}/${TMS_SERVICE}/tc3_request`;
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");

  const secretDate = crypto.createHmac("sha256", `TC3${secretKey}`).update(date, "utf8").digest();
  const secretService = crypto.createHmac("sha256", secretDate).update(TMS_SERVICE, "utf8").digest();
  const secretSigning = crypto.createHmac("sha256", secretService).update("tc3_request", "utf8").digest();
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");

  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
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

async function moderateVisitorWordWithAI(rawWord) {
  const { secretId, secretKey, region, bizType } = getTencentCloudCredentials();
  if (!secretId || !secretKey) {
    console.log("[visitor-words] Tencent moderation skipped: missing credentials");
    return { allowed: true, reason: "ai_not_configured", skipped: true };
  }

  console.log("[visitor-words] Tencent moderation request started");

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const requestBody = {
      Content: Buffer.from(String(rawWord || ""), "utf8").toString("base64"),
      BizType: bizType || "TencentCloudDefault",
      DataId: `visitor-${timestamp}`,
      SourceLanguage: "zh",
      Type: "TEXT"
    };
    const payload = JSON.stringify(requestBody);
    const authorization = buildTencentCloudAuthorization({
      secretId,
      secretKey,
      timestamp,
      date,
      payload
    });

    const response = await postJson(TMS_ENDPOINT, requestBody, {
      Authorization: authorization,
      Host: TMS_HOST,
      "X-TC-Action": TMS_ACTION,
      "X-TC-Version": TMS_VERSION,
      "X-TC-Region": region,
      "X-TC-Timestamp": String(timestamp)
    });

    const responseData = response.body && response.body.Response ? response.body.Response : null;
    if (response.statusCode >= 400 || (responseData && responseData.Error)) {
      console.log("[visitor-words] Tencent moderation request failed", {
        statusCode: response.statusCode,
        error: responseData && responseData.Error ? responseData.Error : response.body || response.raw || null
      });
      return { allowed: true, reason: "ai_request_failed", skipped: true };
    }

    const suggestion = String(responseData && responseData.Suggestion ? responseData.Suggestion : "Pass");
    const blocked = suggestion === "Block" || suggestion === "Review";
    const categories = {
      label: responseData && responseData.Label ? responseData.Label : "Normal",
      subLabel: responseData && responseData.SubLabel ? responseData.SubLabel : "",
      suggestion,
      score: typeof (responseData && responseData.Score) === "number" ? responseData.Score : null,
      keywords: Array.isArray(responseData && responseData.Keywords) ? responseData.Keywords : []
    };

    if (blocked) {
      console.log("[visitor-words] Tencent moderation blocked prompt", categories);
    } else {
      console.log("[visitor-words] Tencent moderation allowed prompt", categories);
    }

    return {
      allowed: !blocked,
      reason: blocked ? "ai_flagged" : "ok",
      skipped: false,
      flagged: blocked,
      categories
    };
  } catch (error) {
    console.log("[visitor-words] Tencent moderation request error", {
      message: error && error.message ? error.message : String(error || "unknown_error")
    });
    return { allowed: true, reason: "ai_request_failed", skipped: true };
  }
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
  hasTencentCloudCredentials,
  logBlockedVisitorWord,
  moderateVisitorWord,
  moderateVisitorWordWithAI,
  saveVisitorWord
};
